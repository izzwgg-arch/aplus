/**
 * QuickBooks Online Integration Service
 *
 * OAuth 2.0 flow:
 *   1. GET  /integrations/quickbooks/auth-url  → redirect user to Intuit
 *   2. GET  /integrations/quickbooks/callback  → exchange code for tokens (stored encrypted)
 *   3. All subsequent API calls use stored access token; refresh automatically if expired.
 *
 * Invoice sync flow (called after Sola payment):
 *   syncPaymentToQuickbooks(paymentId)
 *     → syncInvoiceToQuickbooks(invoiceId)       — creates/updates QB Invoice
 *     → creates QB Payment linked to that invoice — marks invoice Paid in QB
 *
 * Intuit API reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting
 */

import { prisma } from "../../../config/prisma.js";
import { env } from "../../../config/env.js";
import {
  getIntegrationAccount,
  getDecryptedTokens,
  upsertIntegrationAccount,
  writeIntegrationSyncLog
} from "../integrationAccountService.js";

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const QB_OAUTH_BASE    = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL     = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_REVOKE_URL    = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QB_SCOPE         = "com.intuit.quickbooks.accounting";
const QB_API_SANDBOX   = "https://sandbox-quickbooks.api.intuit.com/v3/company";
const QB_API_PROD      = "https://quickbooks.api.intuit.com/v3/company";

/* ─── Internal helpers ──────────────────────────────────────────────────────── */

function apiBase(environment) {
  return (environment || "").toUpperCase() === "PRODUCTION" ? QB_API_PROD : QB_API_SANDBOX;
}

