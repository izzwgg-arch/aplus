import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { can } from "../services/permissionsService.js";
import { sendEmail } from "../utils/mailer.js";
import { writeAuditLog } from "../services/auditLogService.js";
import {
  createAppointment,
  getAppointmentById,
  hasProviderConflict,
  listAppointments,
  previewAppointmentPricing,
  updateAppointment
} from "../services/clinic/appointments/appointmentService.js";
import { asDate, asNumber, requireString } from "../utils/validation.js";
import { decryptText } from "../utils/crypto.js";
import { createInvoiceFromAppointment, syncAppointmentAndInvoiceToTargetAmount } from "../services/invoiceService.js";
import {
  cancelQueuedJobsForAppointment,
  reconcileReminderJobsForAppointment
} from "../services/reminders/reminderReconcileService.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", requirePermission("aplus.appointments.view"), async (_req, res) => {
  const appts = await listAppointments();
  return res.json(appts);
});

router.get("/:id/history", requirePermission("aplus.appointments.view"), async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "Appointment", entityId: req.params.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, action: true, actorEmail: true, detailsJson: true, createdAt: true },
  });
  return res.json(logs);
});

router.get("/:id", requirePermission("aplus.appointments.view"), async (req, res) => {
  const appt = await getAppointmentById(req.params.id);
  if (!appt) return res.status(404).json({ error: "Appointment not found" });
  // Decrypt sensitive client fields so the details drawer can display them
  if (appt.client) {
    appt.client.address = decryptText(appt.client.addressEncrypted ?? "");
    appt.client.notes   = decryptText(appt.client.notesEncrypted  ?? "");
    delete appt.client.addressEncrypted;
    delete appt.client.notesEncrypted;
  }
  return res.json(appt);
});

router.post("/preview-pricing", requirePermission("aplus.appointments.view"), async (req, res) => {
  try {
    const pricing = await previewAppointmentPricing({
      serviceId: requireString(req.body.serviceId, "Service"),
      providerId: req.body.providerId || null,
      durationMinutes: asNumber(req.body.durationMinutes || 60, "Duration"),
      isOvertime: req.body.isOvertime === true,
      removeOvertimeCharge: req.body.removeOvertimeCharge === true
    });
    return res.json(pricing);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not preview appointment pricing" });
  }
});

router.post("/", requirePermission("aplus.appointments.create"), async (req, res) => {
  try {
    requireString(req.body.clientId, "Client");
    requireString(req.body.serviceId, "Service");
    const startsAt = asDate(req.body.startsAt || req.body.startAt, "Start time");
    const endsAt = req.body.endsAt ? asDate(req.body.endsAt, "End time") : null;
    const durationMinutes = req.body.durationMinutes !== undefined
      ? asNumber(req.body.durationMinutes, "Duration")
      : Math.round(((endsAt || startsAt).getTime() - startsAt.getTime()) / 60000) || 60;
    if (endsAt && endsAt <= startsAt) {
      return res.status(400).json({ error: "End time must be after start time" });
    }

    const created = await createAppointment({
      ...req.body,
      startsAt,
      endsAt,
      durationMinutes
    });
    await writeAuditLog(req, {
      action: "APPOINTMENT_CREATED",
      entityType: "Appointment",
      entityId: created[0]?.id,
      detailsJson: {
        serviceId: req.body.serviceId,
        providerId: req.body.providerId,
        isOvertime: req.body.isOvertime === true,
        removeOvertimeCharge: req.body.removeOvertimeCharge === true
      }
    });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to create appointment" });
  }
});

router.put("/:id", requirePermission("aplus.appointments.edit"), async (req, res) => {
  try {
    // Granular checks for higher-sensitivity fields, on top of the base edit permission.
    if (req.body.status === "NO_SHOW" && !(await can(req.user.sub, "aplus.appointments.mark_no_show"))) {
      return res.status(403).json({ error: "Forbidden", requiredPermission: "aplus.appointments.mark_no_show" });
    }
    if (req.body.status === "CANCELLED" && !(await can(req.user.sub, "aplus.appointments.cancel"))) {
      return res.status(403).json({ error: "Forbidden", requiredPermission: "aplus.appointments.cancel" });
    }
    if (req.body.providerId !== undefined && !(await can(req.user.sub, "aplus.appointments.change_provider"))) {
      return res.status(403).json({ error: "Forbidden", requiredPermission: "aplus.appointments.change_provider" });
    }
    if (req.body.serviceId !== undefined && !(await can(req.user.sub, "aplus.appointments.change_service"))) {
      return res.status(403).json({ error: "Forbidden", requiredPermission: "aplus.appointments.change_service" });
    }
    if (req.body.startsAt !== undefined) {
      const existing = await prisma.appointment.findUnique({ where: { id: req.params.id }, select: { startsAt: true } });
      const nextStart = new Date(req.body.startsAt);
      if (existing && !Number.isNaN(nextStart.getTime()) && nextStart < new Date() && existing.startsAt.getTime() !== nextStart.getTime()) {
        if (!(await can(req.user.sub, "aplus.appointments.backdate"))) {
          return res.status(403).json({ error: "Forbidden", requiredPermission: "aplus.appointments.backdate" });
        }
      }
    }
    const currentForBill = await prisma.appointment.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (currentForBill?.status === "COMPLETED" && (req.body.billingNotes !== undefined || req.body.effectiveRate !== undefined || req.body.standardRateSnapshot !== undefined || req.body.overtimeRateSnapshot !== undefined)) {
      if (!(await can(req.user.sub, "aplus.appointments.edit_completed_bill"))) {
        return res.status(403).json({ error: "Forbidden", requiredPermission: "aplus.appointments.edit_completed_bill" });
      }
    }
    const updated = await updateAppointment(req.params.id, req.body);
    await writeAuditLog(req, {
      action: "APPOINTMENT_UPDATED",
      entityType: "Appointment",
      entityId: updated.id,
      detailsJson: {
        serviceId: updated.serviceId,
        providerId: updated.providerId,
        isOvertime: updated.isOvertime,
        removeOvertimeCharge: updated.removeOvertimeCharge,
        effectiveRate: updated.effectiveRate
      }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not update appointment" });
  }
});

router.delete("/:id", requirePermission("aplus.appointments.cancel"), async (req, res) => {
  await prisma.appointment.delete({ where: { id: req.params.id } });
  await writeAuditLog(req, {
    action: "APPOINTMENT_DELETED",
    entityType: "Appointment",
    entityId: req.params.id
  });
  return res.status(204).send();
});

router.post("/:id/cancel", requirePermission("aplus.appointments.cancel"), async (req, res) => {
  await cancelQueuedJobsForAppointment(req.params.id, "Appointment cancelled");
  const appt = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: "CANCELLED" },
    include: { client: true, provider: true }
  });
  await sendEmail({
    to: appt.client.email,
    subject: "Appointment cancelled",
    html: "<p>Your appointment has been cancelled or rescheduled.</p>"
  });
  if (appt.provider?.email) {
    await sendEmail({
      to: appt.provider.email,
      subject: "Client appointment cancelled",
      html: "<p>An appointment was cancelled/rescheduled.</p>"
    });
  }
  return res.json(appt);
});

