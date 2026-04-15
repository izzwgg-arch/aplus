import crypto from "crypto";
import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asNumber, asOptionalString, requireString } from "../utils/validation.js";
import { recalculateInvoiceBalance, refreshPaymentAggregateStatus } from "../services/payments/paymentService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { createProcessorCharge, refreshProcessorPaymentStatus } from "../services/payments/paymentProcessorService.js";
import { createPaymentRefund } from "../services/refunds/refundService.js";
import { testPaymentHubConnection, getBrowserPostConfig } from "../services/integrations/payment-hub/paymentHubService.js";
import { getDecryptedTokens, getIntegrationAccount } from "../services/integrations/integrationAccountService.js";
import { processPaymentWebhookEvent, verifyPaymentHubSignature } from "../services/payments/webhookService.js";
import { logActivity } from "../services/invoices/invoiceActivityService.js";
import { sendReceiptEmail, sendInvoiceEmail } from "../utils/mailer.js";
import { getOrCreateClinicSettings } from "../services/settingsService.js";
import { syncPaymentToQuickbooks } from "../services/integrations/quickbooks/quickbooksService.js";
import { testConnection as testSolaConnection, getIFieldsKey } from "../services/payments/provider/solaPaymentsProviderService.js";
import { env } from "../config/env.js";

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────── */
/* Public routes (no auth) — webhook endpoints must come before requireAuth    */
/* ─────────────────────────────────────────────────────────────────────────── */

// ── Sola Payments webhook ─────────────────────────────────────────────────────
// Sola posts transaction status events here. Verify signature using
// SOLA_WEBHOOK_SECRET and process idempotently.
router.post("/webhook/sola", async (req, res) => {
  try {
    const secret    = env.solaWebhookSecret || "";
    const signature = req.headers["x-cardknox-signature"] || req.headers["x-sola-signature"] || "";
    const payloadRaw = JSON.stringify(req.body || {});

    // Verify HMAC if a secret is configured (skip check in dev if secret not set)
    if (secret) {
      const digest = crypto.createHmac("sha256", secret).update(payloadRaw).digest("hex");
      const sig    = Buffer.from(String(signature));
      const exp    = Buffer.from(digest);
      if (sig.length !== exp.length || !crypto.timingSafeEqual(sig, exp)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    // Sola webhooks send xRefNum as the transaction identifier
    const body          = req.body || {};
    const xRefNum       = String(body.xRefNum || body.xRefnum || body.transactionId || "");
    const eventType     = String(body.xCommand || body.eventType || body.type || "payment.succeeded");
    const externalEventId = xRefNum
      ? `sola-${xRefNum}`
      : `sola-evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Normalise payload so webhookService can find the payment by xRefNum
    const normalisedPayload = {
      ...body,
      xRefNum,
      xResult:    body.xResult    || "A",
      transactionId: xRefNum
    };

    const result = await processPaymentWebhookEvent({
      provider:        "SOLA_PAYMENTS",
      externalEventId,
      eventType,
      payloadJson:     normalisedPayload
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[webhook/sola]", error?.message);
    return res.status(error.status || 500).json({ error: error.message || "Webhook handling failed" });
  }
});

// ── Legacy: Payment Hub browser-post confirm ──────────────────────────────────
router.post("/browser-post/confirm", async (req, res) => {
  try {
    const body = req.body || {};
    const {
      orderRef: invoiceId,
      transactionId,
      status: txStatus,
      amount: rawAmount,
      cardBrand,
      cardLast4,
      cardExpMonth,
      cardExpYear,
      billingName,
      billingEmail,
      billingZip,
      errorMessage
    } = body;

    if (!invoiceId) return res.status(400).json({ error: "Missing orderRef" });

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { client: true } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const succeeded = String(txStatus || "").toLowerCase().includes("approved")
      || String(txStatus || "").toLowerCase() === "success"
      || String(txStatus || "").toLowerCase() === "succeeded";

    if (!succeeded) {
      logActivity({
        invoiceId,
        type: "NOTE",
        message: `Browser Post card payment failed: ${errorMessage || txStatus || "unknown"}`,
        metadata: { transactionId, txStatus }
      }).catch(() => {});
      return res.json({ ok: false, status: txStatus, error: errorMessage });
    }

    if (transactionId) {
      const existing = await prisma.payment.findFirst({ where: { externalPaymentId: String(transactionId) } });
      if (existing) return res.json({ ok: true, duplicate: true, paymentId: existing.id });
    }

    const amount = Number(rawAmount || invoice.balanceDue);
    const payment = await prisma.payment.create({
      data: {
        clientId:           invoice.clientId,
        invoiceId:          invoice.id,
        processor:          "PAYMENT_HUB",
        externalPaymentId:  transactionId ? String(transactionId) : `browserpost-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        amount,
        currency:           "USD",
        paymentDate:        new Date(),
        description:        "Card payment via Browser Post",
        status:             "SUCCEEDED",
        paymentMethod:      cardBrand || "Card",
        paymentSourceType:  "CARD",
        cardBrand:          cardBrand || null,
        cardLast4:          cardLast4 || null,
        cardExpMonth:       cardExpMonth ? Number(cardExpMonth) : null,
        cardExpYear:        cardExpYear  ? Number(cardExpYear)  : null,
        billingName:        billingName  || null,
        billingEmail:       billingEmail || null,
        billingZip:         billingZip   || null,
        processorResponseJson: body
      }
    });

    const updatedInvoice = await recalculateInvoiceBalance(invoice.id);

    logActivity({
      invoiceId,
      type: "CARD_PAYMENT",
      message: `Card payment of $${amount.toFixed(2)} via Browser Post (${cardBrand || "Card"}${cardLast4 ? ` ···· ${cardLast4}` : ""})`,
      metadata: { paymentId: payment.id, transactionId, amount }
    }).catch(() => {});

    const settings = await getOrCreateClinicSettings();
    sendReceiptEmail({ invoice: { ...updatedInvoice, client: invoice.client }, payment, settings })
      .then(async () => {
        await prisma.payment.update({ where: { id: payment.id }, data: { receiptSentAt: new Date() } });
        logActivity({ invoiceId, type: "RECEIPT_SENT", message: `Receipt emailed to ${invoice.client?.email}`, metadata: { to: invoice.client?.email } }).catch(() => {});
      })
      .catch((err) => console.error("[receipt-email]", err?.message));

    syncPaymentToQuickbooks(payment.id).catch((err) => {
      console.error("[qb-sync] Browser Post payment sync failed", err?.message);
      logActivity({ invoiceId, type: "QB_FAILED", message: `QB sync failed: ${err?.message}` }).catch(() => {});
    });

    return res.json({ ok: true, paymentId: payment.id });
  } catch (error) {
    console.error("[browser-post-confirm]", error?.message);
    return res.status(error.status || 500).json({ error: error.message || "Browser Post confirmation failed" });
  }
});