function basicAuthHeader() {
  const clientId     = env.quickbooksClientId;
  const clientSecret = env.quickbooksClientSecret;
  if (!clientId || !clientSecret) {
    const err = new Error("QuickBooks credentials (QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET) are not configured");
    err.status = 500;
    throw err;
  }
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/**
 * Make an authenticated request to the QuickBooks API.
 * Automatically refreshes the access token if expired.
 */
async function qbFetch(path, { method = "GET", body, account: acct } = {}) {
  const account = acct || await getIntegrationAccount("QUICKBOOKS");
  if (!account?.isEnabled || !account?.realmId) {
    const err = new Error("QuickBooks is not connected");
    err.status = 400;
    throw err;
  }

  let { accessToken, refreshToken } = getDecryptedTokens(account);

  // Refresh if token is expired (or within 5 minutes of expiring)
  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;
  const now       = new Date();
  const needsRefresh = !expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
  if (needsRefresh && refreshToken) {
    const refreshed = await refreshAccessToken(refreshToken);
    accessToken     = refreshed.accessToken;
    // Update stored tokens
    await upsertIntegrationAccount("QUICKBOOKS", {
      accessToken:   refreshed.accessToken,
      refreshToken:  refreshed.refreshToken || refreshToken,
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000)
    });
  }

  if (!accessToken) {
    const err = new Error("QuickBooks access token is missing — please reconnect");
    err.status = 401;
    throw err;
  }

  const base = apiBase(account.environment);
  const url  = `${base}/${account.realmId}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      Accept:         "application/json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok) {
    const msg = data?.Fault?.Error?.[0]?.Detail
      || data?.Fault?.Error?.[0]?.Message
      || data?.error_description
      || `QuickBooks API error ${response.status}`;
    const err = new Error(msg);
    err.status  = response.status;
    err.qbFault = data?.Fault;
    throw err;
  }

  return data;
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch(QB_TOKEN_URL, {
    method:  "POST",
    headers: {
      Authorization:  basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Failed to refresh QuickBooks access token");
  }
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn:    data.expires_in    || 3600
  };
}

/* ─── Public API ────────────────────────────────────────────────────────────── */

/**
 * Build the Intuit OAuth2 authorization URL.
 * Redirect the user's browser here to start the OAuth flow.
 */
export function getAuthUrl(state = "") {
  const clientId    = env.quickbooksClientId;
  const redirectUri = env.quickbooksRedirectUri;
  if (!clientId || !redirectUri) {
    const err = new Error("QuickBooks OAuth is not configured (QUICKBOOKS_CLIENT_ID / QUICKBOOKS_REDIRECT_URI)");
    err.status = 500;
    throw err;
  }
  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope:        QB_SCOPE,
    state:        state || "qb-connect"
  });
  return `${QB_OAUTH_BASE}?${params.toString()}`;
}

/**
 * Exchange the OAuth2 authorization code for access/refresh tokens.
 * Called from the OAuth callback route.
 */
export async function exchangeCodeForTokens({ code, realmId }) {
  if (!code || !realmId) {
    const err = new Error("code and realmId are required");
    err.status = 400;
    throw err;
  }

  const response = await fetch(QB_TOKEN_URL, {
    method:  "POST",
    headers: {
      Authorization:  basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: [
      `grant_type=authorization_code`,
      `code=${encodeURIComponent(code)}`,
      `redirect_uri=${encodeURIComponent(env.quickbooksRedirectUri)}`
    ].join("&")
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Failed to exchange QuickBooks authorization code");
  }

  // Fetch company info so we can store the company name
  let companyName = null;
  try {
    const infoResponse = await fetch(
      `${QB_API_SANDBOX}/${realmId}/companyinfo/${realmId}?minorversion=65`,
      { headers: { Authorization: `Bearer ${data.access_token}`, Accept: "application/json" } }
    );
    const infoData = await infoResponse.json().catch(() => ({}));
    companyName = infoData?.CompanyInfo?.CompanyName || null;
  } catch {}

  const account = await upsertIntegrationAccount("QUICKBOOKS", {
    isEnabled:     true,
    environment:   env.quickbooksEnvironment || "SANDBOX",
    realmId,
    companyName,
    accessToken:   data.access_token,
    refreshToken:  data.refresh_token,
    tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    syncStatus:    "SUCCESS",
    syncError:     null
  });

  await writeIntegrationSyncLog({
    provider:   "QUICKBOOKS",
    direction:  "PULL",
    entityType: "Connection",
    status:     "SUCCESS",
    message:    `QuickBooks connected — company: ${companyName || realmId}`
  });

  return account;
}

export async function testQuickbooksConnection() {
  const account = await getIntegrationAccount("QUICKBOOKS");
  if (!account?.isEnabled) {
    const err = new Error("QuickBooks is not connected");
    err.status = 400;
    throw err;
  }

  // Try a lightweight call — fetch company info
  const data = await qbFetch(`/companyinfo/${account.realmId}?minorversion=65`, { account });

  await writeIntegrationSyncLog({
    provider:   "QUICKBOOKS",
    direction:  "PULL",
    entityType: "Connection",
    status:     "SUCCESS",
    message:    "QuickBooks connection tested successfully"
  });

  return {
    ok:          true,
    companyName: data?.CompanyInfo?.CompanyName || account.companyName,
    realmId:     account.realmId
  };
}

export async function connectQuickbooks(payload) {
  return upsertIntegrationAccount("QUICKBOOKS", {
    isEnabled:     true,
    environment:   payload.environment || "SANDBOX",
    realmId:       payload.realmId     || null,
    companyName:   payload.companyName || null,
    accessToken:   payload.accessToken || null,
    refreshToken:  payload.refreshToken || null,
    tokenExpiresAt: payload.tokenExpiresAt ? new Date(payload.tokenExpiresAt) : null,
    metadataJson:  payload.metadataJson || null,
    syncStatus:    "SUCCESS",
    syncError:     null
  });
}

export async function disconnectQuickbooks() {
  const account = await getIntegrationAccount("QUICKBOOKS");
  if (account) {
    const { refreshToken } = getDecryptedTokens(account);
    if (refreshToken) {
      // Revoke the token on Intuit's side (best effort)
      fetch(QB_REVOKE_URL, {
        method:  "POST",
        headers: { Authorization: basicAuthHeader(), "Content-Type": "application/json" },
        body:    JSON.stringify({ token: refreshToken })
      }).catch(() => {});
    }
  }
  return upsertIntegrationAccount("QUICKBOOKS", {
    isEnabled:       false,
    accessTokenEnc:  null,
    refreshTokenEnc: null,
    tokenExpiresAt:  null,
    syncStatus:      "PENDING",
    syncError:       null
  });
}

/**
 * Find or create a QuickBooks Customer for a given client.
 * Returns the QB Customer Id.
 */
async function ensureQBCustomer(client, account) {
  // Check if we already have a QB customer ID stored on the client
  if (client.quickbooksCustomerId) {
    return client.quickbooksCustomerId;
  }

  // Search QB for an existing customer by display name
  try {
    const query    = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${client.fullName.replace(/'/g, "\\'")}'`);
    const data     = await qbFetch(`/query?query=${query}&minorversion=65`, { account });
    const existing = data?.QueryResponse?.Customer?.[0];
    if (existing) {
      // Store QB ID on local client for future calls
      await prisma.client.update({ where: { id: client.id }, data: { quickbooksCustomerId: existing.Id } }).catch(() => {});
      return existing.Id;
    }
  } catch {}

  // Create new QB Customer
  const payload = {
    DisplayName: client.fullName,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone:     client.phone  ? { FreeFormNumber: client.phone } : undefined
  };

  const created = await qbFetch(`/customer?minorversion=65`, {
    method:  "POST",
    body:    payload,
    account
  });
  const qbCustomerId = created?.Customer?.Id;
  if (qbCustomerId) {
    await prisma.client.update({ where: { id: client.id }, data: { quickbooksCustomerId: qbCustomerId } }).catch(() => {});
  }
  return qbCustomerId;
}

