import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { sendInvoiceEmail, sendReceiptEmail } from "../utils/mailer.js";
import { writeAuditLog } from "../services/auditLogService.js";
import {
  calculateInvoiceTotals,
  hydrateInvoice,
  nextInvoiceNumber
} from "../services/invoices/invoiceDomainService.js";
import { logActivity, getActivities } from "../services/invoices/invoiceActivityService.js";
import { asDate, asNumber, asOptionalString, requireString } from "../utils/validation.js";
import { recalculateInvoiceBalance } from "../services/payments/paymentService.js";
import { syncInvoiceToQuickbooks, syncPaymentToQuickbooks, updatePaymentInQuickbooks } from "../services/integrations/quickbooks/quickbooksService.js";
import { generatePaymentLink, sendInvoiceToPaymentHub } from "../services/integrations/payment-hub/paymentHubService.js";
import { generateInvoiceHtml } from "../services/invoices/invoiceHtmlService.js";
import { getOrCreateClinicSettings } from "../services/settingsService.js";

const router = express.Router();

// ── HTML invoice view — auth via header OR ?token= query param ───────────────
router.get("/:id/html", async (req, res) => {
  const { verifyToken } = await import("../utils/jwt.js");
  const header = req.headers.authorization || "";
  const token = (header.startsWith("Bearer ") ? header.slice(7) : null) || req.query.token || null;
  if (!token) return res.status(401).send("<p>Not authenticated. Please log in and try again.</p>");
  try {
    verifyToken(token);
  } catch {
    return res.status(401).send("<p>Invalid or expired session. Please log in again.</p>");
  }
  try {
    const html = await generateInvoiceHtml(req.params.id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (error) {
    return res.status(error.status || 500).send(`<p>Error: ${error.message}</p>`);
  }
});

router.use(requireAuth);

// ── List invoices ────────────────────────────────────────────────────────────
router.get("/", requirePermission("aplus.billing.view_invoices"), async (req, res) => {
  const search    = String(req.query.search  || "").trim();
  const status    = String(req.query.status  || "").trim();
  const clientId  = String(req.query.clientId || "").trim();
  const sortBy    = ["issueDate","dueDate","createdAt"].includes(req.query.sortBy) ? req.query.sortBy : "dueDate";
  const sortDir   = req.query.sortDir === "asc" ? "asc" : "desc";
  const where = {
    status: status || undefined,
    clientId: clientId || undefined,
    OR: search ? [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { client: { fullName: { contains: search, mode: "insensitive" } } }
    ] : undefined
  };
  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      client: true,
      appointment: true,
      lineItems: true,
      payments: { include: { refunds: true }, orderBy: { paymentDate: "desc" } }
    },
    orderBy: { [sortBy]: sortDir }
  });
  return res.json(invoices);
});

// ── Get single invoice ───────────────────────────────────────────────────────
router.get("/:id", requirePermission("aplus.billing.view_invoices"), async (req, res) => {
  const invoice = await hydrateInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  return res.json(invoice);
});

// ── Activity timeline ────────────────────────────────────────────────────────
router.get("/:id/activity", requirePermission("aplus.billing.view_invoices"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  const activities = await getActivities(req.params.id);
  return res.json(activities);
});

// ── Create invoice ───────────────────────────────────────────────────────────
router.post("/", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  const body = req.body || {};
  const clientId  = requireString(body.clientId, "clientId");
  const issueDate = asDate(body.issueDate || new Date(), "issueDate");
  const dueDate   = asDate(body.dueDate   || issueDate, "dueDate");
  const lineItems = Array.isArray(body.lineItems) ? body.lineItems.map((item) => ({
    description: requireString(item.description, "lineItems.description"),
    quantity:    asNumber(item.quantity,  "lineItems.quantity"),
    unitPrice:   asNumber(item.unitPrice, "lineItems.unitPrice"),
    amount:      asNumber(item.quantity,  "lineItems.quantity") * asNumber(item.unitPrice, "lineItems.unitPrice"),
    serviceDate: item.serviceDate ? asDate(item.serviceDate, "lineItems.serviceDate") : null
  })) : [];
  if (lineItems.length === 0) return res.status(400).json({ error: "Invoice requires at least one line item" });
  const totals = calculateInvoiceTotals({
    lineItems,
    tax:      asNumber(body.tax      || 0, "tax"),
    discount: asNumber(body.discount || 0, "discount")
  });
  const created = await prisma.invoice.create({
    data: {
      clientId,
      appointmentId: body.appointmentId || null,
      invoiceNumber: await nextInvoiceNumber(),
      issueDate, dueDate,
      status: "DRAFT",
      subtotal: totals.subtotal,
      tax:      totals.tax,
      discount: totals.discount,
      total:    totals.total,
      balanceDue: totals.total,
      notes: asOptionalString(body.notes),
      lineItems: { create: lineItems }
    }
  });
  await writeAuditLog(req, { action: "INVOICE_CREATED", entityType: "Invoice", entityId: created.id, detailsJson: { invoiceNumber: created.invoiceNumber } });
  logActivity({ invoiceId: created.id, type: "CREATED", message: `Invoice ${created.invoiceNumber} created manually`, actorType: "USER", actorId: req.user?.id }).catch(() => {});
  // Auto-sync to QuickBooks if connected (fire and forget)
  syncInvoiceToQuickbooks(created.id, { userId: req.user?.id, triggerType: "user" }).catch(() => {});
  return res.status(201).json(await hydrateInvoice(created.id));
});

