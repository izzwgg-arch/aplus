/**
 * QuickBooks Online Integration Service
 *
 * All QuickBooks **accounting API** HTTP traffic goes through `qbAccountingApiRequest`
 * (quickbooksApiClient.js) for logging, rate limits, dedupe, caching, and retries.
 *
 * OAuth token endpoint (Intuit platform) still uses direct fetch — not QBO company API.
 */

import { prisma } from "../../../config/prisma.js";
import { env } from "../../../config/env.js";
import {
  getIntegrationAccount,
  getDecryptedTokens,
  upsertIntegrationAccount,
  writeIntegrationSyncLog
} from "../integrationAccountService.js";
import { qbAccountingApiRequest } from "./quickbooksApiClient.js";
import {
  getQBAppCredentials,
  basicAuthHeader,
  QB_TOKEN_URL
} from "./quickbooksAuth.js";

const QB_OAUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const QB_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QB_SCOPE = "com.intuit.quickbooks.accounting";

/** @typedef {{ userId?: string|null, triggerType?: "user"|"background"|"retry" }} QbCallContext */

function qbCtx(ctx = {}) {
  return {
    userId: ctx.userId ?? null,
    triggerType: ctx.triggerType || "background"
  };
}

/**
 * Map app payment rows to QuickBooks PaymentMethodRef (Lists → Payment methods).
 * Manual Cash/Check uses QB_PAYMENT_METHOD_CASH_ID / QB_PAYMENT_METHOD_CHECK_ID when set.
 * Card/processor payments use QB_PAYMENT_METHOD_CARD_ID when set; otherwise omit (QBO accepts payment without method ref).
 */
function resolveQbPaymentMethodRefForPayment(payment) {
  const method = String(payment.paymentMethod || "").trim().toLowerCase();
  const isManual = payment.paymentSourceType === "MANUAL";

  if (isManual) {
    if (method === "cash" || method.includes("cash")) {
      const id = String(env.qbPaymentMethodCashId || "").trim();
      return id || null;
    }
    if (method === "check" || method.includes("check")) {
      const id = String(env.qbPaymentMethodCheckId || "").trim();
      return id || null;
    }
    return null;
  }

  const cardId = String(env.qbPaymentMethodCardId || "").trim();
  return cardId || null;
}

export async function getAuthUrl(state = "") {
  const { clientId, redirectUri } = await getQBAppCredentials();
  if (!clientId || !redirectUri) {
    const err = new Error("QuickBooks Client ID and Redirect URI are not configured. Enter them in Settings → Integrations → QuickBooks.");
    err.status = 500;
    throw err;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QB_SCOPE,
    state: state || "qb-connect"
  });
  return `${QB_OAUTH_BASE}?${params.toString()}`;
}

