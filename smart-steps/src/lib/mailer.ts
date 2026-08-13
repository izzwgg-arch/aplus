import nodemailer, { type Transporter } from "nodemailer";
import {
  resolveEmailConfig,
  isDbEmailUsable,
  type ResolvedEmailConfig,
} from "@/lib/emailSettings";

const host = process.env.EMAIL_HOST;
const port = Number(process.env.EMAIL_PORT || 587);
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

export const EMAIL_FROM = process.env.EMAIL_FROM || "A+ Center <no-reply@aplus.local>";

let envCached: Transporter | null = null;

/** True when SMTP credentials are present in the environment (legacy fallback). */
export function isEnvEmailConfigured(): boolean {
  return Boolean(host && user && pass);
}

/** Back-compat alias — kept so existing callers keep working. */
export function isEmailConfigured(): boolean {
  return isEnvEmailConfigured();
}

function getEnvTransporter(): Transporter | null {
  if (!isEnvEmailConfigured()) return null;
  if (!envCached) {
    envCached = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: user as string, pass: pass as string },
    });
  }
  return envCached;
}

/** Builds a fresh transporter for the DB-configured SmartSteps SMTP account. */
function buildDbTransporter(cfg: ResolvedEmailConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
  });
}

function fromHeader(cfg: ResolvedEmailConfig): string {
  const addr = cfg.fromAddress || cfg.user;
  return cfg.senderName ? `${cfg.senderName} <${addr}>` : addr;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super(
      "SmartSteps email is not configured. Set it up in Settings → Email Integration (or provide EMAIL_HOST/EMAIL_USER/EMAIL_PASS).",
    );
    this.name = "EmailNotConfiguredError";
  }
}

type ResolvedTransport = { transporter: Transporter; from: string; replyTo?: string };

/**
 * Resolves the transport to use for an outgoing SmartSteps email. Prefers the
 * DB-configured SmartSteps account (Settings → Email Integration); falls back
 * to the legacy `EMAIL_*` env transport when the DB account isn't usable.
 */
async function resolveTransport(): Promise<ResolvedTransport | null> {
  try {
    const cfg = await resolveEmailConfig();
    if (isDbEmailUsable(cfg)) {
      return {
        transporter: buildDbTransporter(cfg),
        from: fromHeader(cfg),
        replyTo: cfg.replyTo || undefined,
      };
    }
  } catch (err) {
    // Never leak secrets; log only the error name/message.
    console.warn("[mailer] DB email config unavailable, trying env fallback:", (err as Error)?.name);
  }
  const envTransporter = getEnvTransporter();
  if (envTransporter) return { transporter: envTransporter, from: EMAIL_FROM };
  return null;
}

/**
 * Sends an email via the SmartSteps transport. Throws `EmailNotConfiguredError`
 * when neither the DB account nor the env fallback is configured so callers can
 * surface an actionable warning instead of silently dropping the message.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const resolved = await resolveTransport();
  if (!resolved) {
    console.warn("[mailer] no email transport configured — skipping send", { to, subject });
    throw new EmailNotConfiguredError();
  }
  await resolved.transporter.sendMail({
    from: resolved.from,
    to,
    subject,
    html,
    replyTo: resolved.replyTo,
  });
}

/**
 * Verifies SMTP authentication for the SmartSteps DB-configured account without
 * sending mail. `overridePassword` lets the admin test a not-yet-saved password.
 * Throws on failure (message is safe to log; contains no secrets).
 */
export async function verifyEmailConnection(overridePassword?: string | null): Promise<void> {
  const cfg = await resolveEmailConfig(overridePassword);
  if (!cfg.host || !cfg.port || !(cfg.user || cfg.fromAddress) || !cfg.password) {
    throw new EmailNotConfiguredError();
  }
  const transporter = buildDbTransporter(cfg);
  await transporter.verify();
}

/**
 * Sends the standard "SmartSteps Email Test" message from the configured
 * SmartSteps sender account. `overridePassword` supports testing before saving.
 */
export async function sendTestEmail(to: string, overridePassword?: string | null): Promise<void> {
  const cfg = await resolveEmailConfig(overridePassword);
  if (!cfg.host || !cfg.port || !(cfg.user || cfg.fromAddress) || !cfg.password) {
    throw new EmailNotConfiguredError();
  }
  const transporter = buildDbTransporter(cfg);
  await transporter.sendMail({
    from: fromHeader(cfg),
    to,
    replyTo: cfg.replyTo || undefined,
    subject: "SmartSteps Email Test",
    html: `<p>Your SmartSteps email integration is configured correctly.</p>`,
  });
}
