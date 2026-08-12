import express from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { prisma } from "../config/prisma.js";
import { sendEmail } from "../utils/mailer.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { getOrCreateReminderGlobalSettings, updateReminderGlobalSettings } from "../services/reminders/reminderGlobalSettingsService.js";
import {
  sendVoipmsSms,
  testVoipmsConnection,
  resolveVoipmsApiCredentials,
  getVoipmsWebhookCallbackHints
} from "../services/integrations/voipmsService.js";
import { reconcileReminderJobsForAppointment } from "../services/reminders/reminderReconcileService.js";
import { processDueReminderJobs } from "../services/reminders/reminderJobProcessor.js";
import { getOrCreateClinicSettings } from "../services/settingsService.js";
import {
  ensureDefaultReminderTemplates,
  listReminderTemplates,
  updateReminderTemplate,
  getReminderTemplate
} from "../services/reminders/reminderTemplateService.js";
import { clientSmsPhone } from "../services/reminders/phoneUtils.js";

const router = express.Router();
router.use(requireAuth);

async function maskGlobalSettings(row) {
  if (!row) return row;
  const hints = await getVoipmsWebhookCallbackHints();
  const { user, pass } = await resolveVoipmsApiCredentials();
  const base = String(hints.apiBaseUrl || "").replace(/\/$/, "");
  const fbPath = /\/api$/i.test(base) ? "/webhooks/voipms/sms" : "/api/webhooks/voipms/sms";
  return {
    ...row,
    voipmsApiConfigured: Boolean(user && pass),
    voipmsWebhookConfigured: hints.webhookSecretConfigured,
    voipmsWebhookUrlHint: hints.webhookUrl
      ? hints.webhookUrl.split("&from=")[0]
      : base
        ? `${base}${fbPath}`
        : "",
    voipmsCallbackTemplate: hints.webhookUrl,
    voipmsCallbackAltApiKey: hints.callbackWithApiKey
  };
}

router.get("/settings/global", requirePermission("aplus.communications.manage_settings"), async (_req, res) => {
  const row = await getOrCreateReminderGlobalSettings();
  return res.json(await maskGlobalSettings(row));
});

router.put("/settings/global", requirePermission("aplus.communications.manage_settings"), async (req, res) => {
  const updated = await updateReminderGlobalSettings(req.body);
  await writeAuditLog(req, {
    action: "REMINDER_GLOBAL_SETTINGS_UPDATED",
    targetType: "ReminderGlobalSettings",
    targetId: "1"
  });
  return res.json(await maskGlobalSettings(updated));
});

router.get("/templates", requirePermission("aplus.communications.manage_templates"), async (_req, res) => {
  const list = await listReminderTemplates();
  return res.json(list);
});

router.put("/templates/:templateKey", requirePermission("aplus.communications.manage_templates"), async (req, res) => {
  try {
    const t = await updateReminderTemplate(req.params.templateKey, {
      subject: req.body.subject,
      bodyTemplate: req.body.bodyTemplate
    });
    return res.json(t);
  } catch (e) {
    return res.status(400).json({ error: e.message || "Could not update template" });
  }
});

router.post("/test-email", requirePermission("aplus.communications.manage_settings"), async (req, res) => {
  const to = String(req.body.to || "").trim();
  if (!to) return res.status(400).json({ error: "to required" });
  await sendEmail({
    to,
    subject: "A+ Scheduling — reminder test",
    html: "<p>This is a test email from the appointment reminder system.</p>"
  });
  return res.json({ ok: true });
});