export async function exchangeCodeForTokens({ code, realmId }) {
  if (!code || !realmId) {
    const err = new Error("code and realmId are required");
    err.status = 400;
    throw err;
  }

  const { redirectUri, environment } = await getQBAppCredentials();

  const response = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: await basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: [
      `grant_type=authorization_code`,
      `code=${encodeURIComponent(code)}`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`
    ].join("&")
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Failed to exchange QuickBooks authorization code");
  }

  let companyName = null;
  try {
    const infoData = await qbAccountingApiRequest({
      path: `/companyinfo/${realmId}?minorversion=65`,
      method: "GET",
      account: { realmId, environment },
      tokenOverride: data.access_token,
      feature: "oauth_companyinfo",
      triggerType: "user",
      tenantId: realmId,
      realmId,
      bypassCache: true,
      bypassDedupe: true
    });
    companyName = infoData?.CompanyInfo?.CompanyName || null;
  } catch {}

  const account = await upsertIntegrationAccount("QUICKBOOKS", {
    isEnabled: true,
    environment,
    realmId,
    companyName,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    syncStatus: "SUCCESS",
    syncError: null
  });

  await writeIntegrationSyncLog({
    provider: "QUICKBOOKS",
    direction: "PULL",
    entityType: "Connection",
    status: "SUCCESS",
    message: `QuickBooks connected — company: ${companyName || realmId}`
  });

  return account;
}

export async function testQuickbooksConnection(ctx = {}) {
  const c = qbCtx(ctx);
  const account = await getIntegrationAccount("QUICKBOOKS");
  if (!account?.isEnabled) {
    const err = new Error("QuickBooks is not connected");
    err.status = 400;
    throw err;
  }

  const data = await qbAccountingApiRequest({
    path: `/companyinfo/${account.realmId}?minorversion=65`,
    method: "GET",
    account,
    feature: "connection_test",
    triggerType: c.triggerType,
    userId: c.userId
  });

  await writeIntegrationSyncLog({
    provider: "QUICKBOOKS",
    direction: "PULL",
    entityType: "Connection",
    status: "SUCCESS",
    message: "QuickBooks connection tested successfully"
  });

  return {
    ok: true,
    companyName: data?.CompanyInfo?.CompanyName || account.companyName,
    realmId: account.realmId
  };
}

export async function connectQuickbooks(payload) {
  return upsertIntegrationAccount("QUICKBOOKS", {
    isEnabled: true,
    environment: payload.environment || "SANDBOX",
    realmId: payload.realmId || null,
    companyName: payload.companyName || null,
    accessToken: payload.accessToken || null,
    refreshToken: payload.refreshToken || null,
    tokenExpiresAt: payload.tokenExpiresAt ? new Date(payload.tokenExpiresAt) : null,
    metadataJson: payload.metadataJson || null,
    syncStatus: "SUCCESS",
    syncError: null
  });
}

export async function disconnectQuickbooks() {
  const account = await getIntegrationAccount("QUICKBOOKS");
  if (account) {
    const { refreshToken } = getDecryptedTokens(account);
    if (refreshToken) {
      fetch(QB_REVOKE_URL, {
        method: "POST",
        headers: { Authorization: await basicAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ token: refreshToken })
      }).catch(() => {});
    }
  }
  return upsertIntegrationAccount("QUICKBOOKS", {
    isEnabled: false,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    syncStatus: "PENDING",
    syncError: null
  });
}

async function ensureQBCustomer(client, account, ctx = {}) {
  const c = qbCtx(ctx);
  if (client.quickbooksCustomerId) {
    return client.quickbooksCustomerId;
  }

  try {
    const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${client.fullName.replace(/'/g, "\\'")}'`);
    const data = await qbAccountingApiRequest({
      path: `/query?query=${query}&minorversion=65`,
      method: "GET",
      account,
      feature: "customer_query",
      triggerType: c.triggerType,
      userId: c.userId
    });
    const existing = data?.QueryResponse?.Customer?.[0];
    if (existing) {
      await prisma.client.update({ where: { id: client.id }, data: { quickbooksCustomerId: existing.Id } }).catch(() => {});
      return existing.Id;
    }
  } catch {}

  const payload = {
    DisplayName: client.fullName,
    PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined
  };

  const created = await qbAccountingApiRequest({
    path: `/customer?minorversion=65`,
    method: "POST",
    body: payload,
    account,
    feature: "customer_create",
    triggerType: c.triggerType,
    userId: c.userId
  });
  const qbCustomerId = created?.Customer?.Id;
  if (qbCustomerId) {
    await prisma.client.update({ where: { id: client.id }, data: { quickbooksCustomerId: qbCustomerId } }).catch(() => {});
  }
  return qbCustomerId;
}