// ── Legacy: Payment Hub webhook ───────────────────────────────────────────────
router.post("/webhook/payment-hub", async (req, res) => {
  try {
    const account = await getIntegrationAccount("PAYMENT_HUB");
    const { webhookSecret } = getDecryptedTokens(account);
    const signature  = req.headers["x-payment-hub-signature"];
    const payloadRaw = JSON.stringify(req.body || {});
    const secret     = webhookSecret || env.paymentHubWebhookSecret || "";
    if (!verifyPaymentHubSignature({ payloadRaw, signature, secret })) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    const eventType       = req.body?.type || "unknown";
    const externalEventId = String(req.body?.id || `${eventType}-${Date.now()}`);
    const result = await processPaymentWebhookEvent({
      provider: "PAYMENT_HUB",
      externalEventId,
      eventType,
      payloadJson: req.body
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Webhook handling failed" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* Authenticated routes                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

router.use(requireAuth);

// ── Sola iFields key — returned to frontend for card tokenization ─────────────
router.get("/sola-ifields-key", (_req, res) => {
  try {
    const key = getIFieldsKey();
    return res.json({ iFieldsKey: key });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "iFields key not configured" });
  }
});

// ── Legacy: Browser Post config ───────────────────────────────────────────────
router.get("/browser-post-config", async (req, res) => {
  const invoiceId = String(req.query.invoiceId || "").trim();
  if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" });
  try {
    const config = await getBrowserPostConfig({ invoiceId });
    return res.json(config);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not get Browser Post config" });
  }
});

router.get("/", async (req, res) => {
  const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
  const invoiceId = req.query.invoiceId ? String(req.query.invoiceId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = String(req.query.search || "").trim();
  const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : null;
  const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : null;
  const sortBy = ["paymentDate", "amount", "createdAt"].includes(String(req.query.sortBy || "")) ? String(req.query.sortBy) : "paymentDate";
  const sortDir = req.query.sortDir === "asc" ? "asc" : "desc";
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
  const skip = (page - 1) * limit;
  const where = {
    clientId,
    invoiceId,
    status,
    paymentDate: startDate || endDate ? {
      gte: startDate || undefined,
      lte: endDate || undefined
    } : undefined,
    OR: search ? [
      { externalPaymentId: { contains: search, mode: "insensitive" } },
      { cardLast4: { contains: search, mode: "insensitive" } },
      { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
      { client: { fullName: { contains: search, mode: "insensitive" } } }
    ] : undefined
  };
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { client: true, invoice: true, refunds: { orderBy: { createdAt: "desc" } } },
      orderBy: { [sortBy]: sortDir },
      skip,
      take: limit
    }),
    prisma.payment.count({ where })
  ]);
  const summary = await prisma.payment.aggregate({
    where,
    _sum: { amount: true, refundedAmount: true, netAmount: true },
    _count: { id: true }
  });
  const failedCount = await prisma.payment.count({ where: { ...where, status: "FAILED" } });
  const pendingCount = await prisma.payment.count({ where: { ...where, status: "PENDING" } });
  return res.json({
    items: payments,
    page,
    limit,
    total,
    summary: {
      totalProcessed: Number(summary._sum.amount || 0),
      totalRefunded: Number(summary._sum.refundedAmount || 0),
      netCollected: Number(summary._sum.netAmount || 0) || Number((summary._sum.amount || 0) - (summary._sum.refundedAmount || 0)),
      failedPayments: failedCount,
      pendingPayments: pendingCount
    }
  });
});

router.get("/:id", async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: req.params.id },
    include: { client: true, invoice: true, refunds: { orderBy: { createdAt: "desc" } } }
  });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  return res.json(payment);
});