export async function syncClientToQuickbooks(clientId) {
  const account = await getIntegrationAccount("QUICKBOOKS");
  if (!account?.isEnabled) {
    const err = new Error("QuickBooks is not connected");
    err.status = 400;
    throw err;
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    const err = new Error("Client not found");
    err.status = 404;
    throw err;
  }

  const qbCustomerId = await ensureQBCustomer(client, account);

  await writeIntegrationSyncLog({
    provider:   "QUICKBOOKS",
    direction:  "PUSH",
    entityType: "Client",
    entityId:   client.id,
    status:     "SUCCESS",
    message:    `Client synced to QuickBooks as Customer ${qbCustomerId}`,
    payloadJson: { fullName: client.fullName, qbCustomerId }
  });

  await upsertIntegrationAccount("QUICKBOOKS", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
  return { ok: true, externalCustomerId: qbCustomerId };
}

export async function syncInvoiceToQuickbooks(invoiceId) {
  const account = await getIntegrationAccount("QUICKBOOKS");

  if (!account?.isEnabled) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data:  { qbSyncStatus: "NOT_SYNCED", qbSyncError: "QuickBooks is not connected" }
    }).catch(() => {});
    return prisma.invoice.findUnique({ where: { id: invoiceId } });
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where:   { id: invoiceId },
      include: { client: true, lineItems: true }
    });
    if (!invoice) {
      const err = new Error("Invoice not found");
      err.status = 404;
      throw err;
    }

    await prisma.invoice.update({ where: { id: invoice.id }, data: { qbSyncStatus: "PENDING", qbSyncError: null } });

    // Ensure the QB Customer exists
    const qbCustomerId = await ensureQBCustomer(invoice.client, account);

    let qbInvoiceId = invoice.quickbooksInvoiceId;

    if (qbInvoiceId) {
      // Update existing QB Invoice
      const existing = await qbFetch(`/invoice/${qbInvoiceId}?minorversion=65`, { account }).catch(() => null);
      if (existing?.Invoice) {
        const syncVersion = existing.Invoice.SyncToken;
        await qbFetch(`/invoice?minorversion=65`, {
          method:  "POST",
          account,
          body:    buildQBInvoicePayload(invoice, qbCustomerId, qbInvoiceId, syncVersion)
        });
      } else {
        qbInvoiceId = null; // Will create fresh below
      }
    }

    if (!qbInvoiceId) {
      // Create new QB Invoice
      const result  = await qbFetch(`/invoice?minorversion=65`, {
        method:  "POST",
        account,
        body:    buildQBInvoicePayload(invoice, qbCustomerId, null, null)
      });
      qbInvoiceId = result?.Invoice?.Id;
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data:  { quickbooksInvoiceId: qbInvoiceId, qbSyncStatus: "SYNCED", qbSyncError: null }
    });

    await writeIntegrationSyncLog({
      provider:    "QUICKBOOKS",
      direction:   "PUSH",
      entityType:  "Invoice",
      entityId:    invoice.id,
      status:      "SUCCESS",
      message:     `Invoice ${invoice.invoiceNumber} synced to QuickBooks (ID: ${qbInvoiceId})`,
      payloadJson: { qbInvoiceId, total: invoice.total }
    });
    await upsertIntegrationAccount("QUICKBOOKS", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
    return updated;

  } catch (error) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data:  { qbSyncStatus: "FAILED", qbSyncError: error.message || "Sync failed" }
    }).catch(() => {});
    await writeIntegrationSyncLog({
      provider:   "QUICKBOOKS",
      direction:  "PUSH",
      entityType: "Invoice",
      entityId:   invoiceId,
      status:     "FAILED",
      message:    error.message || "Invoice sync failed"
    }).catch(() => {});
    throw error;
  }
}