router.post("/test-sms", requirePermission("aplus.communications.manage_settings"), async (req, res) => {
  const global = await getOrCreateReminderGlobalSettings();
  const dst = String(req.body.to || "").trim();
  if (!dst) return res.status(400).json({ error: "to required" });
  const fromBody = String(req.body.did || "").replace(/\D/g, "");
  const fromSaved = String(global.voipmsDid || "").replace(/\D/g, "");
  let didDigits = fromBody.length >= 10 ? fromBody : fromSaved;
  if (didDigits.length === 11 && didDigits.startsWith("1")) didDigits = didDigits.slice(1);
  if (!didDigits || didDigits.length !== 10) {
    return res.status(400).json({
      error:
        "VoIP.ms needs the sending number (your DID). Enter it next to the test SMS field, or save it under Reminders → Timing & defaults → VoIP.ms sending DID."
    });
  }
  const r = await sendVoipmsSms({
    did: didDigits,
    dst,
    message: String(req.body.message || "A+ Scheduling test SMS").slice(0, 300)
  });
  await updateReminderGlobalSettings({
    lastSmsTestAt: new Date(),
    lastSmsTestResult: r.ok ? "OK" : r.error || "Failed",
    lastSmsTestOk: r.ok
  });
  if (!r.ok) return res.status(400).json({ error: r.error, raw: r.raw });
  return res.json({ ok: true, messageId: r.messageId });
});

router.post("/voipms/test-connection", requirePermission("aplus.communications.manage_settings"), async (_req, res) => {
  const r = await testVoipmsConnection();
  await updateReminderGlobalSettings({
    lastSmsTestAt: new Date(),
    lastSmsTestResult: r.message || r.error || "",
    lastSmsTestOk: r.ok
  });
  if (!r.ok) return res.status(400).json({ error: r.message, code: r.code });
  return res.json({ ok: true, message: r.message });
});

