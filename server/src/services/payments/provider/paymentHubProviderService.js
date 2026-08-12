/**
 * North / PaymentsHub provider adapter.
 *
 * Wraps three distinct North integration surfaces:
 *
 *  1. Generic API calls  — callPaymentHub()         (internal helper)
 *  2. EPX Hosted Checkout — createHostedCheckout()   (email pay-now links)
 *  3. Browser Post API    — getBrowserPostConfig()   (in-app card entry form)
 *  4. Legacy charge       — createCharge()           (server-side token charge)
 *
 * All credentials come from the IntegrationAccount row for PAYMENT_HUB,
 * which is stored encrypted in the database and configured via the
 * Integrations settings page.
 *
 * North EPX Hosted Checkout reference:
 *   https://developer.north.com/products/online/epx-hosted-checkout
 *
 * North Browser Post API reference:
 *   https://developer.north.com/products/online/browser-post
 */

import crypto from "crypto";
import { env } from "../../../config/env.js";
import { getDecryptedTokens, getIntegrationAccount, writeIntegrationSyncLog } from "../../integrations/integrationAccountService.js";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Internal helpers                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function baseUrl() {
  return (env.paymentHubBaseUrl || "").replace(/\/+$/, "");
}

async function getCredentials() {
  const account = await getIntegrationAccount("PAYMENT_HUB");
  if (!account?.isEnabled) {
    const error = new Error("Payment Hub integration is not enabled");
    error.status = 400;
    throw error;
  }
  const { accessToken, webhookSecret } = getDecryptedTokens(account);
  if (!accessToken) {
    const error = new Error("Payment Hub API credentials not configured");
    error.status = 400;
    throw error;
  }
  const meta = account.metadataJson || {};
  return { accessToken, webhookSecret, meta, account };
}

async function callPaymentHub({ path, method = "GET", body, rawBody }) {
  const { accessToken } = await getCredentials();
  if (!baseUrl()) {
    const error = new Error("PAYMENT_HUB_BASE_URL is not configured");
    error.status = 500;
    throw error;
  }
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: rawBody ?? (body ? JSON.stringify(body) : undefined)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || "Payment Hub API request failed");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 1. Connection test                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function testConnection() {
  const result = await callPaymentHub({ path: "/v1/health" });
  await writeIntegrationSyncLog({
    provider: "PAYMENT_HUB",
    direction: "PULL",
    entityType: "Connection",
    status: "SUCCESS",
    message: "Payment Hub connection test succeeded",
    payloadJson: result
  });
  return result;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 2. EPX Hosted Checkout — creates a customer-facing Pay Now session           */
/*                                                                             */
/* North docs: https://developer.north.com/products/online/epx-hosted-checkout */
/*                                                                             */
/* The session creation request follows North's standard checkout payload.     */
/* We embed the local invoiceId as the orderRef / referenceId so the callback  */
/* webhook can correlate the payment back to the correct invoice record.        */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function createHostedCheckout({
  invoiceId,
  invoiceNumber,
  amount,           // number, in dollars (e.g. 150.00)
  currency = "USD",
  clientName,
  clientEmail,
  description,
  returnUrl,        // URL North redirects the customer to after payment
  cancelUrl,        // URL North redirects the customer to if they cancel
  dueDate
}) {
  if (!amount || amount <= 0) {
    const error = new Error("Amount must be greater than 0 to generate a payment link");
    error.status = 400;
    throw error;
  }

  const payload = {
    // North EPX Hosted Checkout parameters
    amount: Math.round(amount * 100),          // cents
    currency: (currency || "USD").toUpperCase(),
    orderRef: invoiceId,                        // our local ID — used to correlate webhook
    referenceId: invoiceNumber || invoiceId,    // human-readable invoice number
    description: description || `Invoice ${invoiceNumber || invoiceId}`,
    customerName: clientName || undefined,
    customerEmail: clientEmail || undefined,
    returnUrl: returnUrl || `${env.appBaseUrl}/aplus/invoices`,
    cancelUrl: cancelUrl || `${env.appBaseUrl}/aplus/invoices`,
    expiresAt: dueDate ? new Date(dueDate).toISOString() : undefined,
    metadata: {
      invoiceId,
      invoiceNumber: invoiceNumber || invoiceId
    }
  };

  const result = await callPaymentHub({
    path: "/v1/checkout/sessions",
    method: "POST",
    body: payload
  });

  // Normalise across possible response shapes from different North environments
  return {
    sessionId: result.sessionId || result.id || result.checkoutId,
    checkoutUrl: result.checkoutUrl || result.url || result.hostedUrl || result.paymentUrl,
    expiresAt: result.expiresAt || result.expires_at,
    raw: result
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 3. Browser Post API — returns the configuration the frontend needs to       */
/*    build a direct-to-North card entry form.                                 */
/*                                                                             */
/* North docs: https://developer.north.com/products/online/browser-post       */
/*                                                                             */
/* HOW IT WORKS                                                                */
/* 1. Staff opens the "Charge Card" modal in A-plus.                           */
/* 2. Our backend calls this function to get the Browser Post endpoint URL,    */
/*    merchantId, and a signed nonce so the form can POST directly to North.   */
/* 3. Card data (PAN, expiry, CVV) NEVER touches our server.                   */
/* 4. After North processes the payment, North redirects / POSTs the result    */
/*    token to our /api/payments/browser-post/confirm endpoint.                */
/* 5. Our confirm endpoint records the payment and applies it to the invoice.  */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function getBrowserPostConfig({ invoiceId, invoiceNumber, amount, currency = "USD", clientEmail }) {
  const { accessToken, meta } = await getCredentials();

  // Generate a one-time nonce to prevent replay attacks
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();

  // The Browser Post endpoint URL is typically provided in the North dashboard
  // and stored in the integration metadata. Fall back to the env var.
  const browserPostUrl =
    meta.browserPostUrl ||
    env.paymentHubBrowserPostUrl ||
    `${baseUrl()}/v1/browser-post`;

  const merchantId =
    meta.merchantId ||
    env.paymentHubMerchantId ||
    "";

  // Build a HMAC signature over the order parameters so North can verify
  // the request hasn't been tampered with on the browser.
  const sigPayload = `${merchantId}|${invoiceId}|${Math.round(amount * 100)}|${nonce}|${timestamp}`;
  const signature = crypto
    .createHmac("sha256", accessToken)
    .update(sigPayload)
    .digest("hex");

  return {
    browserPostUrl,
    merchantId,
    orderRef: invoiceId,
    referenceId: invoiceNumber || invoiceId,
    amount: Math.round(amount * 100), // cents
    currency: (currency || "USD").toUpperCase(),
    customerEmail: clientEmail || undefined,
    nonce,
    timestamp,
    signature,
    confirmUrl: `${env.apiBaseUrl}/api/payments/browser-post/confirm`,
    metadata: { invoiceId, invoiceNumber }
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* 4. Legacy / server-side charge (kept for backward compatibility)             */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function createCharge(payload) {
  return callPaymentHub({ path: "/v1/payments", method: "POST", body: payload });
}

export async function getPayment(externalPaymentId) {
  return callPaymentHub({ path: `/v1/payments/${encodeURIComponent(externalPaymentId)}` });
}

export async function createRefund(payload) {
  return callPaymentHub({ path: "/v1/refunds", method: "POST", body: payload });
}

/** @deprecated Use generatePaymentLink() via paymentHubService instead */
export async function createInvoicePaymentLink(payload) {
  return callPaymentHub({ path: "/v1/invoices", method: "POST", body: payload });
}