export async function syncClientToQuickbooks(clientId, ctx = {}) {
  const c = qbCtx(ctx);
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

  const qbCustomerId = await ensureQBCustomer(client, account, c);

  await writeIntegrationSyncLog({
    provider: "QUICKBOOKS",
    direction: "PUSH",
    entityType: "Client",
    entityId: client.id,
    status: "SUCCESS",
    message: `Client synced to QuickBooks as Customer ${qbCustomerId}`,
    payloadJson: { fullName: client.fullName, qbCustomerId }
  });

  await upsertIntegrationAccount("QUICKBOOKS", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
  return { ok: true, externalCustomerId: qbCustomerId };
}

export async function syncInvoiceToQuickbooks(invoiceId, ctx = {}) {
  const c = qbCtx(ctx);
  const account = await getIntegrationAccount("QUICKBOOKS");

  if (!account?.isEnabled) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { qbSyncStatus: "NOT_SYNCED", qbSyncError: "QuickBooks is not connected" }
    }).catch(() => {});
    return prisma.invoice.findUnique({ where: { id: invoiceId } });
  }

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: true, lineItems: true }
    });
    if (!invoice) {
      const err = new Error("Invoice not found");
      err.status = 404;
      throw err;
    }

    await prisma.invoice.update({ where: { id: invoice.id }, data: { qbSyncStatus: "PENDING", qbSyncError: null } });

    const qbCustomerId = await ensureQBCustomer(invoice.client, account, c);

    let qbInvoiceId = invoice.quickbooksInvoiceId;

    if (qbInvoiceId) {
      const existing = await qbAccountingApiRequest({
        path: `/invoice/${qbInvoiceId}?minorversion=65`,
        method: "GET",
        account,
        feature: "invoice_read",
        triggerType: c.triggerType,
        userId: c.userId
      }).catch(() => null);
      if (existing?.Invoice) {
        const syncVersion = existing.Invoice.SyncToken;
        await qbAccountingApiRequest({
          path: `/invoice?minorversion=65`,
          method: "POST",
          body: buildQBInvoicePayload(invoice, qbCustomerId, qbInvoiceId, syncVersion),
          account,
          feature: "invoice_update",
          triggerType: c.triggerType,
          userId: c.userId
        });
      } else {
        qbInvoiceId = null;
      }
    }

    if (!qbInvoiceId) {
      const result = await qbAccountingApiRequest({
        path: `/invoice?minorversion=65`,
        method: "POST",
        body: buildQBInvoicePayload(invoice, qbCustomerId, null, null),
        account,
        feature: "invoice_create",
        triggerType: c.triggerType,
        userId: c.userId
      });
      qbInvoiceId = result?.Invoice?.Id;
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { quickbooksInvoiceId: qbInvoiceId, qbSyncStatus: "SYNCED", qbSyncError: null }
    });

    await writeIntegrationSyncLog({
      provider: "QUICKBOOKS",
      direction: "PUSH",
      entityType: "Invoice",
      entityId: invoice.id,
      status: "SUCCESS",
      message: `Invoice ${invoice.invoiceNumber} synced to QuickBooks (ID: ${qbInvoiceId})`,
      payloadJson: { qbInvoiceId, total: invoice.total }
    });
    await upsertIntegrationAccount("QUICKBOOKS", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
    return updated;
  } catch (error) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { qbSyncStatus: "FAILED", qbSyncError: error.message || "Sync failed" }
    }).catch(() => {});
    await writeIntegrationSyncLog({
      provider: "QUICKBOOKS",
      direction: "PUSH",
      entityType: "Invoice",
      entityId: invoiceId,
      status: "FAILED",
      message: error.message || "Invoice sync failed"
    }).catch(() => {});
    throw error;
  }
}

export async function syncPaymentToQuickbooks(paymentId, ctx = {}) {
  const c = qbCtx(ctx);
  const account = await getIntegrationAccount("QUICKBOOKS");

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { client: true } } }
  });
  if (!payment) return;

  const alreadySynced = await prisma.integrationSyncLog.findFirst({
    where: {
      provider: "QUICKBOOKS",
      direction: "PUSH",
      entityType: "Payment",
      entityId: paymentId,
      status: "SUCCESS"
    }
  });
  if (alreadySynced) return;

  if (!account?.isEnabled) {
    if (payment.invoiceId) {
      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { qbSyncStatus: "NOT_SYNCED" }
      }).catch(() => {});
    }
    return;
  }

  try {
    if (payment.invoiceId && !payment.invoice?.quickbooksInvoiceId) {
      await syncInvoiceToQuickbooks(payment.invoiceId, { ...c, triggerType: c.triggerType === "user" ? "user" : "background" });
    }

    const invoice = payment.invoiceId
      ? await prisma.invoice.findUnique({ where: { id: payment.invoiceId }, include: { client: true } })
      : null;

    if (payment.invoiceId && invoice && !invoice.quickbooksInvoiceId) {
      throw new Error(
        "Invoice is not linked to QuickBooks after sync. Check QuickBooks connection and invoice line items."
      );
    }

    if (invoice?.quickbooksInvoiceId) {
      const qbCustomerId = await ensureQBCustomer(invoice.client, account, c);

      const paymentMethodRefValue = resolveQbPaymentMethodRefForPayment(payment);
      const paymentPayload = {
        TotalAmt: Number(payment.amount).toFixed(2),
        CustomerRef: { value: qbCustomerId },
        TxnDate: new Date(payment.paymentDate).toISOString().slice(0, 10),
        Line: [{
          Amount: Number(payment.amount),
          LinkedTxn: [{
            TxnId: invoice.quickbooksInvoiceId,
            TxnType: "Invoice"
          }]
        }]
      };
      if (paymentMethodRefValue) {
        paymentPayload.PaymentMethodRef = { value: paymentMethodRefValue };
      }

      const result = await qbAccountingApiRequest({
        path: `/payment?minorversion=65`,
        method: "POST",
        body: paymentPayload,
        account,
        feature: "payment_create",
        triggerType: c.triggerType,
        userId: c.userId
      });
      const qbPaymentId = result?.Payment?.Id;

      if (payment.invoiceId) {
        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: { qbPaymentId, qbSyncStatus: "SYNCED", qbSyncError: null }
        });
      }

      await writeIntegrationSyncLog({
        provider: "QUICKBOOKS",
        direction: "PUSH",
        entityType: "Payment",
        entityId: payment.id,
        status: "SUCCESS",
        message: `Payment of $${Number(payment.amount).toFixed(2)} synced to QuickBooks (Payment ID: ${qbPaymentId})`,
        payloadJson: { qbPaymentId, amount: payment.amount, invoiceId: payment.invoiceId }
      });
      await upsertIntegrationAccount("QUICKBOOKS", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
    }
  } catch (error) {
    if (payment.invoiceId) {
      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { qbSyncStatus: "FAILED", qbSyncError: error.message || "Payment sync failed" }
      }).catch(() => {});
    }
    await writeIntegrationSyncLog({
      provider: "QUICKBOOKS",
      direction: "PUSH",
      entityType: "Payment",
      entityId: payment.id,
      status: "FAILED",
      message: error.message || "Payment sync failed"
    }).catch(() => {});
  }
}

