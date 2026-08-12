import { prisma } from "../../config/prisma.js";
import { sendEmail } from "../../utils/mailer.js";
import { logger } from "../../utils/logger.js";
import { sendVoipmsSms } from "../integrations/voipmsService.js";
import { getOrCreateClinicSettings } from "../settingsService.js";
import { getOrCreateReminderGlobalSettings } from "./reminderGlobalSettingsService.js";
import { ensureDefaultReminderTemplates, getReminderTemplate } from "./reminderTemplateService.js";
import { formatAppointmentContext, mergeTemplate } from "./reminderMerge.js";
import { maskDestination, clientSmsPhone } from "./phoneUtils.js";

const SCHEDULABLE = new Set(["SCHEDULED", "PENDING", "CONFIRMED", "RESCHEDULED", "RUNNING_LATE"]);

export async function processDueReminderJobs(limit = 30) {
  const now = new Date();
  const global = await getOrCreateReminderGlobalSettings();
  if (!global.remindersEnabledGlobal) return { processed: 0 };

  const due = await prisma.reminderJob.findMany({
    where: {
      OR: [
        { status: "QUEUED", scheduledFor: { lte: now } },
        {
          status: "FAILED",
          nextRetryAt: { lte: now },
          attemptCount: { lt: global.maxRetries }
        }
      ]
    },
    orderBy: [{ scheduledFor: "asc" }],
    take: limit,
    include: {
      appointment: { include: { client: true, provider: true, service: true } }
    }
  });

  const clinic = await getOrCreateClinicSettings();
  let processed = 0;
  for (const job of due) {
    await processOneReminderJob(job, global, clinic);
    processed += 1;
  }
  return { processed };
}

async function processOneReminderJob(job, global, clinic) {
  const appt = job.appointment;
  if (!appt || !SCHEDULABLE.has(appt.status) || !appt.reminderEnabled) {
    await prisma.reminderJob.update({
      where: { id: job.id },
      data: { status: "SKIPPED", skipReason: "Appointment no longer eligible", updatedAt: new Date() }
    });
    return;
  }

  await prisma.reminderJob.update({
    where: { id: job.id },
    data: { status: "SENDING", lastAttemptAt: new Date(), updatedAt: new Date() }
  });

  try {
    await ensureDefaultReminderTemplates();
    const tmpl = await getReminderTemplate(job.templateKey);
    if (!tmpl) throw new Error("Template missing");

    const ctx = formatAppointmentContext({
      appointment: appt,
      client: appt.client,
      provider: appt.provider,
      service: appt.service,
      clinic: { ...clinic, timezone: global.timezone }
    });
    const body = mergeTemplate(tmpl.bodyTemplate, ctx);
    const subject = mergeTemplate(tmpl.subject || "Appointment reminder", ctx);

    if (job.channel === "EMAIL") {
      const to =
        job.targetType === "CLIENT" ? appt.client?.email : appt.provider?.email;
      if (!to) {
        await prisma.reminderJob.update({
          where: { id: job.id },
          data: {
            status: "SKIPPED",
            skipReason: "No email on file",
            updatedAt: new Date()
          }
        });
        return;
      }
      await sendEmail({ to, subject, html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${body}</div>` });
      await prisma.reminderJob.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          destinationMasked: maskDestination("EMAIL", to),
          errorMessage: null,
          nextRetryAt: null,
          updatedAt: new Date()
        }
      });
    } else {
      const did = global.voipmsDid;
      if (!did) {
        await prisma.reminderJob.update({
          where: { id: job.id },
          data: {
            status: "SKIPPED",
            skipReason: "SMS DID not configured in reminder settings",
            updatedAt: new Date()
          }
        });
        return;
      }
      const dst =
        job.targetType === "CLIENT"
          ? clientSmsPhone(appt.client)
          : recipientProvider?.phone?.trim();
      if (!dst) {
        await prisma.reminderJob.update({
          where: { id: job.id },
          data: {
            status: "SKIPPED",
            skipReason: "No mobile/cell number on file",
            updatedAt: new Date()
          }
        });
        return;
      }
      if (job.targetType === "CLIENT") {
        const pref = await prisma.clientCommunicationPreference.findUnique({
          where: { clientId: appt.clientId }
        });
        if (pref?.smsOptOut) {
          await prisma.reminderJob.update({
            where: { id: job.id },
            data: {
              status: "SKIPPED",
              skipReason: "Client opted out of SMS",
              updatedAt: new Date()
            }
          });
          return;
        }
      }
      const r = await sendVoipmsSms({ did, dst, message: body });
      if (!r.ok) throw new Error(r.error || "SMS send failed");
      await prisma.reminderJob.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: r.messageId || null,
          destinationMasked: maskDestination("SMS", dst),
          errorMessage: null,
          nextRetryAt: null,
          updatedAt: new Date()
        }
      });
    }
  } catch (e) {
    const attempt = job.attemptCount + 1;
    const shouldRetry = global.retryEnabled && attempt < global.maxRetries;
    await prisma.reminderJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        attemptCount: attempt,
        errorMessage: (e.message || "Error").slice(0, 500),
        nextRetryAt: shouldRetry ? new Date(Date.now() + global.retryDelayMinutes * 60_000) : null,
        updatedAt: new Date()
      }
    });
    logger.warn("[reminder] job failed", { id: job.id, err: e.message });
  }
}
