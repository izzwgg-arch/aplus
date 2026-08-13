import crypto from "crypto";

/**
 * Reversible symmetric encryption for secrets that must be decrypted at use
 * time (e.g. the SmartSteps SMTP app password). This is intentionally separate
 * from `password.ts` (bcrypt), which is one-way and only for login passwords.
 *
 * Mirrors the A+ Center scheduling server pattern
 * (`aplus-center-scheduling/server/src/utils/crypto.js`): AES-256-CBC with a
 * key derived from `ENCRYPTION_KEY` and a random IV per value. SmartSteps uses
 * its OWN `ENCRYPTION_KEY` — it must never share A+ Scheduling's key.
 *
 * Storage format: `ivHex:cipherHex`. Decryption fails safe to `""` so a rotated
 * or missing key never crashes a request (the admin simply re-enters the value).
 */

const IV_LENGTH = 16;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new EncryptionKeyMissingError();
  }
  // Normalize any key length to a 32-byte key for aes-256.
  return crypto.createHash("sha256").update(secret).digest();
}

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super("ENCRYPTION_KEY is not configured (required to store the email app password)");
    this.name = "EncryptionKeyMissingError";
  }
}

/** True when a usable ENCRYPTION_KEY is present. */
export function isEncryptionConfigured(): boolean {
  const secret = process.env.ENCRYPTION_KEY;
  return Boolean(secret && secret.length >= 16);
}

/** Encrypts a plaintext string. Returns `null` for empty input. */
export function encryptText(value: string | null | undefined): string | null {
  if (!value) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypts a stored payload. Returns `""` if the value is empty or undecryptable. */
export function decryptText(payload: string | null | undefined): string {
  if (!payload) return "";
  try {
    const [ivHex, encryptedHex] = payload.split(":");
    if (!ivHex || !encryptedHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(), iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