// ── Update invoice ───────────────────────────────────────────────────────────
router.put("/:id", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  const body = req.body || {};
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { lineItems: true } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  const hasItemsPayload = Array.isArray(body.lineItems);
  if (hasItemsPayload && body.lineItems.length === 0) return res.status(400).json({ error: "Invoice requires at least one line item" });
  if (hasItemsPayload) {
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoiceLineItem.createMany({
      data: body.lineItems.map((item) => ({
        invoiceId:   invoice.id,
        description: requireString(item.description, "lineItems.description"),
        quantity:    asNumber(item.quantity,  "lineItems.quantity"),
        unitPrice:   asNumber(item.unitPrice, "lineItems.unitPrice"),
        amount:      asNumber(item.quantity,  "lineItems.quantity") * asNumber(item.unitPrice, "lineItems.unitPrice"),
        serviceDate: item.serviceDate ? asDate(item.serviceDate, "lineItems.serviceDate") : null
      }))
    });
    if (invoice.appointmentId && body.lineItems[0]?.quantity !== undefined) {
      const durationMinutes = Math.round(asNumber(body.lineItems[0].quantity, "lineItems.quantity") * 60);
      if (durationMinutes > 0) {
        await prisma.appointment.update({
          where: { id: invoice.appointmentId },
          data: { durationMinutes }
        }).catch(() => {});
      }
    }
  }
  const effectiveItems = hasItemsPayload
    ? body.lineItems.map((item) => ({ amount: asNumber(item.quantity, "lineItems.quantity") * asNumber(item.unitPrice, "lineItems.unitPrice") }))
    : invoice.lineItems;
  const totals = calculateInvoiceTotals({
    lineItems: effectiveItems,
    tax:      body.tax      !== undefined ? asNumber(body.tax,      "tax")      : invoice.tax,
    discount: body.discount !== undefined ? asNumber(body.discount, "discount") : invoice.discount
  });
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      issueDate:  body.issueDate  ? asDate(body.issueDate,  "issueDate")  : undefined,
      dueDate:    body.dueDate    ? asDate(body.dueDate,    "dueDate")    : undefined,
      notes:      body.notes      !== undefined ? asOptionalString(body.notes) : undefined,
      status:     body.status     || undefined,
      subtotal:   totals.subtotal,
      tax:        totals.tax,
      discount:   totals.discount,
      total:      totals.total,
      balanceDue: totals.total,
      qbSyncStatus: "PENDING",
      qbSyncError: null
    }
  });
  const recalculated = await recalculateInvoiceBalance(updated.id);
  await writeAuditLog(req, { action: "INVOICE_UPDATED", entityType: "Invoice", entityId: updated.id });
  logActivity({
    invoiceId: updated.id,
    type: "NOTE",
    message: "Invoice updated; QuickBooks sync queued",
    actorType: "USER",
    actorId: req.user?.id,
    metadata: { total: totals.total, lineItemCount: effectiveItems.length }
  }).catch(() => {});
  syncInvoiceToQuickbooks(updated.id, { userId: req.user?.id, triggerType: "user" })
    .then(() => logActivity({ invoiceId: updated.id, type: "QB_SYNCED", message: "Updated invoice synced to QuickBooks", actorType: "SYSTEM" }).catch(() => {}))
    .catch((err) => {
      console.error("[qb-sync] Invoice update sync failed for", updated.id, err?.message);
      logActivity({ invoiceId: updated.id, type: "QB_FAILED", message: `QuickBooks update sync failed: ${err?.message}` }).catch(() => {});
    });
  return res.json(await hydrateInvoice(recalculated?.id || updated.id));
});

