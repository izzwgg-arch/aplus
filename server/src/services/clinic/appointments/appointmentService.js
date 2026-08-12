import crypto from "crypto";
import { addMonths, addWeeks } from "date-fns";
import { prisma } from "../../../config/prisma.js";
import { resolveAppointmentPricing } from "../../pricing/pricingResolverService.js";
import { reconcileReminderJobsForAppointment } from "../../reminders/reminderReconcileService.js";

export async function hasProviderConflict({ startsAt, endsAt, providerId, ignoreId }) {
  // No provider → no conflict possible
  if (!providerId) return false;
  const conflict = await prisma.appointment.findFirst({
    where: {
      providerId,
      id: ignoreId ? { not: ignoreId } : undefined,
      status: { in: ["SCHEDULED", "PENDING", "CONFIRMED", "RESCHEDULED", "RUNNING_LATE"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    }
  });
  return Boolean(conflict);
}

function buildSnapshotData(pricing, payload) {
  return {
    standardRateSnapshot: pricing.standardRateSnapshot,
    overtimeRateSnapshot: pricing.overtimeRateSnapshot,
    effectiveRate: pricing.effectiveRate,
    pricingSource: pricing.pricingSource,
    serviceNameSnapshot: pricing.service.name,
    providerNameSnapshot: pricing.provider?.fullName ?? null,
    isOvertime: payload.isOvertime === true,
    removeOvertimeCharge: payload.removeOvertimeCharge === true,
    overtimeReason: payload.overtimeReason || null,
    billingNotes: payload.billingNotes || null
  };
}

export async function previewAppointmentPricing(payload) {
  return resolveAppointmentPricing({
    serviceId: payload.serviceId,
    providerId: payload.providerId,
    durationMinutes: payload.durationMinutes,
    isOvertime: payload.isOvertime,
    removeOvertimeCharge: payload.removeOvertimeCharge
  });
}

export async function listAppointments() {
  return prisma.appointment.findMany({
    include: { client: true, provider: true, service: true },
    orderBy: { startsAt: "asc" }
  });
}

export async function getAppointmentById(id) {
  return prisma.appointment.findUnique({
    where: { id },
    include: {
      client: true,
      provider: true,
      service: true,
      invoice: { include: { payments: true, lineItems: { orderBy: { createdAt: "asc" } } } },
      report: true,
    }
  });
}

export async function createAppointment(payload) {
  // Normalize providerId — empty string is not a valid FK value
  const providerId = payload.providerId || null;

  const startsAt = new Date(payload.startsAt || payload.startAt);
  const endsAt = payload.endsAt ? new Date(payload.endsAt) : new Date(startsAt.getTime() + Number(payload.durationMinutes || 60) * 60000);
  const durationMinutes = Number(payload.durationMinutes || Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));

  const pricing = await resolveAppointmentPricing({
    serviceId: payload.serviceId,
    providerId,
    durationMinutes,
    isOvertime: payload.isOvertime === true,
    removeOvertimeCharge: payload.removeOvertimeCharge === true
  });

  if (await hasProviderConflict({ startsAt, endsAt, providerId })) {
    const error = new Error("Appointment conflict detected");
    error.status = 409;
    throw error;
  }

  const recurrenceGroupId = payload.recurrenceType && payload.recurrenceType !== "NONE" ? crypto.randomUUID() : null;
  const base = await prisma.appointment.create({
    data: {
      clientId: payload.clientId,
      providerId,
      serviceId: payload.serviceId,
      title: payload.title || pricing.service.name,
      startAt: startsAt,
      endAt: endsAt,
      startsAt,
      endsAt,
      location: payload.location || null,
      colorId: payload.colorId || null,
      notes: payload.notes || null,
      durationMinutes,
      reminderEnabled: payload.reminderEnabled !== false,
      recurrenceType: payload.recurrenceType || "NONE",
      recurrenceGroupId,
      ...buildSnapshotData(pricing, payload)
    }
  });

  const created = [base];
  if (payload.recurrenceType === "WEEKLY" || payload.recurrenceType === "MONTHLY") {
    const total = Number(payload.recurrenceCount || 4);
    for (let i = 1; i < total; i += 1) {
      const nextStart = payload.recurrenceType === "WEEKLY" ? addWeeks(startsAt, i) : addMonths(startsAt, i);
      const nextEnd = new Date(nextStart.getTime() + durationMinutes * 60000);
      if (await hasProviderConflict({ startsAt: nextStart, endsAt: nextEnd, providerId })) continue;
      const child = await prisma.appointment.create({
        data: {
          clientId: payload.clientId,
          providerId,
          serviceId: payload.serviceId,
          title: payload.title || pricing.service.name,
          startAt: nextStart,
          endAt: nextEnd,
          startsAt: nextStart,
          endsAt: nextEnd,
          location: payload.location || null,
          notes: payload.notes || null,
          durationMinutes,
          reminderEnabled: payload.reminderEnabled !== false,
          remindersUseDefaults: payload.remindersUseDefaults !== false,
          reminderEmailEnabledOverride: payload.reminderEmailEnabledOverride ?? null,
          reminderSmsEnabledOverride: payload.reminderSmsEnabledOverride ?? null,
          remindClientOverride: payload.remindClientOverride ?? null,
          remindProviderOverride: payload.remindProviderOverride ?? null,
          reminderOffsetsOverrideJson: payload.reminderOffsetsOverrideJson ?? null,
          recurrenceType: payload.recurrenceType,
          recurrenceGroupId: base.recurrenceGroupId || base.id,
          ...buildSnapshotData(pricing, payload)
        }
      });
      await reconcileReminderJobsForAppointment(child.id).catch(() => {});
      created.push(child);
    }
  }
  return created;
}

export async function updateAppointment(id, payload) {
  const current = await prisma.appointment.findUnique({ where: { id } });
  if (!current) {
    const error = new Error("Appointment not found");
    error.status = 404;
    throw error;
  }

  const startsAt = payload.startsAt || payload.startAt ? new Date(payload.startsAt || payload.startAt) : current.startsAt;
  const endsAt = payload.endsAt
    ? new Date(payload.endsAt)
    : new Date(startsAt.getTime() + Number(payload.durationMinutes || current.durationMinutes || 60) * 60000);
  const durationMinutes = Number(payload.durationMinutes || Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
  const serviceId = payload.serviceId || current.serviceId;
  // Allow explicitly clearing provider by passing null/empty string; fall back to current only when key is absent
  const providerId = Object.prototype.hasOwnProperty.call(payload, "providerId")
    ? (payload.providerId || null)
    : current.providerId;

  const pricing = await resolveAppointmentPricing({
    serviceId,
    providerId,
    durationMinutes,
    isOvertime: payload.isOvertime ?? current.isOvertime,
    removeOvertimeCharge: payload.removeOvertimeCharge ?? current.removeOvertimeCharge
  });

  if (await hasProviderConflict({ startsAt, endsAt, providerId, ignoreId: id })) {
    const error = new Error("Appointment conflict detected");
    error.status = 409;
    throw error;
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      title: payload.title || current.title,
      providerId,
      serviceId,
      startAt: startsAt,
      endAt: endsAt,
      startsAt,
      endsAt,
      location: payload.location ?? current.location,
      colorId: payload.colorId !== undefined ? (payload.colorId || null) : current.colorId,
      notes: payload.notes ?? current.notes,
      durationMinutes,
      reminderEnabled: typeof payload.reminderEnabled === "boolean" ? payload.reminderEnabled : current.reminderEnabled,
      remindersUseDefaults:
        typeof payload.remindersUseDefaults === "boolean" ? payload.remindersUseDefaults : current.remindersUseDefaults,
      reminderEmailEnabledOverride:
        payload.reminderEmailEnabledOverride !== undefined
          ? payload.reminderEmailEnabledOverride
          : current.reminderEmailEnabledOverride,
      reminderSmsEnabledOverride:
        payload.reminderSmsEnabledOverride !== undefined
          ? payload.reminderSmsEnabledOverride
          : current.reminderSmsEnabledOverride,
      remindClientOverride:
        payload.remindClientOverride !== undefined ? payload.remindClientOverride : current.remindClientOverride,
      remindProviderOverride:
        payload.remindProviderOverride !== undefined ? payload.remindProviderOverride : current.remindProviderOverride,
      reminderOffsetsOverrideJson:
        payload.reminderOffsetsOverrideJson !== undefined
          ? payload.reminderOffsetsOverrideJson
          : current.reminderOffsetsOverrideJson,
      status: payload.status || current.status,
      ...buildSnapshotData(pricing, {
        isOvertime: payload.isOvertime ?? current.isOvertime,
        removeOvertimeCharge: payload.removeOvertimeCharge ?? current.removeOvertimeCharge,
        overtimeReason: payload.overtimeReason ?? current.overtimeReason,
        billingNotes: payload.billingNotes ?? current.billingNotes
      })
    },
    include: { client: true, provider: true, service: true }
  });

  await reconcileReminderJobsForAppointment(id).catch(() => {});
  return updated;
}
