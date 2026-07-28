import nodemailer, { type Transporter } from "nodemailer";

const host = process.env.EMAIL_HOST;
const port = Number(process.env.EMAIL_PORT || 587);
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

export const EMAIL_FROM = process.env.EMAIL_FROM || "A+ Center <no-reply@aplus.local>";

let cached: Transporter | null = null;

/** True when SMTP credentials are present in the environment. */
export function isEmailConfigured(): boolean {
  return Boolean(host && user && pass);
}

function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;
  if (!cached) {
    cached = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: user as string, pass: pass as string },
    });
  }
  return cached;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASS missing)");
    this.name = "EmailNotConfiguredError";
  }
}

/**
 * Sends an email via the configured SMTP transport. Throws
 * `EmailNotConfiguredError` when SMTP env vars are missing so callers can
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
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[mailer] EMAIL_* env not configured — skipping send", { to, subject });
    throw new EmailNotConfiguredError();
  }
  await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
}