// ── Manage line items ────────────────────────────────────────────────────────
router.post("/:id/line-items", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  const quantity  = asNumber(req.body.quantity,  "quantity");
  const unitPrice = asNumber(req.body.unitPrice, "unitPrice");
  const created = await prisma.invoiceLineItem.create({
    data: {
      invoiceId:   invoice.id,
      description: requireString(req.body.description, "description"),
      quantity, unitPrice,
      amount: quantity * unitPrice,
      serviceDate: req.body.serviceDate ? asDate(req.body.serviceDate, "serviceDate") : null
    }
  });
  const lineItems = await prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } });
  const totals = calculateInvoiceTotals({ lineItems, tax: invoice.tax, discount: invoice.discount });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { subtotal: totals.subtotal, total: totals.total, balanceDue: totals.total } });
  await recalculateInvoiceBalance(invoice.id);
  return res.status(201).json(created);
});

router.delete("/:id/line-items/:lineItemId", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  await prisma.invoiceLineItem.delete({ where: { id: req.params.lineItemId } });
  const lineItems = await prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } });
  const totals = calculateInvoiceTotals({ lineItems, tax: invoice.tax, discount: invoice.discount });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { subtotal: totals.subtotal, total: totals.total, balanceDue: totals.total } });
  await recalculateInvoiceBalance(invoice.id);
  return res.status(204).send();
});

// ── Generate Pay Now link (EPX Hosted Checkout) ──────────────────────────────
router.post("/:id/generate-payment-link", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  try {
    const result = await generatePaymentLink(req.params.id);
    await writeAuditLog(req, { action: "INVOICE_PAYMENT_LINK_GENERATED", entityType: "Invoice", entityId: req.params.id });
    return res.json({ paymentLinkUrl: result.paymentLinkUrl, sessionId: result.sessionId, invoice: result });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not generate payment link" });
  }
});

// ── Send invoice email (HTML with Pay Now button) ────────────────────────────
router.post("/:id/send", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { client: true, lineItems: { orderBy: { createdAt: "asc" } }, payments: true }
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === "VOID") return res.status(400).json({ error: "Cannot send a void invoice" });

  const settings = await getOrCreateClinicSettings();

  // Auto-generate a payment link if Payment Hub is connected and we don't have one yet
  let paymentLinkUrl = invoice.paymentLinkUrl || null;
  if (!paymentLinkUrl && invoice.balanceDue > 0) {
    try {
      const linkResult = await generatePaymentLink(invoice.id);
      paymentLinkUrl = linkResult.paymentLinkUrl;
    } catch {
      // Payment Hub may not be configured — send without pay link
    }
  }

  await sendInvoiceEmail({ invoice, settings, paymentLinkUrl });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: invoice.status === "DRAFT" ? "OPEN" : invoice.status, sentAt: new Date() }
  });

  await writeAuditLog(req, { action: "INVOICE_SENT", entityType: "Invoice", entityId: updated.id });
  logActivity({
    invoiceId: invoice.id,
    type: "SENT",
    message: `Invoice emailed to ${invoice.client?.email}${paymentLinkUrl ? " with Pay Now link" : ""}`,
    actorType: "USER",
    actorId: req.user?.id,
    metadata: { to: invoice.client?.email, paymentLinkUrl }
  }).catch(() => {});

  return res.json({ ...updated, paymentLinkUrl });
});

