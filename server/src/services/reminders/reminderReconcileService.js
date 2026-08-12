import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma.js";
import { getOrCreateReminderGlobalSettings } from "./reminderGlobalSettingsService.js";
import { parseOffsetsJson, computeScheduledFor } from "./reminderScheduling.js";

const SCHEDULABLE = new Set(["SCHEDULED", "PENDING", "CONFIRMED", "RESCHEDULED", "RUNNING_LATE"]);

function globalAllowsEmail(global) {
  return global.emailEnabledByDefault === true;
}

function globalAllowsSms(global) {
  return global.smsEnabledByDefault === true && global.smsProviderEnabled === true;
}

function clientAllowsEmail(pref) {
  if (!pref) return true;
  return pref.emailRemindersEnabled !== false;
}

function clientAllowsSms(pref, global) {
  if (!pref) return globalAllowsSms(global);
  if (pref.smsOptOut) return false;
  return pref.smsRemindersEnabled !== false;
}

function providerAllowsEmail(pref) {
  if (!pref) return true;
  return pref.emailRemindersEnabled !== false;
}

function providerAllowsSms(pref) {
  if (!pref) return false;
  return pref.smsRemindersEnabled === true;
}

function applyPreferredChannel(pref, emailOk, smsOk, defaultMode = "BOTH") {
  const p = String(pref?.preferredChannel || defaultMode).toUpperCase();
  if (p === "EMAIL") return { email: emailOk, sms: false };
  if (p === "SMS") return { email: false, sms: smsOk };
  return { email: emailOk, sms: smsOk };
}

function clientSmsPhone(client) {
  const cell = client?.phoneCell?.trim();
  const primary = client?.phone?.trim();
  return cell || primary || null;
}

/**
 * Cancels queued jobs and creates fresh ones from current appointment + settings.
 */
