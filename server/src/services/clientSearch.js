import { prisma } from "../config/prisma.js";

/**
 * Client directory search.
 *
 * The old search was one `contains` on the whole query string, so it only
 * matched when the person typed the name exactly the way `fullName` stores it
 * ("Last First"): "Libby Schiff" found nothing, and a phone typed as digits
 * never matched a number stored as "(718) 555-1234".
 *
 * Now every whitespace-separated word must match SOMEWHERE on the client
 * (AND across words, OR across fields), so word order and extra words don't
 * matter, and a word made of digits is also matched against the digits of
 * the three phone fields with the formatting stripped.
 */

const MAX_TOKENS = 6;
const MIN_PHONE_DIGITS = 3;

const TEXT_FIELDS = ["fullName", "firstName", "lastName", "email", "insurance", "phone", "phoneCell", "phoneSecondary"];

export function searchTokens(search) {
  return String(search || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TOKENS);
}

/** Ids of clients whose phone digits contain `digits`, ignoring formatting. */
async function idsByPhoneDigits(digits) {
  const pattern = `%${digits}%`;
  const rows = await prisma.$queryRaw`
    SELECT id FROM "Client"
    WHERE regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE ${pattern}
       OR regexp_replace(coalesce("phoneCell", ''), '\\D', '', 'g') LIKE ${pattern}
       OR regexp_replace(coalesce("phoneSecondary", ''), '\\D', '', 'g') LIKE ${pattern}
  `;
  return rows.map((r) => r.id);
}

/**
 * Build the prisma `where` fragment for a free-text search, or null when the
 * search is empty. Async because a digits-only word needs one raw lookup.
 */
export async function buildClientSearchWhere(search) {
  const tokens = searchTokens(search);
  if (!tokens.length) return null;

  const AND = [];
  for (const token of tokens) {
    const OR = TEXT_FIELDS.map((field) => ({ [field]: { contains: token, mode: "insensitive" } }));
    const digits = token.replace(/\D/g, "");
    if (digits.length >= MIN_PHONE_DIGITS && digits.length === token.replace(/[\s()\-.+]/g, "").length) {
      const ids = await idsByPhoneDigits(digits);
      if (ids.length) OR.push({ id: { in: ids } });
    }
    AND.push({ OR });
  }
  return { AND };
}