// ── Record manual payment ────────────────────────────────────────────────────
router.post("/:id/pay", requirePermission("aplus.billing.record_cash"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { client: true } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.status === "VOID") return res.status(400).json({ error: "Cannot pay a void invoice" });

  const amount = req.body?.amount !== undefined ? asNumber(req.body.amount, "amount") : invoice.balanceDue;
  if (amount <= 0) return res.status(400).json({ error: "Payment amount must be greater than 0" });
  if (amount > invoice.balanceDue + 0.01) return res.status(400).json({ error: "Amount exceeds balance due" });

  const paymentMethod         = asOptionalString(req.body?.paymentMethod) || "Other";
  const transactionReference  = asOptionalString(req.body?.transactionReference);
  const notes                 = asOptionalString(req.body?.notes);
  const sendReceipt           = req.body?.sendReceipt !== false; // default true
  const descriptionParts = [paymentMethod, transactionReference, notes].filter(Boolean);

  const payment = await prisma.payment.create({
    data: {
      clientId:       invoice.clientId,
      invoiceId:      invoice.id,
      processor:      "PAYMENT_HUB",
      externalPaymentId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      currency:       "USD",
      paymentDate:    req.body?.paymentDate ? asDate(req.body.paymentDate, "paymentDate") : new Date(),
      description:    descriptionParts.join(" — ") || "Manual invoice payment",
      status:         "SUCCEEDED",
      paymentMethod,
      paymentSourceType: "MANUAL"
    }
  });

  const updatedInvoice = await recalculateInvoiceBalance(invoice.id);

  await writeAuditLog(req, {
    action: "PAYMENT_RECORDED",
    entityType: "Payment",
    entityId: payment.id,
    detailsJson: { invoiceId: invoice.id, amount, paymentMethod }
  });

  logActivity({
    invoiceId: invoice.id,
    type: "MANUAL_PAYMENT",
    message: `Manual payment of ${amount.toFixed(2)} recorded via ${paymentMethod}`,
    actorType: "USER",
    actorId: req.user?.id,
    metadata: { amount, paymentMethod, transactionReference, paymentId: payment.id }
  }).catch(() => {});

  // Send receipt email (non-blocking)
  if (sendReceipt && invoice.client?.email) {
    const settings = await getOrCreateClinicSettings();
    sendReceiptEmail({ invoice: { ...updatedInvoice, client: invoice.client }, payment, settings })
      .then(async () => {
        await prisma.payment.update({ where: { id: payment.id }, data: { receiptSentAt: new Date() } });
        logActivity({ invoiceId: invoice.id, type: "RECEIPT_SENT", message: `Receipt emailed to ${invoice.client.email}`, metadata: { to: invoice.client.email, paymentId: payment.id } }).catch(() => {});
      })
      .catch((err) => console.error("[receipt-email]", err?.message));
  }

  // Non-blocking QB sync
  syncPaymentToQuickbooks(payment.id, { userId: req.user?.id, triggerType: "user" }).catch((err) => {
    console.error("[qb-sync] Payment sync failed for", payment.id, err?.message);
    logActivity({ invoiceId: invoice.id, type: "QB_FAILED", message: `QuickBooks sync failed: ${err?.message}`, metadata: { paymentId: payment.id } }).catch(() => {});
  });

  return res.json({ payment, invoice: updatedInvoice });
});

// ── Send receipt email for a specific payment ────────────────────────────────
router.post("/:id/payments/:paymentId/send-receipt", requirePermission("aplus.billing.view_invoices"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { client: true }
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const payment = await prisma.payment.findFirst({
    where: { id: req.params.paymentId, invoiceId: invoice.id }
  });
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const settings = await getOrCreateClinicSettings();
  try {
    await sendReceiptEmail({ invoice, payment, settings });
    await prisma.payment.update({ where: { id: payment.id }, data: { receiptSentAt: new Date() } });
    logActivity({ invoiceId: invoice.id, type: "RECEIPT_SENT", message: `Receipt manually re-sent to ${invoice.client?.email}`, actorType: "USER", actorId: req.user?.id }).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to send receipt" });
  }
});

// ── Update payment metadata / method and push method changes to QuickBooks ───
router.patch("/:id/payments/:paymentId", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  const payment = await prisma.payment.findFirst({
    where: { id: req.params.paymentId, invoiceId: invoice.id }
  });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  if (payment.paymentSourceType !== "MANUAL") {
    return res.status(400).json({ error: "Only manual payment methods can be edited here. Card payments keep the processor method." });
  }

  const paymentMethod = req.body?.paymentMethod !== undefined ? asOptionalString(req.body.paymentMethod) : payment.paymentMethod;
  const paymentDate = req.body?.paymentDate ? asDate(req.body.paymentDate, "paymentDate") : undefined;
  const transactionReference = asOptionalString(req.body?.transactionReference);
  const notes = asOptionalString(req.body?.notes);
  const descriptionParts = [paymentMethod, transactionReference, notes].filter(Boolean);

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      paymentMethod,
      paymentDate,
      description: descriptionParts.length ? descriptionParts.join(" — ") : payment.description
    }
  });

  await writeAuditLog(req, {
    action: "PAYMENT_UPDATED",
    entityType: "Payment",
    entityId: payment.id,
    detailsJson: { invoiceId: invoice.id, paymentMethod }
  });
  logActivity({
    invoiceId: invoice.id,
    type: "NOTE",
    message: `Payment method updated to ${paymentMethod || "Other"}; QuickBooks payment update queued`,
    actorType: "USER",
    actorId: req.user?.id,
    metadata: { paymentId: payment.id, paymentMethod }
  }).catch(() => {});

  updatePaymentInQuickbooks(payment.id, { userId: req.user?.id, triggerType: "user" })
    .then(() => logActivity({ invoiceId: invoice.id, type: "QB_SYNCED", message: "Payment update synced to QuickBooks", actorType: "SYSTEM", metadata: { paymentId: payment.id } }).catch(() => {}))
    .catch((err) => {
      console.error("[qb-sync] Payment update failed for", payment.id, err?.message);
      logActivity({ invoiceId: invoice.id, type: "QB_FAILED", message: `QuickBooks payment update failed: ${err?.message}`, metadata: { paymentId: payment.id } }).catch(() => {});
    });

  return res.json({ payment: updated, invoice: await hydrateInvoice(invoice.id) });
});