// ── Sola card-not-present charge (main endpoint used by SolaPaymentModal) ────
router.post("/charge", async (req, res) => {
  try {
    const body   = req.body || {};
    const amount = asNumber(body.amount, "amount");
    if (amount <= 0) return res.status(400).json({ error: "Amount must be greater than 0" });

    let payment;

    if (body.cloudIM) {
      // Card Present — CloudIM terminal
      payment = await createProcessorCharge({
        clientId:      body.clientId   || null,
        invoiceId:     body.invoiceId  || null,
        invoiceNumber: body.invoiceNumber || null,
        amount,
        description:   asOptionalString(body.description),
        billingName:   asOptionalString(body.billingName),
        billingEmail:  asOptionalString(body.billingEmail),
        deviceId:      asOptionalString(body.deviceId),
        cloudIM:       true
      });
    } else {
      // Card Not Present — iFields xToken
      const xToken = requireString(body.xToken, "xToken");
      payment = await createProcessorCharge({
        clientId:      body.clientId   || null,
        invoiceId:     body.invoiceId  || null,
        invoiceNumber: body.invoiceNumber || null,
        amount,
        currency:      (body.currency || "USD").toUpperCase(),
        xToken,
        description:   asOptionalString(body.description),
        billingName:   asOptionalString(body.billingName),
        billingEmail:  asOptionalString(body.billingEmail),
        billingZip:    asOptionalString(body.billingZip)
      });
    }

    // Log activity on linked invoice
    if (payment.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: payment.invoiceId },
        include: { client: true }
      });

      if (invoice) {
        logActivity({
          invoiceId: payment.invoiceId,
          type:      "CARD_PAYMENT",
          message:   `Card payment of $${Number(payment.amount).toFixed(2)} via Sola Payments (${payment.cardBrand || "Card"}${payment.cardLast4 ? ` ···· ${payment.cardLast4}` : ""})`,
          metadata:  { paymentId: payment.id, xRefNum: payment.solaXRefNum, amount: payment.amount }
        }).catch(() => {});

        const settings = await getOrCreateClinicSettings();

        // 1. Send receipt email
        sendReceiptEmail({ invoice: { ...invoice }, payment, settings })
          .then(async () => {
            await prisma.payment.update({ where: { id: payment.id }, data: { receiptSentAt: new Date() } });
            logActivity({
              invoiceId: payment.invoiceId,
              type:      "RECEIPT_SENT",
              message:   `Receipt emailed to ${invoice.client?.email}`,
              metadata:  { to: invoice.client?.email }
            }).catch(() => {});
          })
          .catch((err) => console.error("[sola-receipt-email]", err?.message));

        // 2. Send invoice email with paid status
        sendInvoiceEmail({ invoice: { ...invoice }, settings })
          .catch((err) => console.error("[sola-invoice-email]", err?.message));

        // 3. QB sync (non-blocking)
        syncPaymentToQuickbooks(payment.id).catch((err) => {
          console.error("[qb-sync] Sola payment sync failed", err?.message);
          logActivity({ invoiceId: payment.invoiceId, type: "QB_FAILED", message: `QB sync failed: ${err?.message}` }).catch(() => {});
        });
      }
    }

    await writeAuditLog(req, {
      action:     "PAYMENT_CHARGE_CREATED",
      entityType: "Payment",
      entityId:   payment.id,
      detailsJson: { amount: payment.amount, status: payment.status, xRefNum: payment.solaXRefNum }
    });

    return res.status(201).json(payment);
  } catch (error) {
    console.error("[POST /charge]", error?.message, error?.solaResult);
    return res.status(error.status || 500).json({
      error:      error.message || "Charge failed",
      solaResult: error.solaResult || undefined
    });
  }
});

