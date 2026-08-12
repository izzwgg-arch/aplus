import { prisma } from "../../../config/prisma.js";
import {
  getIntegrationAccount,
  upsertIntegrationAccount,
  writeIntegrationSyncLog
} from "../integrationAccountService.js";
import {
  testConnection as testProviderConnection,
  createHostedCheckout,
  getBrowserPostConfig as getProviderBrowserPostConfig,
  createInvoicePaymentLink
} from "../../payments/provider/paymentHubProviderService.js";
import { logActivity } from "../../invoices/invoiceActivityService.js";

function ensureConnected(account) {
  if (!account?.isEnabled) {
    const error = new Error("Payment Hub is not connected");
    error.status = 400;
    throw error;
  }
}

export async function connectPaymentHub(payload) {
  return upsertIntegrationAccount("PAYMENT_HUB", {
    isEnabled: true,
    environment: payload.environment || "SANDBOX",
    accessToken: payload.apiKey || null,
    webhookSecret: payload.webhookSecret || null,
    metadataJson: {
      credentialMasked: payload.apiKey ? "****configured****" : null,
      webhookSecretMasked: payload.webhookSecret ? "****configured****" : null,
      paymentCollectionEnabled: payload.paymentCollectionEnabled !== false,
      merchantId: payload.merchantId || null,
      browserPostUrl: payload.browserPostUrl || null
    },
    syncStatus: "SUCCESS",
    syncError: null
  });
}

export async function disconnectPaymentHub() {
  return upsertIntegrationAccount("PAYMENT_HUB", {
    isEnabled: false,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    syncStatus: "PENDING",
    syncError: null
  });
}

export async function testPaymentHubConnection() {
  const account = await getIntegrationAccount("PAYMENT_HUB");
  ensureConnected(account);
  const testResult = await testProviderConnection();
  await writeIntegrationSyncLog({
    provider: "PAYMENT_HUB",
    direction: "PULL",
    entityType: "Connection",
    status: "SUCCESS",
    message: "Payment Hub connection tested successfully",
    payloadJson: testResult
  });
  return { ok: true, result: testResult };
}

/**
 * generatePaymentLink — uses EPX Hosted Checkout to create a customer-facing
 * Pay Now URL and stores it on the invoice record.
 *
 * The hosted checkout session is correlated back to the invoice via `orderRef`
 * so that when North fires a payment webhook our handler can find the invoice.
 */
export async function generatePaymentLink(invoiceId) {
  const account = await getIntegrationAccount("PAYMENT_HUB");
  ensureConnected(account);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true }
  });
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.status = 404;
    throw error;
  }
  if (invoice.status === "VOID") {
    const error = new Error("Cannot generate a payment link for a void invoice");
    error.status = 400;
    throw error;
  }
  if (invoice.balanceDue <= 0) {
    const error = new Error("Invoice is already fully paid");
    error.status = 400;
    throw error;
  }

  const checkout = await createHostedCheckout({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.balanceDue,
    currency: "USD",
    clientName: invoice.client?.fullName,
    clientEmail: invoice.client?.email,
    description: `Invoice ${invoice.invoiceNumber || invoice.id}`,
    dueDate: invoice.dueDate
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      paymentLinkUrl: checkout.checkoutUrl,
      hostedCheckoutRef: checkout.sessionId,
      paymentHubInvoiceId: checkout.sessionId || invoice.paymentHubInvoiceId,
      status: invoice.status === "DRAFT" ? "OPEN" : invoice.status
    }
  });

  await writeIntegrationSyncLog({
    provider: "PAYMENT_HUB",
    direction: "PUSH",
    entityType: "Invoice",
    entityId: invoice.id,
    status: "SUCCESS",
    message: "Hosted checkout session created",
    payloadJson: { sessionId: checkout.sessionId, checkoutUrl: checkout.checkoutUrl }
  });

  await upsertIntegrationAccount("PAYMENT_HUB", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });

  logActivity({
    invoiceId: invoice.id,
    type: "PAYMENT_LINK_GENERATED",
    message: "Pay Now link generated via EPX Hosted Checkout",
    metadata: { sessionId: checkout.sessionId, checkoutUrl: checkout.checkoutUrl }
  }).catch(() => {});

  return { ...updated, paymentLinkUrl: checkout.checkoutUrl, sessionId: checkout.sessionId };
}

/**
 * getBrowserPostConfig — returns the parameters needed by the frontend to
 * build a Browser Post card entry form.  Card data never touches our server.
 */
export async function getBrowserPostConfig({ invoiceId }) {
  const account = await getIntegrationAccount("PAYMENT_HUB");
  ensureConnected(account);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true }
  });
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.status = 404;
    throw error;
  }
  if (invoice.balanceDue <= 0) {
    const error = new Error("Invoice balance is already zero");
    error.status = 400;
    throw error;
  }

  return getProviderBrowserPostConfig({
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.balanceDue,
    currency: "USD",
    clientEmail: invoice.client?.email
  });
}

/** @deprecated Use generatePaymentLink() */
export async function sendInvoiceToPaymentHub(invoiceId) {
  const account = await getIntegrationAccount("PAYMENT_HUB");
  ensureConnected(account);
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.status = 404;
    throw error;
  }
  const invoiceLink = await createInvoicePaymentLink({
    invoiceId: invoice.id,
    externalInvoiceNumber: invoice.invoiceNumber || invoice.id,
    currency: "USD",
    amount: invoice.balanceDue,
    description: `Invoice ${invoice.invoiceNumber || invoice.id}`,
    metadata: { invoiceId: invoice.id, clientId: invoice.clientId },
    dueDate: invoice.dueDate
  });
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      paymentHubInvoiceId: invoiceLink.id || invoice.paymentHubInvoiceId,
      paymentLinkUrl: invoiceLink.checkoutUrl || invoiceLink.paymentLink || invoice.paymentLinkUrl,
      status: invoice.status === "DRAFT" ? "OPEN" : invoice.status
    }
  });
  await writeIntegrationSyncLog({
    provider: "PAYMENT_HUB",
    direction: "PUSH",
    entityType: "Invoice",
    entityId: invoice.id,
    status: "SUCCESS",
    message: "Invoice sent to Payment Hub",
    payloadJson: invoiceLink
  });
  await upsertIntegrationAccount("PAYMENT_HUB", { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null });
  return {
    ...updated,
    paymentLink: invoiceLink.checkoutUrl || invoiceLink.paymentLink || null
  };
}
