/**
 * Allowlist-based HTML sanitizer — runs in Node.js (API routes) and browser alike.
 * No DOM dependency; uses regex + string processing only.
 */

const MAX_CONTENT_LENGTH = 150_000;

const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "div", "em",
  "h2", "h3", "h4", "li", "ol", "p", "strong",
  "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:  new Set(["href", "target", "rel"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;");
}

function sanitizeAttrs(tagName: string, rawAttrs: string): string {
  const allowed = ALLOWED_ATTRS[tagName] ?? new Set<string>();
  const attrs   = new Map<string, string>();
  const pat     = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;

  while ((m = pat.exec(rawAttrs)) !== null) {
    const name = m[1].toLowerCase();
    const val  = m[2] ?? m[3] ?? m[4] ?? "";
    if (name.startsWith("on") || name === "style" || !allowed.has(name)) continue;
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

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}