// ── Void invoice ─────────────────────────────────────────────────────────────
router.post("/:id/void", requirePermission("aplus.billing.void"), async (req, res) => {
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: "VOID", balanceDue: 0 }
  });
  await writeAuditLog(req, { action: "INVOICE_VOIDED", entityType: "Invoice", entityId: invoice.id });
  logActivity({ invoiceId: invoice.id, type: "VOIDED", message: "Invoice voided", actorType: "USER", actorId: req.user?.id }).catch(() => {});
  return res.json(invoice);
});

// ── Delete invoice ───────────────────────────────────────────────────────────
router.delete("/:id", requirePermission("aplus.billing.void"), async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { payments: true } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  if (invoice.payments?.length > 0) return res.status(400).json({ error: "Cannot delete an invoice that has payments. Void it instead." });
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoice.delete({ where: { id: invoice.id } });
  await writeAuditLog(req, { action: "INVOICE_DELETED", entityType: "Invoice", entityId: invoice.id, detailsJson: { invoiceNumber: invoice.invoiceNumber } });
  return res.status(204).send();
});

// ── Duplicate invoice ────────────────────────────────────────────────────────
router.post("/:id/duplicate", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  const existing = await hydrateInvoice(req.params.id);
  if (!existing) return res.status(404).json({ error: "Invoice not found" });
  const lineItems = existing.lineItems.map((item) => ({
    description: item.description,
    quantity:    item.quantity,
    unitPrice:   item.unitPrice,
    amount:      item.amount,
    serviceDate: item.serviceDate
  }));
  const created = await prisma.invoice.create({
    data: {
      clientId:      existing.clientId,
      invoiceNumber: await nextInvoiceNumber(),
      issueDate:     new Date(),
      dueDate:       existing.dueDate,
      status:        "DRAFT",
      subtotal:      existing.subtotal,
      tax:           existing.tax,
      discount:      existing.discount,
      total:         existing.total,
      balanceDue:    existing.total,
      notes:         existing.notes,
      lineItems:     { create: lineItems }
    }
  });
  await writeAuditLog(req, { action: "INVOICE_DUPLICATED", entityType: "Invoice", entityId: created.id, detailsJson: { sourceInvoiceId: existing.id } });
  logActivity({ invoiceId: created.id, type: "DUPLICATED", message: `Duplicated from ${existing.invoiceNumber}`, actorType: "USER", actorId: req.user?.id }).catch(() => {});
  return res.status(201).json(await hydrateInvoice(created.id));
});

// ── QuickBooks sync ───────────────────────────────────────────────────────────
router.post("/:id/sync/quickbooks", requirePermission("aplus.quickbooks.trigger_sync"), async (req, res) => {
  try {
    const invoice = await syncInvoiceToQuickbooks(req.params.id, { userId: req.user?.id, triggerType: "user" });
    await writeAuditLog(req, { action: "QUICKBOOKS_INVOICE_SYNC_TRIGGERED", entityType: "Invoice", entityId: req.params.id });
    logActivity({ invoiceId: req.params.id, type: "QB_SYNCED", message: "Invoice synced to QuickBooks", actorType: "USER", actorId: req.user?.id }).catch(() => {});
    return res.json(invoice);
  } catch (error) {
    logActivity({ invoiceId: req.params.id, type: "QB_FAILED", message: `QB sync failed: ${error.message}` }).catch(() => {});
    return res.status(error.status || 500).json({ error: error.message || "Sync failed" });
  }
});

// ── Payment Hub / hosted checkout link sync (legacy + new) ───────────────────
router.post("/:id/sync/payment-hub", requirePermission("aplus.billing.sync"), async (req, res) => {
  try {
    const invoice = await sendInvoiceToPaymentHub(req.params.id);
    await writeAuditLog(req, { action: "PAYMENT_HUB_INVOICE_SYNC_TRIGGERED", entityType: "Invoice", entityId: req.params.id });
    return res.json(invoice);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Payment Hub sync failed" });
  }
});

export default router;