router.post("/:id/reschedule", requirePermission("aplus.appointments.edit"), async (req, res) => {
  const { startsAt, durationMinutes } = req.body;
  const nextStart = new Date(startsAt);
  const nextDuration = Number(durationMinutes || 60);
  const nextEnd = new Date(nextStart.getTime() + nextDuration * 60000);

  const current = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Appointment not found" });
  if (await hasProviderConflict({ startsAt: nextStart, endsAt: nextEnd, providerId: current.providerId, ignoreId: current.id })) {
    return res.status(409).json({ error: "Appointment conflict detected" });
  }

  const appt = await prisma.appointment.update({
    where: { id: req.params.id },
    data: {
      startsAt: nextStart,
      endsAt: nextEnd,
      durationMinutes: nextDuration,
      status: "RESCHEDULED",
      reminder24SentAt: null,
      reminder1SentAt: null
    },
    include: { client: true, provider: true, service: true }
  });

  await reconcileReminderJobsForAppointment(appt.id).catch(() => {});

  await sendEmail({
    to: appt.client.email,
    subject: "Appointment rescheduled",
    html: `<p>Your appointment has been rescheduled to ${appt.startsAt.toLocaleString()}.</p>`
  });
  if (appt.provider?.email) {
    await sendEmail({
      to: appt.provider.email,
      subject: "Client appointment rescheduled",
      html: `<p>Appointment has been rescheduled to ${appt.startsAt.toLocaleString()}.</p>`
    });
  }

  return res.json(appt);
});

router.post("/:id/complete", requirePermission("aplus.appointments.complete"), async (req, res) => {
  await cancelQueuedJobsForAppointment(req.params.id, "Appointment completed");
  const appt = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { status: "COMPLETED" },
    include: { invoice: { include: { payments: true, lineItems: { orderBy: { createdAt: "asc" } } } } }
  });

  // Auto-create invoice synchronously so the response always includes it
  let invoice = appt.invoice;
  if (!invoice) {
    try {
      invoice = await createInvoiceFromAppointment(appt.id);
    } catch (err) {
      console.error("[auto-invoice] Failed to create invoice for appointment", appt.id, err?.message);
    }
  }

  await writeAuditLog(req, {
    action: "APPOINTMENT_COMPLETED",
    entityType: "Appointment",
    entityId: appt.id
  });

  return res.json({ ...appt, invoice: invoice ?? null });
});

// Align session length + invoice total to a target dollar amount (before card payment)
router.post("/:id/sync-billing-to-amount", requirePermission("aplus.appointments.edit_completed_bill"), async (req, res) => {
  try {
    const amount = asNumber(req.body.amount, "amount");
    const result = await syncAppointmentAndInvoiceToTargetAmount(req.params.id, amount);
    await writeAuditLog(req, {
      action: "APPOINTMENT_BILLING_SYNCED",
      entityType: "Appointment",
      entityId: req.params.id,
      detailsJson: { amount, ...result.appointment }
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not sync billing" });
  }
});

// Create (or return existing) invoice for a completed appointment
router.post("/:id/create-invoice", requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { invoice: { include: { payments: true } } }
    });
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    if (appt.status !== "COMPLETED") {
      return res.status(400).json({ error: "Invoice can only be created for completed appointments" });
    }
    const invoice = await createInvoiceFromAppointment(appt.id);
    await writeAuditLog(req, {
      action: "APPOINTMENT_INVOICED",
      entityType: "Appointment",
      entityId: appt.id,
      detailsJson: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }
    });
    // Return invoice with payments included
    const full = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { payments: true, lineItems: { orderBy: { createdAt: "asc" } } }
    });
    return res.status(201).json(full);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not create invoice" });
  }
});

export default router;
