const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "DIV",
  "EM",
  "H2",
  "H3",
  "H4",
  "LI",
  "OL",
  "P",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL"
]);

const ALLOWED_ATTRS = {
  A: new Set(["href", "target", "rel"]),
  TD: new Set(["colspan", "rowspan"]),
  TH: new Set(["colspan", "rowspan"])
};

function sanitizeNode(node, documentRef) {
  if (node.nodeType === Node.TEXT_NODE) {
    return documentRef.createTextNode(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return documentRef.createTextNode("");
  }

  const tagName = node.tagName.toUpperCase();
  const children = Array.from(node.childNodes);

  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = documentRef.createDocumentFragment();
    children.forEach((child) => fragment.appendChild(sanitizeNode(child, documentRef)));
    return fragment;
  }

  const clean = documentRef.createElement(tagName.toLowerCase());
  const allowedAttrs = ALLOWED_ATTRS[tagName] || new Set();

  Array.from(node.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase();
    const value = attr.value || "";
    if (!allowedAttrs.has(name)) return;
    if ((name === "href" || name === "src") && /^\s*javascript:/i.test(value)) return;
    clean.setAttribute(name, value);
  });

  if (tagName === "A") {
    clean.setAttribute("target", "_blank");
    clean.setAttribute("rel", "noreferrer");
  }

  children.forEach((child) => clean.appendChild(sanitizeNode(child, documentRef)));
  return clean;
}

function normalizeEmptyHtml(html) {
  return html
    .replace(/<p><br><\/p>/gi, "")
    .replace(/<div><br><\/div>/gi, "")
    .trim();
}

export function sanitizeRichTextHtml(html) {
  if (!html || typeof window === "undefined" || typeof DOMParser === "undefined") return "";

  const parser = new DOMParser();
  const parsed = parser.parseFromString(String(html), "text/html");
  const cleanDocument = document.implementation.createHTMLDocument("");
  const container = cleanDocument.createElement("div");

  Array.from(parsed.body.childNodes).forEach((node) => {
    container.appendChild(sanitizeNode(node, cleanDocument));
  });

  return normalizeEmptyHtml(container.innerHTML);
}

export function plainTextToHtml(text) {
  if (!text) return "";
  const escaped = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