export async function syncPaymentToQuickbooks(paymentId) {
  const account = await getIntegrationAccount("QUICKBOOKS");

  const payment = await prisma.payment.findUnique({
    where:   { id: paymentId },
    include: { invoice: { include: { client: true } } }
  });
  if (!payment) return;

  if (!account?.isEnabled) {
    if (payment.invoiceId) {
      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data:  { qbSyncStatus: "NOT_SYNCED" }
      }).catch(() => {});
    }
    return;
  }

  try {
    // Ensure invoice exists in QB first
    if (payment.invoiceId && !payment.invoice?.quickbooksInvoiceId) {
      await syncInvoiceToQuickbooks(payment.invoiceId);
    }

    // Re-fetch invoice to get the QB invoice ID (may have just been created)
    const invoice = payment.invoiceId
      ? await prisma.invoice.findUnique({ where: { id: payment.invoiceId }, include: { client: true } })
      : null;

    if (invoice?.quickbooksInvoiceId) {
      // Create QB Payment linked to the invoice
      const qbCustomerId = await ensureQBCustomer(invoice.client, account);

      const paymentPayload = {
        TotalAmt: Number(payment.amount).toFixed(2),
        CustomerRef: { value: qbCustomerId },
        PaymentMethodRef: { value: "1" },
        TxnDate: new Date(payment.paymentDate).toISOString().slice(0, 10),
        Line: [{
          Amount:         Number(payment.amount),
          LinkedTxn: [{
            TxnId:   invoice.quickbooksInvoiceId,
            TxnType: "Invoice"
          }]
        }]
      };

      const result    = await qbFetch(`/payment?minorversion=65`, {
        method:  "POST",
        account,
        body:    paymentPayload
      });
      const qbPaymentId = result?.Payment?.Id;

      if (payment.invoiceId) {
        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data:  { qbPaymentId, qbSyncStatus: "SYNCED", qbSyncError: null }
        });
      }

      await writeIntegrationSyncLog({
        provider:    "QUICKBOOKS",
        direction:   "PUSH",
        entityType:  "Payment",
        entityId:    payment.id,
        status:      "SUCCESS",
        message:     `Payment of $${Number(payment.amount).toFixed(2)} synced to QuickBooks (Payment ID: ${qbPaymentId})`,
        payloadJson: { qbPaymentId, amount: payment.amount, invoiceId: payment.invoiceId }
      });
      await upsertIntegrationAccount("QUICKBOOKS", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
    }

  } catch (error) {
    if (payment.invoiceId) {
      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data:  { qbSyncStatus: "FAILED", qbSyncError: error.message || "Payment sync failed" }
      }).catch(() => {});
    }
    await writeIntegrationSyncLog({
      provider:   "QUICKBOOKS",
      direction:  "PUSH",
      entityType: "Payment",
      entityId:   payment.id,
      status:     "FAILED",
      message:    error.message || "Payment sync failed"
    }).catch(() => {});
    // Do not rethrow — QB sync failure must not break the main payment flow
  }
}

/* ─── QB payload builders ───────────────────────────────────────────────────── */

function buildQBInvoicePayload(invoice, qbCustomerId, qbInvoiceId, syncToken) {
  const payload = {
    CustomerRef: { value: qbCustomerId },
    DocNumber:   invoice.invoiceNumber  || undefined,
    TxnDate:     new Date(invoice.issueDate).toISOString().slice(0, 10),
    DueDate:     invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : undefined,
    Line: (invoice.lineItems || []).map((li) => ({
      DetailType:          "SalesItemLineDetail",
      Amount:              Number(li.amount),
      Description:         li.description || undefined,
      SalesItemLineDetail: {
        Qty:      Number(li.quantity),
        UnitPrice: Number(li.unitPrice),
        ItemRef:  { value: "1", name: "Services" }
      }
    }))
  };

  if (!payload.Line.length) {
    payload.Line = [{
      DetailType: "SalesItemLineDetail",
      Amount:     Number(invoice.total),
      SalesItemLineDetail: {
        Qty:      1,
        UnitPrice: Number(invoice.total),
        ItemRef:  { value: "1", name: "Services" }
      }
    }];
  }

  if (qbInvoiceId) {
    payload.Id        = qbInvoiceId;
    payload.SyncToken = syncToken || "0";
  }

  return payload;
}
