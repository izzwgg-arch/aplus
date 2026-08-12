import { prisma } from "../config/prisma.js";
import { getOrCreateClinicSettings } from "./settingsService.js";
import { nextInvoiceNumber, hydrateInvoice } from "./invoices/invoiceDomainService.js";
import { logActivity } from "./invoices/invoiceActivityService.js";
import { hasProviderConflict } from "./clinic/appointments/appointmentService.js";
import { recalculateInvoiceBalance } from "./payments/paymentService.js";

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Creates an invoice from a completed appointment.
 * Safe to call multiple times — returns existing invoice if one already exists
 * for this appointment (appointmentId is @unique on Invoice).
 */
export async function createInvoiceFromAppointment(appointmentId) {
  // Duplicate prevention — appointmentId is @unique on Invoice
  const existing = await prisma.invoice.findUnique({ where: { appointmentId } });
  if (existing) return existing;

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, service: true }
  });
  if (!appointment) throw new Error("Appointment not found");

  const settings = await getOrCreateClinicSettings();

  // Determine billable rate: use snapshot stored on appointment, fall back to client rate, then clinic default
  const effectiveRate =
    appointment.effectiveRate ??
    appointment.client?.hourlyRate ??
    settings.defaultHourlyRate ??
    0;

  const hours = (appointment.durationMinutes || 60) / 60;
  const amount = Math.round(hours * effectiveRate * 100) / 100;

  const description =
    appointment.serviceNameSnapshot ||
    appointment.service?.name ||
    "ABA Therapy Session";

  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000); // net-30

  const invoice = await prisma.invoice.create({
    data: {
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      invoiceNumber: await nextInvoiceNumber(),
      issueDate,
      dueDate,
      status: "OPEN",
      subtotal: amount,
      tax: 0,
      discount: 0,
      total: amount,
      balanceDue: amount,
      qbSyncStatus: "NOT_SYNCED",
      lineItems: {
        create: [
          {
            description: `${description} — ${new Date(appointment.startsAt).toLocaleDateString()}`,
            quantity: hours,
            unitPrice: effectiveRate,
            amount,
            serviceDate: appointment.startsAt
          }
        ]
      }
    }
  });

  // Log creation activity (non-blocking)
  logActivity({
    invoiceId: invoice.id,
    type: "CREATED",
    message: `Invoice ${invoice.invoiceNumber} auto-created from completed appointment`,
    metadata: {
      appointmentId,
      durationMinutes: appointment.durationMinutes,
      effectiveRate,
      hours,
      amount
    }
  }).catch(() => {});

  return hydrateInvoice(invoice.id);
}

const PAID_LIKE = ["SUCCEEDED", "AUTHORIZED", "PARTIALLY_REFUNDED"];

/**
 * For a completed appointment with a single-line invoice (typical auto-invoice),
 * set billable hours + end time from a target dollar amount at the invoice hourly rate,
 * and shrink/expand the invoice total to match (before card payment).
 */
export async function syncAppointmentAndInvoiceToTargetAmount(appointmentId, rawTargetAmount) {
  const targetAmount = round2(Number(rawTargetAmount));
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    const err = new Error("Amount must be a positive number");
    err.status = 400;
    throw err;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      invoice: { include: { lineItems: { orderBy: { createdAt: "asc" } }, payments: true } },
      client: true,
      service: true
    }
  });
  if (!appointment) {
    const err = new Error("Appointment not found");
    err.status = 404;
    throw err;
  }
  if (appointment.status !== "COMPLETED") {
    const err = new Error("Only completed appointments can be adjusted from payment amount");
    err.status = 400;
    throw err;
  }
  if (!appointment.invoice) {
    const err = new Error("This appointment has no invoice yet");
    err.status = 400;
    throw err;
  }

  const invoice = appointment.invoice;
  if (invoice.status === "VOID") {
    const err = new Error("Cannot adjust a void invoice");
    err.status = 400;
    throw err;
  }
  const paidLike = invoice.payments?.some((p) => PAID_LIKE.includes(p.status));
  if (paidLike) {
    const err = new Error("Cannot change billable hours after a payment has been recorded on this invoice");
    err.status = 400;
    throw err;
  }

  const lineItems = invoice.lineItems || [];
  if (lineItems.length !== 1) {
    const err = new Error("This action only supports invoices with a single line item (standard session invoice)");
    err.status = 400;
    throw err;
  }

  const line = lineItems[0];
  const rate = round2(
    Number(line.unitPrice) ||
      appointment.effectiveRate ||
      appointment.client?.hourlyRate ||
      (await getOrCreateClinicSettings()).defaultHourlyRate ||
      0
  );
  if (!rate || rate <= 0) {
    const err = new Error("Could not determine hourly rate for this session");
    err.status = 400;
    throw err;
  }

  const minAmount = round2(rate / 60); // at least one minute
  if (targetAmount < minAmount) {
    const err = new Error(`Amount must be at least ${minAmount.toFixed(2)} (one minute at ${rate.toFixed(2)}/hr)`);
    err.status = 400;
    throw err;
  }

  const maxAmount = round2(Number(invoice.total));
  if (targetAmount > maxAmount + 0.001) {
    const err = new Error(`Amount cannot exceed the current invoice total (${maxAmount.toFixed(2)}). Edit the invoice or extend the session first.`);
    err.status = 400;
    throw err;
  }

  const hours = round2(targetAmount / rate);
  const durationMinutes = Math.max(1, Math.round(hours * 60));
  const startsAt = new Date(appointment.startsAt);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  if (appointment.providerId) {
    const conflict = await hasProviderConflict({
      startsAt,
      endsAt,
      providerId: appointment.providerId,
      ignoreId: appointment.id
    });
    if (conflict) {
      const err = new Error("Adjusted end time overlaps another appointment for this provider");
      err.status = 409;
      throw err;
    }
  }

  const descriptionBase = (line.description || "").split(" — ")[0] || appointment.serviceNameSnapshot || appointment.service?.name || "Session";
  const serviceDate = line.serviceDate || startsAt;
  const newDescription = `${descriptionBase} — ${new Date(serviceDate).toLocaleDateString()}`;

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        durationMinutes,
        startsAt,
        endsAt,
        startAt: startsAt,
        endAt: endsAt
      }
    });

    await tx.invoiceLineItem.update({
      where: { id: line.id },
      data: {
        description: newDescription,
        quantity: hours,
        unitPrice: rate,
        amount: targetAmount
      }
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal: targetAmount,
        tax: 0,
        discount: 0,
        total: targetAmount,
        balanceDue: targetAmount,
        status: "OPEN",
        qbSyncStatus: "NOT_SYNCED",
        qbSyncError: null
      }
    });
  });

  await recalculateInvoiceBalance(invoice.id);

  const hydrated = await hydrateInvoice(invoice.id);
  logActivity({
    invoiceId: invoice.id,
    type: "NOTE",
    message: `Billable time updated to ${hours} h (${durationMinutes} min) for $${targetAmount.toFixed(2)} at $${rate.toFixed(2)}/hr before payment`,
    metadata: { appointmentId, hours, durationMinutes, targetAmount, rate }
  }).catch(() => {});

  return {
    invoice: hydrated,
    appointment: {
      id: appointmentId,
      durationMinutes,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      hours,
      hourlyRate: rate
    }
  };
}
