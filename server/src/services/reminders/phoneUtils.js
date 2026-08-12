/** Strip to digits; return 10-digit US or null */
export function normalizeUsPhoneDigits(input) {
  if (!input || typeof input !== "string") return null;
  const d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

/** VoIP.ms expects 10-digit US/CA */
export function formatVoipmsDestination(input) {
  return normalizeUsPhoneDigits(input);
}

/** Prefer cell, then primary phone, then secondary (trimmed string or null). */
export function clientSmsPhone(client) {
  if (!client) return null;
  for (const key of ["phoneCell", "phone", "phoneSecondary"]) {
    const v = client[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

export function maskDestination(channel, value) {
  if (!value) return null;
  if (channel === "EMAIL") {
    const [u, dom] = String(value).split("@");
    if (!dom) return "***";
    return `${(u || "").slice(0, 2)}***@${dom}`;
  }
  const d = String(value).replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `***${d.slice(-4)}`;
}
