import { prisma } from "@/lib/db";
import { createRandomToken, hashToken } from "@/lib/token";
import { sendEmail } from "@/lib/mailer";
import { buildInviteEmail } from "@/lib/emailTemplates";

export const INVITE_EXPIRES_HOURS = Number(process.env.INVITE_TOKEN_EXPIRES_HOURS || 48);

const BASE_PATH = "/smart-steps";

/**
 * Public base URL of the tracker (including the `/smart-steps` base path), used
 * to build invite links. Prefers an explicit `APP_BASE_URL`; otherwise derives
 * the origin from `NEXTAUTH_URL`/`AUTH_URL` and appends the base path.
 */
export function getAppBaseUrl(): string {
  const explicit = (process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const raw = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "").trim();
  try {
    const u = new URL(raw);
    return `${u.origin}${BASE_PATH}`;
  } catch {
    return BASE_PATH;
  }
}

export function buildAcceptInviteUrl(rawToken: string): string {
  return `${getAppBaseUrl()}/accept-invite?token=${encodeURIComponent(rawToken)}`;
}

/** Invalidates outstanding invite tokens for a user and issues a fresh one. Returns the raw (unhashed) token. */
export async function issueInviteToken(userId: string): Promise<string> {
  await prisma.passwordResetToken.updateMany({
    where: { userId, purpose: "INVITE", usedAt: null },
    data: { usedAt: new Date() },
  });
  const raw = createRandomToken();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRES_HOURS * 60 * 60 * 1000);
  await prisma.passwordResetToken.create({
    data: { tokenHash: hashToken(raw), userId, purpose: "INVITE", expiresAt },
  });
  return raw;
}

/**
 * Issues an invite token and emails a set-password link. Throws if the email
 * cannot be sent (e.g. SMTP not configured) so callers can warn the admin —
 * the token is still valid and the invite can be resent.
 */
export async function sendInvite(
  user: { id: string; email: string; name: string | null },
  { isResend = false }: { isResend?: boolean } = {}
): Promise<void> {
  const raw = await issueInviteToken(user.id);
  const url = buildAcceptInviteUrl(raw);
  await sendEmail({
    to: user.email,
    subject: isResend
      ? "Invitation reminder — A+ Center ABA Tracker"
      : "You've been invited to A+ Center ABA Tracker",
    html: buildInviteEmail({ name: user.name, url, expiresHours: INVITE_EXPIRES_HOURS }),
  });
}
