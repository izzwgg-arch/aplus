import crypto from "crypto";
import { env } from "../config/env.js";

const key = crypto.createHash("sha256").update(env.encryptionKey).digest();
const ivLength = 16;

export function encryptText(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptText(payload) {
  if (!payload) return "";
  try {
    const [ivHex, encryptedHex] = payload.split(":");
    if (!ivHex || !encryptedHex) return "";
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // If legacy encrypted data cannot be decrypted with current key,
    // return empty string instead of failing entire API responses.
    return "";
  }
}
