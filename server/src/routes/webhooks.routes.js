import express from "express";
import { randomUUID } from "crypto";
import { prisma } from "../config/prisma.js";
import { resolveVoipmsWebhookSecret } from "../services/integrations/voipmsService.js";
import { normalizeUsPhoneDigits } from "../services/reminders/phoneUtils.js";

const router = express.Router();

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);

/**
 * Flatten query + body (VoIP.ms inbound is typically GET with query params).
 */
function mergePayload(req) {
  const q = req.query && typeof req.query === "object" ? { ...req.query } : {};
  const b =
    req.body && typeof req.body === "object" && !Array.isArray(req.body) ? { ...req.body } : {};
  return { ...q, ...b };
}

/** Do not persist secrets in InboundSmsEvent.rawPayload */
function redactForStorage(src) {
  const out = { ...src };
  for (const k of Object.keys(out)) {
    const lk = k.toLowerCase();
    if (
      lk === "token" ||
      lk === "api_key" ||
      lk === "apikey" ||
      lk === "password" ||
      lk === "api_password" ||
      lk.includes("secret")
    ) {
      out[k] = "[redacted]";
    }
  }
  return out;
}

/**
 * VoIP.ms documented placeholders map to: from, to, message, id, date, files/media.
 * Also accept common Asterisk / alternate names.
 */
function extractFrom(src) {
  return String(
    src.from ??
      src.FROM ??
      src.callerid ??
      src.CallerID ??
      src.src ??
      src.source ??
      src.From ??
      ""
  ).trim();
}

function extractTo(src) {
  return String(
    src.to ?? src.TO ?? src.did ?? src.DID ?? src.dst ?? src.To ?? ""
  ).trim();
}

function extractMessage(src) {
  return String(
    src.message ??
      src.MESSAGE ??
      src.Message ??
      src.text ??
      src.body ??
      src.content ??
      ""
  ).trim();
}

function inboundAuthOk(src) {
  if (!env.voipmsWebhookSecret) return true;
  const secret = env.voipmsWebhookSecret;
  const token = String(src.token ?? "");
  const apiKey = String(src.api_key ?? src.apikey ?? "");
  return token === secret || apiKey === secret;
}

async function findClientByPhoneDigits(digits) {
  if (!digits || digits.length < 10) return null;
  const tail = digits.slice(-10);
  const clients = await prisma.client.findMany({
    select: { id: true, phone: true, phoneCell: true }
  });
  for (const c of clients) {
    const p = normalizeUsPhoneDigits(c.phone || "");
    const cell = normalizeUsPhoneDigits(c.phoneCell || "");
    if (p === tail || cell === tail) return c.id;
  }
  return null;
}

/**
 * VoIP.ms SMS inbound — GET or POST. Configure DID callback URL in VoIP.ms using
 * {FROM} {TO} {MESSAGE} {ID} {DATE} placeholders (and optional {MEDIA}).
 * When a webhook secret is set (Integrations → VoIP.ms or VOIPMS_WEBHOOK_SECRET), pass it as `token` or `api_key`.
 */
router.all("/voipms/sms", async (req, res) => {
  try {
    const src = mergePayload(req);

    if (!(await inboundAuthOk(src))) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const from = extractFrom(src);
    const to = extractTo(src);
    const rawMessage = extractMessage(src);
    const upper = rawMessage.toUpperCase();
    const tokens = upper.split(/\s+/).filter(Boolean);
    const isStop = tokens.some((t) => STOP_WORDS.has(t.replace(/[^A-Z]/g, "")));
    const fromDigits = normalizeUsPhoneDigits(from);
    const clientId = await findClientByPhoneDigits(fromDigits || "");

    const safePayload = redactForStorage(src);

    await prisma.inboundSmsEvent.create({
      data: {
        id: randomUUID(),
        fromNumber: from || "unknown",
        toNumber: to || null,
        body: rawMessage.slice(0, 2000),
        rawPayload: safePayload,
        action: isStop ? "OPT_OUT" : "INBOUND",
        clientId
      }
    });

    if (isStop && clientId) {
      await prisma.clientCommunicationPreference.upsert({
        where: { clientId },
        create: {
          clientId,
          smsOptOut: true,
          smsOptOutAt: new Date(),
          smsRemindersEnabled: false
        },
        update: {
          smsOptOut: true,
          smsOptOutAt: new Date(),
          smsRemindersEnabled: false
        }
      });
      await prisma.reminderJob.updateMany({
        where: {
          appointment: { clientId },
          targetType: "CLIENT",
          channel: "SMS",
          status: "QUEUED"
        },
        data: { status: "CANCELLED", skipReason: "SMS opt-out (STOP)" }
      });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "Webhook error" });
  }
});

export default router;
