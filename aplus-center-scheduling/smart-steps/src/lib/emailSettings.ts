import { prisma } from "@/lib/db";
import { encryptText, decryptText } from "@/lib/crypto";

const SINGLETON_ID = "singleton";

export type EmailSettingsInput = {
  emailEnabled?: boolean;
  emailSenderName?: string | null;
  emailFromAddress?: string | null;
  emailReplyTo?: string | null;
  emailUser?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  /** Plaintext app password from the form. Omit/blank = keep the stored one. */
  appPassword?: string | null;
};

/** Shape returned to the browser — never contains the password. */
export type EmailSettingsPublic = {
  emailEnabled: boolean;
  emailSenderName: string;
  emailFromAddress: string;
  emailReplyTo: string;
  emailUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hasAppPassword: boolean;
};

/** Internal transport config, including the decrypted password. Never serialize. */
export type ResolvedEmailConfig = {
  enabled: boolean;
  senderName: string;
  fromAddress: string;
  replyTo: string;
  user: string;
  host: string;
  port: number;
  secure: boolean;
  password: string;
};

type OrgRow = Awaited<ReturnType<typeof prisma.organizationSettings.findUnique>>;

async function getRow() {
  return prisma.organizationSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, orgName: "A+ Center" },
    update: {},
  });
}

/** Sanitized settings for the admin UI — password is replaced by `hasAppPassword`. */
export async function getEmailSettingsPublic(): Promise<EmailSettingsPublic> {
  const row = await getRow();
  return toPublic(row);
}

function toPublic(row: NonNullable<OrgRow>): EmailSettingsPublic {
  return {
    emailEnabled: row.emailEnabled ?? false,
    emailSenderName: row.emailSenderName ?? "",
    emailFromAddress: row.emailFromAddress ?? "",
    emailReplyTo: row.emailReplyTo ?? "",
    emailUser: row.emailUser ?? "",
    smtpHost: row.smtpHost ?? "",
    smtpPort: row.smtpPort ?? 465,
    smtpSecure: row.smtpSecure ?? true,
    hasAppPassword: Boolean(row.smtpPasswordEnc),
  };
}

/** Persists settings. Encrypts a newly provided app password; a blank/omitted one keeps the existing value. */
export async function saveEmailSettings(input: EmailSettingsInput): Promise<EmailSettingsPublic> {
  const data: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (input.emailEnabled !== undefined) data.emailEnabled = input.emailEnabled;
  if (input.emailSenderName !== undefined) data.emailSenderName = norm(input.emailSenderName);
  if (input.emailFromAddress !== undefined) data.emailFromAddress = norm(input.emailFromAddress);
  if (input.emailReplyTo !== undefined) data.emailReplyTo = norm(input.emailReplyTo);
  if (input.emailUser !== undefined) data.emailUser = norm(input.emailUser);
  if (input.smtpHost !== undefined) data.smtpHost = norm(input.smtpHost);
  if (input.smtpPort !== undefined && input.smtpPort !== null) data.smtpPort = input.smtpPort;
  if (input.smtpSecure !== undefined) data.smtpSecure = input.smtpSecure;

  // Only (re)encrypt when a non-empty password is supplied. A blank field means
  // "leave the stored password unchanged".
  const normalizedNewPassword = normalizeAppPassword(input.appPassword);
  if (normalizedNewPassword) {
    data.smtpPasswordEnc = encryptText(normalizedNewPassword);
  }

  const row = await prisma.organizationSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, orgName: "A+ Center", ...data },
    update: data,
  });
  return toPublic(row);
}

/**
 * Resolves the full transport config including the decrypted password.
 * `overridePassword` lets "Test Connection" verify a not-yet-saved password
 * typed in the form; when blank it falls back to the stored one.
 */
export async function resolveEmailConfig(overridePassword?: string | null): Promise<ResolvedEmailConfig> {
  const row = await getRow();
  const pub = toPublic(row);
  // Gmail (and most providers) reject app passwords that still contain the
  // display spaces (e.g. "abcd efgh ijkl mnop"). Strip all whitespace so a
  // pasted-with-spaces password authenticates instead of failing as "no
  // connection". Also normalize any legacy value stored with spaces.
  const override = normalizeAppPassword(overridePassword);
  const password = override || normalizeAppPassword(decryptText(row.smtpPasswordEnc));
  return {
    enabled: pub.emailEnabled,
    senderName: pub.emailSenderName,
    fromAddress: pub.emailFromAddress,
    replyTo: pub.emailReplyTo,
    user: pub.emailUser || pub.emailFromAddress,
    host: pub.smtpHost,
    port: pub.smtpPort,
    secure: pub.smtpSecure,
    password,
  };
}

/** True when the DB-configured SmartSteps SMTP account has everything needed to send. */
export function isDbEmailUsable(cfg: ResolvedEmailConfig): boolean {
  return Boolean(cfg.enabled && cfg.host && cfg.port && (cfg.user || cfg.fromAddress) && cfg.password);
}

function norm(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

/**
 * Normalizes a Google/SMTP app password by removing ALL whitespace. Google
 * shows app passwords as four space-separated groups (e.g. "abcd efgh ijkl
 * mnop") and copying them keeps the spaces, which SMTP auth rejects. Returns
 * "" when nothing usable is left.
 */
export function normalizeAppPassword(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, "");
}