// ── CloudIM charge (card present) ─────────────────────────────────────────────
router.post("/cloudim-charge", async (req, res) => {
  try {
    const body   = req.body || {};
    const amount = asNumber(body.amount, "amount");
    if (amount <= 0) return res.status(400).json({ error: "Amount must be greater than 0" });

    const payment = await createProcessorCharge({
      clientId:      body.clientId   || null,
      invoiceId:     body.invoiceId  || null,
      invoiceNumber: body.invoiceNumber || null,
      amount,
      description:   asOptionalString(body.description),
      billingName:   asOptionalString(body.billingName),
      billingEmail:  asOptionalString(body.billingEmail),
      deviceId:      asOptionalString(body.deviceId),
      cloudIM:       true
    });

    if (payment.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: payment.invoiceId },
        include: { client: true }
      });
      if (invoice) {
        logActivity({
          invoiceId: payment.invoiceId,
          type:      "CARD_PAYMENT",
          message:   `Card-present payment of $${Number(payment.amount).toFixed(2)} via Sola CloudIM terminal`,
          metadata:  { paymentId: payment.id, xRefNum: payment.solaXRefNum }
        }).catch(() => {});

        const settings = await getOrCreateClinicSettings();
        sendReceiptEmail({ invoice, payment, settings })
          .then(async () => {
            await prisma.payment.update({ where: { id: payment.id }, data: { receiptSentAt: new Date() } });
          })
          .catch((err) => console.error("[cloudim-receipt]", err?.message));

        sendInvoiceEmail({ invoice, settings })
          .catch((err) => console.error("[cloudim-invoice-email]", err?.message));

        syncPaymentToQuickbooks(payment.id).catch(() => {});
      }
    }

    return res.status(201).json(payment);
  } catch (error) {
    console.error("[POST /cloudim-charge]", error?.message);
    return res.status(error.status || 500).json({ error: error.message || "CloudIM charge failed" });
  }
});

router.post("/:id/refunds", async (req, res) => {
  const body   = req.body || {};
  const amount = asNumber(body.amount, "amount");
  try {
    const refund = await createPaymentRefund({
      paymentId: req.params.id,
      amount,
      reason: asOptionalString(body.reason),
      notes:  asOptionalString(body.notes)
    });
    await writeAuditLog(req, {
      action:     "PAYMENT_REFUND_CREATED",
      entityType: "Refund",
      entityId:   refund.id,
      detailsJson: { paymentId: req.params.id, amount: refund.amount }
    });
    return res.status(201).json(refund);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Refund failed" });
  }
});

router.get("/:id/refunds", async (req, res) => {
  const refunds = await prisma.refund.findMany({
    where: { paymentId: req.params.id },
    orderBy: { createdAt: "desc" }
  });
  return res.json(refunds);
});

router.post("/:id/refresh-status", async (req, res) => {
  try {
    const updated = await refreshProcessorPaymentStatus(req.params.id);
    await refreshPaymentAggregateStatus(req.params.id);
    await writeAuditLog(req, {
      action:     "PAYMENT_STATUS_REFRESHED",
      entityType: "Payment",
      entityId:   req.params.id
    });
    return res.json(updated);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Status refresh failed" });
  }
});

router.post("/payment-method-snapshots", async (req, res) => {
  const body    = req.body || {};
  const created = await prisma.paymentMethodSnapshot.create({
    data: {
      clientId:               body.clientId || null,
      externalCustomerId:     asOptionalString(body.externalCustomerId),
      externalPaymentMethodId: requireString(body.externalPaymentMethodId, "externalPaymentMethodId"),
      processor:              body.processor || "SOLA_PAYMENTS",
      brand:                  requireString(body.brand, "brand"),
      last4:                  requireString(body.last4, "last4"),
      expMonth:               body.expMonth ? Number(body.expMonth) : null,
      expYear:                body.expYear  ? Number(body.expYear)  : null,
      billingName:            asOptionalString(body.billingName),
      billingEmail:           asOptionalString(body.billingEmail),
      isDefault:              Boolean(body.isDefault)
    }
  });
  return res.status(201).json(created);
});

// ── Test connection endpoints ─────────────────────────────────────────────────
router.post("/test-connection", requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await testSolaConnection();
    await writeAuditLog(req, {
      action:     "PAYMENT_PROCESSOR_TESTED",
      entityType: "IntegrationAccount",
      entityId:   "SOLA_PAYMENTS"
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Test connection failed" });
  }
});

router.post("/test-connection/payment-hub", requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await testPaymentHubConnection();
    await writeAuditLog(req, {
      action:     "PAYMENT_PROCESSOR_TESTED",
      entityType: "IntegrationAccount",
      entityId:   "PAYMENT_HUB"
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Test connection failed" });
  }
});

export default router;
