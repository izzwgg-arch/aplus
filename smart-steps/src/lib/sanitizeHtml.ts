/**
 * Allowlist-based HTML sanitizer — runs in Node.js (API routes) and browser alike.
 * No DOM dependency; uses regex + string processing only.
 */

const MAX_CONTENT_LENGTH = 150_000;

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "div", "em", "hr", "i",
  "h2", "h3", "h4", "li", "ol", "p", "span", "strong",
  "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:  new Set(["href", "target", "rel"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

// ── Style allowlists ──────────────────────────────────────────────────────────

/**
 * Safe font-size values only.
 * Allows: 10px, 1.5em, 12pt, small, large, etc.
 * Rejects: calc(), expression(), url(), negative values, percentages, arbitrary lengths.
 */
const SAFE_FONT_SIZE_RE =
  /^(\d{1,2}(?:\.\d{1,2})?(?:px|pt|em)|x-small|small|medium|large|x-large|xx-large)$/i;

/**
 * Exact allowlist of safe font families.
 * Key: lowercased canonical name. Value: display form preserved in output.
 */
const SAFE_FONT_FAMILIES = new Map<string, string>([
  ["arial",           "Arial"],
  ["helvetica",       "Helvetica"],
  ["times new roman", "Times New Roman"],
  ["georgia",         "Georgia"],
  ["verdana",         "Verdana"],
  ["tahoma",          "Tahoma"],
  ["trebuchet ms",    "Trebuchet MS"],
]);

/**
 * Safe color values: #rgb, #rrggbb, named CSS colors (letters only),
 * or rgb(r,g,b) with integer components (browser-normalized form).
 * Rejects: expression(), url(), calc(), arbitrary strings with special chars.
 */
