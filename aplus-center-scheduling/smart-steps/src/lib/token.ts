import crypto from "crypto";

/** Generates a cryptographically-random, URL-safe token to embed in invite links. */
export function createRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** One-way hash of a raw token. Only the hash is stored in the DB; the raw
 * token lives only in the emailed link, so a DB leak can't be used to log in. */
export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