router.get("/dashboard", requirePermission("aplus.communications.manage_settings"), async (_req, res) => {
  const now = new Date();
  const upcoming = await prisma.reminderJob.findMany({
    where: { status: "QUEUED", scheduledFor: { gte: new Date(now.getTime() - 24 * 3600_000) } },
    orderBy: { scheduledFor: "asc" },
    take: 100,
    include: { appointment: { select: { id: true, title: true, startsAt: true, clientId: true } } }
  });
  const failed = await prisma.reminderJob.findMany({
    where: { status: "FAILED" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { appointment: { select: { id: true, title: true, startsAt: true } } }
  });
  const recent = await prisma.reminderJob.findMany({
    where: { status: "SENT", sentAt: { gte: new Date(now.getTime() - 7 * 24 * 3600_000) } },
    orderBy: { sentAt: "desc" },
    take: 50,
    include: { appointment: { select: { id: true, title: true, startsAt: true } } }
  });
  const optOuts = await prisma.inboundSmsEvent.findMany({
    where: { action: "OPT_OUT" },
    orderBy: { createdAt: "desc" },
    take: 30
  });
  return res.json({ upcoming, failed, recent, optOuts });
});

router.get("/appointments/:appointmentId/jobs", requirePermission("aplus.communications.view"), async (req, res) => {
  const jobs = await prisma.reminderJob.findMany({
    where: { appointmentId: req.params.appointmentId },
    orderBy: [{ scheduledFor: "asc" }]
  });
  return res.json(jobs);
});

router.post("/appointments/:appointmentId/reconcile", requirePermission("aplus.communications.send"), async (req, res) => {
  const r = await reconcileReminderJobsForAppointment(req.params.appointmentId);
  return res.json(r);
});

router.post("/appointments/:appointmentId/send-now", requirePermission("aplus.communications.send"), async (req, res) => {
  const { channels } = req.body || {};
  const wantEmail = !channels || channels.includes("EMAIL");
  const wantSms = !channels || channels.includes("SMS");

  const appt = await prisma.appointment.findUnique({
    where: { id: req.params.appointmentId },
    include: { client: true, provider: true, service: true }
  });
  if (!appt) return res.status(404).json({ error: "Appointment not found" });

  const global = await getOrCreateReminderGlobalSettings();
  await getOrCreateClinicSettings();
  await ensureDefaultReminderTemplates();

  const manualId = randomUUID();
  const now = new Date();
  const startTs = new Date(appt.startsAt).getTime();
  const created = [];

  if (wantEmail && appt.client?.email) {
    const tmpl = await getReminderTemplate("CLIENT_EMAIL");
    if (tmpl) {
      const id = randomUUID();
      await prisma.reminderJob.create({
        data: {
          id,
          appointmentId: appt.id,
          targetType: "CLIENT",
          targetId: appt.clientId,
          channel: "EMAIL",
          offsetMinutes: 0,
          scheduledFor: now,
          dedupeKey: `${appt.id}:CLIENT:EMAIL:manual:${manualId}:${startTs}`,
          templateKey: "CLIENT_EMAIL",
          status: "QUEUED",
          updatedAt: now
        }
      });
      created.push(id);
    }
  }
  if (wantSms && clientSmsPhone(appt.client) && global.voipmsDid) {
    const tmpl = await getReminderTemplate("CLIENT_SMS");
    if (tmpl) {
      const id = randomUUID();
      await prisma.reminderJob.create({
        data: {
          id,
          appointmentId: appt.id,
          targetType: "CLIENT",
          targetId: appt.clientId,
          channel: "SMS",
          offsetMinutes: 0,
          scheduledFor: now,
          dedupeKey: `${appt.id}:CLIENT:SMS:manual:${manualId}:${startTs}`,
          templateKey: "CLIENT_SMS",
          status: "QUEUED",
          updatedAt: now
        }
      });
      created.push(id);
    }
  }

  if (wantEmail && appt.providerId && appt.provider?.email) {
    const tmpl = await getReminderTemplate("PROVIDER_EMAIL");
    if (tmpl) {
      const id = randomUUID();
      await prisma.reminderJob.create({
        data: {
          id,
          appointmentId: appt.id,
          targetType: "PROVIDER",
          targetId: appt.providerId,
          channel: "EMAIL",
          offsetMinutes: 0,
          scheduledFor: now,
          dedupeKey: `${appt.id}:PROVIDER:EMAIL:manual:${manualId}:${startTs}`,
          templateKey: "PROVIDER_EMAIL",
          status: "QUEUED",
          updatedAt: now
        }
      });
      created.push(id);
    }
  }
  if (wantSms && appt.providerId && appt.provider?.phone && global.voipmsDid) {
    const tmpl = await getReminderTemplate("PROVIDER_SMS");
    if (tmpl) {
      const id = randomUUID();
      await prisma.reminderJob.create({
        data: {
          id,
          appointmentId: appt.id,
          targetType: "PROVIDER",
          targetId: appt.providerId,
          channel: "SMS",
          offsetMinutes: 0,
          scheduledFor: now,
          dedupeKey: `${appt.id}:PROVIDER:SMS:manual:${manualId}:${startTs}`,
          templateKey: "PROVIDER_SMS",
          status: "QUEUED",
          updatedAt: now
        }
      });
      created.push(id);
    }
  }

  await processDueReminderJobs(Math.max(created.length, 10));

  await writeAuditLog(req, {
    action: "REMINDER_MANUAL_SEND",
    entityType: "Appointment",
    entityId: appt.id,
    detailsJson: { jobIds: created }
  });

  return res.json({ ok: true, queued: created.length });
});

router.post("/admin/backfill", requirePermission("aplus.communications.manage_settings"), async (_req, res) => {
  const horizon = new Date(Date.now() + 90 * 24 * 3600_000);
  const appts = await prisma.appointment.findMany({
    where: {
      reminderEnabled: true,
      startsAt: { gte: new Date(), lte: horizon },
      status: { in: ["SCHEDULED", "PENDING", "CONFIRMED", "RESCHEDULED", "RUNNING_LATE"] }
    },
    select: { id: true }
  });
  let n = 0;
  for (const a of appts) {
    await reconcileReminderJobsForAppointment(a.id);
    n += 1;
  }
  return res.json({ ok: true, appointmentsProcessed: n });
});

router.post("/admin/process-now", requirePermission("aplus.communications.manage_settings"), async (_req, res) => {
  const r = await processDueReminderJobs(50);
  return res.json(r);
});

export default router;