const SAFE_COLOR_RE =
  /^(#[0-9a-f]{3}([0-9a-f]{3})?|[a-z]+|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;

/**
 * Validates a raw font-family value against the allowlist.
 * Strips quotes, takes the first family in a comma-separated stack,
 * checks case-insensitively, returns the canonical form or null.
 */
function safeFontFamily(raw: string): string | null {
  const first = raw
    .replace(/['"]/g, "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return SAFE_FONT_FAMILIES.get(first) ?? null;
}

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;");
}

/**
 * Sanitizes attributes for an allowed tag.
 *
 * Style properties allowed (all others stripped):
 *   - text-align:  left | center | right | justify
 *   - font-size:   safe values matching SAFE_FONT_SIZE_RE
 *   - font-family: canonical name from SAFE_FONT_FAMILIES allowlist
 *
 * No arbitrary CSS values, no url(), expression(), javascript, calc(), etc.
 */
function sanitizeAttrs(tagName: string, rawAttrs: string): string {
  const allowed = ALLOWED_ATTRS[tagName] ?? new Set<string>();
  const attrs   = new Map<string, string>();
  const pat     = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;

  while ((m = pat.exec(rawAttrs)) !== null) {
    const name = m[1].toLowerCase();
    const val  = m[2] ?? m[3] ?? m[4] ?? "";
    if (name.startsWith("on")) continue;

    if (name === "style") {
      const parts: string[] = [];

      // text-align (existing)
      const align = val.match(/\btext-align\s*:\s*(left|center|right|justify)\b/i)?.[1];
      if (align) parts.push(`text-align:${align.toLowerCase()}`);

      // font-size (new — strict allowlist via regex)
      const sizeMatch = val.match(/\bfont-size\s*:\s*([^;,"'<>]+)/i);
      if (sizeMatch) {
        const sizeVal = sizeMatch[1].trim();
        if (SAFE_FONT_SIZE_RE.test(sizeVal)) {
          parts.push(`font-size:${sizeVal.toLowerCase()}`);
        }
      }

      // font-family (new — exact allowlist, no arbitrary families)
      const familyMatch = val.match(/\bfont-family\s*:\s*([^;]+)/i);
      if (familyMatch) {
        const canonical = safeFontFamily(familyMatch[1]);
        if (canonical) parts.push(`font-family:${canonical}`);
      }

      // color — negative lookbehind prevents matching background-color
      const colorMatch = val.match(/(?<![a-zA-Z-])color\s*:\s*([^;<>"']+)/i);
      if (colorMatch) {
        const colorVal = colorMatch[1].trim();
        if (SAFE_COLOR_RE.test(colorVal)) parts.push(`color:${colorVal}`);
      }

      // background-color
      const bgColorMatch = val.match(/\bbackground-color\s*:\s*([^;<>"']+)/i);
      if (bgColorMatch) {
        const bgVal = bgColorMatch[1].trim();
        if (SAFE_COLOR_RE.test(bgVal)) parts.push(`background-color:${bgVal}`);
      }

      if (parts.length) attrs.set("style", parts.join(";"));
      continue;
    }

    if (!allowed.has(name)) continue;
    if ((name === "href" || name === "src") && /^\s*javascript:/i.test(val)) continue;
    if ((name === "colspan" || name === "rowspan") && !/^\d{1,2}$/.test(val)) continue;
    attrs.set(name, val);
  }

  if (tagName === "a") {
    attrs.set("target", "_blank");
    attrs.set("rel",    "noreferrer");
  }

  return Array.from(attrs.entries())
    .map(([k, v]) => ` ${k}="${escapeAttrValue(v)}"`)
    .join("");
}

export function sanitizeHtml(raw: string | null | undefined): string {
  if (!raw) return "";

  const cleaned = String(raw)
    .slice(0, MAX_CONTENT_LENGTH)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");

  const result = cleaned.replace(
    /<\s*(\/)?([a-zA-Z][\w:-]*)([^>]*)>/g,
    (_match, closing, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (closing) return `</${tag}>`;
      return `<${tag}${sanitizeAttrs(tag, rawAttrs)}>`;
    },
  );

  return result
    .replace(/<p><br><\/p>/gi, "")
    .replace(/<div><br><\/div>/gi, "")
    .trim();
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

export function plainTextToHtml(text: string): string {
  if (!text) return "";
  const escaped = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function replacePlaceholders(
  html: string,
  values: Record<string, string>,
): string {
  return html.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key: string) => {
    const val = values[key.toLowerCase()];
    if (!val) return match;
    return escapeHtml(val);
  });
}

/**
 * Explicit allow-list of bracket placeholder names → value-map keys.
 * Only these exact patterns are replaced — nothing else is touched.
 * Matches both (Name) and [Name] forms, case-insensitive.
 */
const BRACKET_PLACEHOLDER_MAP: Record<string, string> = {
  "name":                 "client_name",
  "client name":          "client_name",
  "client":               "client_name",
  "dob":                  "dob",
  "date of birth":        "dob",
  "address":              "address",
  "age":                  "age",
  "diagnosis":            "diagnosis",
  "insurance":            "insurance_id",
  "insurance id":         "insurance_id",
  "school":               "school",
  "guardian":             "guardian_name",
  "guardian name":        "guardian_name",
  "provider":             "provider_name",
  "provider name":        "provider_name",
  "bcba":                 "provider_name",
  "bcba name":            "provider_name",
  "provider email":       "provider_email",
  "provider phone":       "provider_phone",
  "bcba credentials":     "provider_credentials",
  "credentials":          "provider_credentials",
  "assessment date":      "assessment_date",
  "date":                 "assessment_date",
  "service period start": "service_period_start",
  "service period end":   "service_period_end",
  "intake notes":         "intake_notes",
};

/**
 * Replaces bracket placeholders like (Name) or [DOB] using an explicit allow-list.
 * Does NOT use greedy/global replacement — only exact known field names are replaced.
 * Safe to run on any template HTML; unknown patterns are preserved.
 */
export function replaceBracketPlaceholders(
  html: string,
  values: Record<string, string>,
): string {
  return html.replace(/[(\[]([\w\s]+?)[)\]]/g, (match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    const valueKey = BRACKET_PLACEHOLDER_MAP[key];
    if (!valueKey) return match;
    const val = values[valueKey];
    if (!val) return match;
    return escapeHtml(val);
  });
}

/**
 * Placeholder words that resolve to the client's name when importing a Goal
 * Library template into a client's program. Mirrors BRACKET_PLACEHOLDER_MAP's
 * client-name aliases, plus ABA-friendly synonyms (child/learner/student).
 */
const CLIENT_NAME_PLACEHOLDER_WORDS = new Set([
  "client",
  "client name",
  "clientname",
  "child",
  "learner",
  "student",
]);

/**
 * Replaces client-name placeholders in PLAIN TEXT (goal titles / operational
 * definitions) with the client's name. Supports {{client}}, (Client), and
 * [Client] forms (case-insensitive) plus the aliases above.
 *
 * Unlike replacePlaceholders/replaceBracketPlaceholders, this does NOT
 * HTML-escape — goal text is rendered as plain text, so escaping would turn
 * apostrophes into entities. Only known client-name tokens are replaced; every
 * other bracketed/braced token is preserved untouched.
 */
export function replaceClientNamePlaceholders(
  text: string | null | undefined,
  clientName: string | null | undefined,
): string {
  const src  = text ?? "";
  const name = (clientName ?? "").trim();
  if (!src || !name) return src;

  const resolve = (match: string, rawKey: string): string =>
    CLIENT_NAME_PLACEHOLDER_WORDS.has(rawKey.trim().toLowerCase()) ? name : match;

  return src
    // {{ client }}
    .replace(/\{\{\s*([\w\s]+?)\s*\}\}/g, resolve)
    // (Client) or [Client]
    .replace(/[(\[]\s*([\w\s]+?)\s*[)\]]/g, resolve);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}