export async function reconcileReminderJobsForAppointment(appointmentId) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true, provider: true, service: true }
  });
  if (!appt) return { ok: false, reason: "not_found" };

  await prisma.reminderJob.updateMany({
    where: { appointmentId, status: "QUEUED" },
    data: { status: "CANCELLED", skipReason: "Superseded by reconcile" }
  });

  const global = await getOrCreateReminderGlobalSettings();
  if (!global.remindersEnabledGlobal || !appt.reminderEnabled) {
    return { ok: true, reason: "reminders_disabled" };
  }
  if (!SCHEDULABLE.has(appt.status)) {
    return { ok: true, reason: "status_not_schedulable" };
  }
  if (new Date(appt.startsAt) <= new Date()) {
    return { ok: true, reason: "appointment_in_past" };
  }

  const clientPref = await prisma.clientCommunicationPreference.findUnique({
    where: { clientId: appt.clientId }
  });

  const effectiveProviderId = appt.providerId || global.defaultReminderProviderId || null;
  let providerForReminders = appt.provider;
  if (effectiveProviderId && (!providerForReminders || providerForReminders.id !== effectiveProviderId)) {
    providerForReminders = await prisma.provider.findUnique({ where: { id: effectiveProviderId } });
  }
  const providerPref = effectiveProviderId
    ? await prisma.providerCommunicationPreference.findUnique({
        where: { providerId: effectiveProviderId }
      })
    : null;

  const useDefaults = appt.remindersUseDefaults !== false;
  const offsets = (
    useDefaults
      ? parseOffsetsJson(global.defaultOffsetsJson)
      : parseOffsetsJson(appt.reminderOffsetsOverrideJson) || parseOffsetsJson(global.defaultOffsetsJson)
  ).filter((n) => n > 0);

  if (!offsets.length) return { ok: true, reason: "no_offsets" };

  let remindClient = global.remindClientByDefault;
  let remindProvider = global.remindProviderByDefault && Boolean(appt.providerId);
  let appointmentEmailOn = globalAllowsEmail(global);
  let appointmentSmsOn = globalAllowsSms(global);

  if (!useDefaults) {
    if (typeof appt.remindClientOverride === "boolean") remindClient = appt.remindClientOverride;
    if (typeof appt.remindProviderOverride === "boolean") {
      remindProvider = appt.remindProviderOverride && Boolean(appt.providerId);
    }
    if (typeof appt.reminderEmailEnabledOverride === "boolean") {
      appointmentEmailOn = appt.reminderEmailEnabledOverride;
    }
    if (typeof appt.reminderSmsEnabledOverride === "boolean") {
      appointmentSmsOn = appt.reminderSmsEnabledOverride && global.smsProviderEnabled;
    }
  }

  const startTs = new Date(appt.startsAt).getTime();
  const toCreate = [];

  for (const offsetMinutes of offsets) {
    const scheduledFor = computeScheduledFor({
      appointmentStartsAt: appt.startsAt,
      offsetMinutes,
      timezone: global.timezone,
      sendWindowStartMinutes: global.sendWindowStartMinutes,
      sendWindowEndMinutes: global.sendWindowEndMinutes
    });

    if (scheduledFor.getTime() < Date.now() - 120_000) continue;

    if (remindClient) {
      const emailBase =
        appointmentEmailOn && globalAllowsEmail(global) && clientAllowsEmail(clientPref);
      const smsBase =
        appointmentSmsOn && globalAllowsSms(global) && clientAllowsSms(clientPref, global);
      const ch = applyPreferredChannel(clientPref, emailBase, smsBase);

      if (ch.email && appt.client?.email) {
        toCreate.push({
          id: randomUUID(),
          appointmentId: appt.id,
          targetType: "CLIENT",
          targetId: appt.clientId,
          channel: "EMAIL",
          offsetMinutes,
          scheduledFor,
          dedupeKey: `${appt.id}:CLIENT:EMAIL:${offsetMinutes}:${startTs}`,
          templateKey: "CLIENT_EMAIL",
          status: "QUEUED",
          updatedAt: new Date()
        });
      }
      if (ch.sms && clientSmsPhone(appt.client) && global.voipmsDid) {
        toCreate.push({
          id: randomUUID(),
          appointmentId: appt.id,
          targetType: "CLIENT",
          targetId: appt.clientId,
          channel: "SMS",
          offsetMinutes,
          scheduledFor,
          dedupeKey: `${appt.id}:CLIENT:SMS:${offsetMinutes}:${startTs}`,
          templateKey: "CLIENT_SMS",
          status: "QUEUED",
          updatedAt: new Date()
        });
      }
    }

    if (remindProvider && effectiveProviderId && providerForReminders) {
      const emailBase =
        appointmentEmailOn && globalAllowsEmail(global) && providerAllowsEmail(providerPref);
      const smsBase =
        appointmentSmsOn && globalAllowsSms(global) && providerAllowsSms(providerPref);
      const ch = applyPreferredChannel(providerPref, emailBase, smsBase);

      if (ch.email && providerForReminders.email) {
        toCreate.push({
          id: randomUUID(),
          appointmentId: appt.id,
          targetType: "PROVIDER",
          targetId: effectiveProviderId,
          channel: "EMAIL",
          offsetMinutes,
          scheduledFor,
          dedupeKey: `${appt.id}:PROVIDER:EMAIL:${offsetMinutes}:${startTs}`,
          templateKey: "PROVIDER_EMAIL",
          status: "QUEUED",
          updatedAt: new Date()
        });
      }
      if (ch.sms && providerForReminders.phone && global.voipmsDid) {
        toCreate.push({
          id: randomUUID(),
          appointmentId: appt.id,
          targetType: "PROVIDER",
          targetId: effectiveProviderId,
          channel: "SMS",
          offsetMinutes,
          scheduledFor,
          dedupeKey: `${appt.id}:PROVIDER:SMS:${offsetMinutes}:${startTs}`,
          templateKey: "PROVIDER_SMS",
          status: "QUEUED",
          updatedAt: new Date()
        });
      }
    }
  }

  let created = 0;
  for (const row of toCreate) {
    const ex = await prisma.reminderJob.findUnique({ where: { dedupeKey: row.dedupeKey } });
    if (ex?.status === "SENT" || ex?.status === "SENDING") continue;
    if (ex) {
      await prisma.reminderJob.update({
        where: { id: ex.id },
        data: {
          scheduledFor: row.scheduledFor,
          status: "QUEUED",
          skipReason: null,
          errorMessage: null,
          attemptCount: 0,
          nextRetryAt: null,
          sentAt: null,
          providerMessageId: null,
          updatedAt: new Date()
        }
      });
    } else {
      await prisma.reminderJob.create({ data: row });
    }
    created += 1;
  }

  return { ok: true, created };
}

export async function cancelQueuedJobsForAppointment(appointmentId, reason) {
  await prisma.reminderJob.updateMany({
    where: { appointmentId, status: "QUEUED" },
    data: { status: "CANCELLED", skipReason: reason || "Cancelled" }
  });
}
