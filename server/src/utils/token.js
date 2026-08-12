import crypto from "crypto";

export function createRandomToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