export async function updatePaymentInQuickbooks(paymentId, ctx = {}) {
  const c = qbCtx(ctx);
  const account = await getIntegrationAccount("QUICKBOOKS");
  if (!account?.isEnabled) return null;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { client: true } } }
  });
  if (!payment?.invoiceId || !payment.invoice?.quickbooksInvoiceId) return null;

  const syncLog = await prisma.integrationSyncLog.findFirst({
    where: {
      provider: "QUICKBOOKS",
      direction: "PUSH",
      entityType: "Payment",
      entityId: paymentId,
      status: "SUCCESS"
    },
    orderBy: { createdAt: "desc" }
  });
  const qbPaymentId = syncLog?.payloadJson?.qbPaymentId || payment.invoice.qbPaymentId;
  if (!qbPaymentId) return syncPaymentToQuickbooks(paymentId, c);

  const existing = await qbAccountingApiRequest({
    path: `/payment/${qbPaymentId}?minorversion=65`,
    method: "GET",
    account,
    feature: "payment_read",
    triggerType: c.triggerType,
    userId: c.userId
  }).catch(() => null);
  if (!existing?.Payment) return syncPaymentToQuickbooks(paymentId, c);

  const paymentMethodRefValue = resolveQbPaymentMethodRefForPayment(payment);
  const payload = {
    Id: qbPaymentId,
    SyncToken: existing.Payment.SyncToken || "0",
    sparse: true,
    TotalAmt: Number(payment.amount),
    TxnDate: new Date(payment.paymentDate).toISOString().slice(0, 10),
    CustomerRef: existing.Payment.CustomerRef,
    Line: existing.Payment.Line
  };
  if (paymentMethodRefValue) payload.PaymentMethodRef = { value: paymentMethodRefValue };

  const result = await qbAccountingApiRequest({
    path: `/payment?minorversion=65`,
    method: "POST",
    body: payload,
    account,
    feature: "payment_update",
    triggerType: c.triggerType,
    userId: c.userId
  });

  await writeIntegrationSyncLog({
    provider: "QUICKBOOKS",
    direction: "PUSH",
    entityType: "Payment",
    entityId: payment.id,
    status: "SUCCESS",
    message: `Payment ${payment.id} updated in QuickBooks (Payment ID: ${qbPaymentId})`,
    payloadJson: { qbPaymentId, paymentMethod: payment.paymentMethod, amount: payment.amount }
  });
  await upsertIntegrationAccount("QUICKBOOKS", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
  return result?.Payment || null;
}

function buildQBInvoicePayload(invoice, qbCustomerId, qbInvoiceId, syncToken) {
  const payload = {
    CustomerRef: { value: qbCustomerId },
    DocNumber: invoice.invoiceNumber || undefined,
    TxnDate: new Date(invoice.issueDate).toISOString().slice(0, 10),
    DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : undefined,
    Line: (invoice.lineItems || []).map((li) => ({
      DetailType: "SalesItemLineDetail",
      Amount: Number(li.amount),
      Description: li.description || undefined,
      SalesItemLineDetail: {
        Qty: Number(li.quantity),
        UnitPrice: Number(li.unitPrice),
        ItemRef: { value: "1", name: "Services" }
      }
    }))
  };

  if (!payload.Line.length) {
    payload.Line = [{
      DetailType: "SalesItemLineDetail",
      Amount: Number(invoice.total),
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: Number(invoice.total),
        ItemRef: { value: "1", name: "Services" }
      }
    }];
  }

  if (qbInvoiceId) {
    payload.Id = qbInvoiceId;
    payload.SyncToken = syncToken || "0";
  }

  return payload;
}
