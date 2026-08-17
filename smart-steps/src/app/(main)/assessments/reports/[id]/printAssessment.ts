/**
 * Print / Save-as-PDF for client assessment reports.
 *
 * Renders the classic Smart Steps letterhead document (approved 2026-08-17):
 * every page carries the letterhead strip (logo + contact block) at the top,
 * the faint tree watermark behind the body, and the gold/navy diagonal band
 * at the bottom. Page 1 opens with the underlined fill-in header block
 * (Service Period / Provider / Client / Address lines) sourced from the
 * "Service Period / Provider Information" section's fact table, followed by
 * the numbered clinical sections.
 */

import { escapeHtml } from "@/lib/sanitizeHtml";

export type PrintSection = { id: string; title: string; order: number; content: string };
export type PrintReport = {
  id: string; title: string; status: string; createdAt: string; updatedAt: string;
  client:   { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  sections: PrintSection[];
};

const ASSET_VERSION = "aligned-20260817";
const LETTERHEAD_TOP_SRC       = `/smart-steps/letterhead/smart-steps-top.png?v=${ASSET_VERSION}`;
const LETTERHEAD_WATERMARK_SRC = `/smart-steps/letterhead/smart-steps-watermark.png?v=${ASSET_VERSION}`;
const LETTERHEAD_BOTTOM_SRC    = `/smart-steps/letterhead/smart-steps-bottom.png?v=${ASSET_VERSION}`;

type FactMap = Record<string, string>;

function parseHtmlFragment(html: string) {
  return new DOMParser().parseFromString(`<main>${html || ""}</main>`, "text/html");
}

function normalizeDisplayText(value: string) {
  return value
    .replace(/ /g, " ")
    .replace(/┬á|Â /g, " ")
    .replace(/â€¢|ÔÇó|ΓÇó|┬╖|�/g, "•")
    .replace(/â€“|ÔÇô/g, "-")
    .replace(/ΓÇô|â€”|ÔÇö|ΓÇö/g, "-")
    .replace(/â€™|ÔÇÖ|ΓÇÖ/g, "'")
    .replace(/â€œ|â€|ÔÇ£|ÔÇØ|ΓÇ£|ΓÇ¥/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInlineText(value: string) {
  return value
    .replace(/ /g, " ")
    .replace(/┬á|Â /g, " ")
    .replace(/â€¢|ÔÇó|ΓÇó|┬╖|�/g, "•")
    .replace(/â€“|ÔÇô/g, "-")
    .replace(/ΓÇô|â€”|ÔÇö|ΓÇö/g, "-")
    .replace(/â€™|ÔÇÖ|ΓÇÖ/g, "'")
    .replace(/â€œ|â€|ÔÇ£|ÔÇØ|ΓÇ£|ΓÇ¥/g, '"')
    .replace(/\s+/g, " ");
}

function stripNumberPrefix(title: string) {
  return title.replace(/^\s*\d+\.\s*/, "").trim();
}

/** Reads label/value rows out of the provider-info section's table. */
function extractFacts(html: string): FactMap {
  const doc = parseHtmlFragment(html);
  const facts: FactMap = {};
  doc.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.children);
    if (cells.length < 2) return;
    const key = normalizeDisplayText(cells[0].textContent ?? "").replace(/:$/, "");
    const value = normalizeDisplayText(cells.slice(1).map((cell) => cell.textContent ?? "").join(" "));
    if (key) facts[key] = value;
  });
  return facts;
}

/** Returns the fact value, or "" when missing or still an [editable placeholder]. */
function getFact(facts: FactMap, key: string, fallback = "") {
  const v = facts[key] || "";
  if (!v || v.startsWith("[")) return fallback;
  return v;
}

function normalizeSectionHtml(html: string) {
  const doc = parseHtmlFragment(html || "<p><em>(empty)</em></p>");
  const root = doc.querySelector("main");
  if (!root) return "<p><em>(empty)</em></p>";

  root.querySelectorAll("span").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    span.remove();
  });

  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    // Keep text-align (category header rows are centered); drop everything else
    const align = el.style?.textAlign;
    el.removeAttribute("style");
    el.removeAttribute("class");
    el.removeAttribute("id");
    if (align) el.style.textAlign = align;
  });

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((node) => {
    node.nodeValue = normalizeInlineText(node.nodeValue ?? "");
  });

  root.querySelectorAll("p, h2, h3, h4, li, td, th").forEach((el) => {
    if (normalizeDisplayText(el.textContent ?? "") === "" && !el.querySelector("br") &&
        el.tagName !== "TD" && el.tagName !== "TH") {
      el.remove();
    }
  });

  return root.innerHTML.trim() || "<p><em>(empty)</em></p>";
}

/** "01/2026 – 07/2026" → "2026"; falls back through start date then assessment date. */
function extractYear(...candidates: string[]): string {
  for (const c of candidates) {
    const m = c.match(/\b(20\d{2})\b/);
    if (m) return m[1];
  }
  return "";
}

export function printAssessmentReport(
  report: PrintReport,
  sections: PrintSection[],
  onError?: (msg: string) => void,
) {
  const win = window.open("", "_blank");
  if (!win) { onError?.("Pop-up blocked — allow pop-ups and try again."); return; }

  const orderedSections = [...sections].sort((a, b) => a.order - b.order);
  const providerSection = orderedSections.find((s) => /service\s+period|provider\s+information/i.test(s.title)) ?? null;
  const contentSections = orderedSections.filter((s) => s.id !== providerSection?.id);
  const facts = extractFacts(providerSection?.content ?? "");

  const clientName  = report.client?.name ?? getFact(facts, "Client Name");
  const servStart   = getFact(facts, "Service Period Start");
  const servEnd     = getFact(facts, "Service Period End");
  const assessDate  = getFact(facts, "Assessment Date",
    new Date(report.updatedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }));
  const year        = extractYear(servEnd, servStart, assessDate);
  const bcbaName    = getFact(facts, "BCBA Name");
  const bcbaTitle   = getFact(facts, "BCBA Credentials", "BCBA");
  const bcbaPhone   = getFact(facts, "BCBA Phone");
  const bcbaEmail   = getFact(facts, "BCBA Email");
  const dob         = getFact(facts, "Date of Birth").replace(/\s*\(Age[^)]*\)/i, "");
  const address     = getFact(facts, "Address");
  const memId       = getFact(facts, "Insurance ID");

  const fill = (v: string, minWidth = "1.2in") =>
    `<span class="fill" style="min-width:${minWidth}">${escapeHtml(v)}</span>`;

  const headerBlockHtml = `
    <div class="hdr-block">
      <p class="hdr center">Service Period- 6 Months: ${fill(servStart && servEnd ? `${servStart} – ${servEnd}` : servStart || servEnd, "1.6in")}&nbsp;&nbsp;Year: ${fill(year, "0.7in")}</p>
      <p class="hdr">Provider’s Name: ${fill(bcbaName, "2.2in")}&nbsp;&nbsp;Title: ${fill(bcbaTitle, "1.4in")}</p>
      <p class="hdr">Phone Number: ${fill(bcbaPhone, "1.6in")}&nbsp;&nbsp;Email: ${fill(bcbaEmail, "2.4in")}</p>
      <p class="hdr">Client’s Name: ${fill(clientName, "2.4in")}&nbsp;&nbsp;DOB: ${fill(dob, "1.5in")}</p>
      <p class="hdr">Address: ${fill(address, "3in")}&nbsp;&nbsp;Mem. ID: ${fill(memId, "1.6in")}</p>
    </div>`;

  // Numbered section source blocks. "Attachment ..." sections are not numbered.
  let sectionNumber = 0;
  const sectionHtml = contentSections
    .map((section) => {
      const cleanTitle = stripNumberPrefix(section.title);
      const isAttachment = /^attachment/i.test(cleanTitle);
      const headingText = isAttachment ? cleanTitle : `${++sectionNumber}. ${cleanTitle}`;
      return `
      <section class="report-section" data-section-id="${escapeHtml(section.id)}">
        <h2 class="section-title">${escapeHtml(headingText)}</h2>
        <div class="section-content">${normalizeSectionHtml(section.content)}</div>
      </section>`;
    })
    .join("");

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(report.title)}</title>
  <style>
    @page { size: letter; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { background: #fff; }
    body {
      font-family: "Calibri", "Segoe UI", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.42;
      color: #111;
      background: #fff;
      max-width: 8.5in;
      margin: 0 auto;
    }
    .content-page {
      position: relative;
      width: 8.5in;
      height: 11in;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      background: #fff;
    }
    .content-page:last-child { page-break-after: auto; break-after: auto; }
    .page-letterhead { display: block; width: 8.5in; height: auto; }
    .page-watermark {
      position: absolute;
      top: 50%; left: 50%;
      width: 5.6in; height: auto;
      transform: translate(-50%, -46%);
      opacity: 0.06;
      pointer-events: none;
      user-select: none;
      z-index: 0;
    }
    .page-band {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      width: 8.5in; height: auto;
      z-index: 0;
      pointer-events: none;
      user-select: none;
    }
    .content-page-inner {
      position: relative;
      z-index: 1;
      height: 7.55in;
      padding: 0.12in 0.72in 0;
      overflow: hidden;
    }
    /* ── Fill-in header block (page 1) ── */
    .hdr-block { margin: 0.05in 0 0.12in; }
    .hdr { margin: 0 0 9pt; line-height: 1.9; }
    .hdr.center { text-align: center; }
    .fill {
      display: inline-block;
      border-bottom: 1px solid #111;
      padding: 0 10px;
      text-align: center;
    }
    /* ── Sections ── */
    .report-section { margin-bottom: 12pt; orphans: 3; widows: 3; }
    .section-title {
      font-size: 11.5pt;
      font-weight: bold;
      color: #111;
      margin: 0 0 6pt;
      page-break-after: avoid;
    }
    .section-content { font-size: 10pt; }
    .section-content p  { margin: 0 0 7pt; text-align: justify; }
    .section-content h3 { font-size: 10.5pt; font-weight: bold; margin: 8pt 0 4pt; page-break-after: avoid; }
    .section-content h4 { font-size: 10pt;  font-weight: bold; margin: 6pt 0 4pt; page-break-after: avoid; }
    .section-content ul, .section-content ol { margin: 4pt 0 7pt 20pt; }
    .section-content li { margin-bottom: 3pt; }
    .section-content hr { border: none; border-top: 1px solid #999; margin: 8pt 0; }
    strong { font-weight: bold; }
    em, i { font-style: italic; }
    u { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 5pt 0 9pt;
      font-size: 9pt;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td {
      border: 1px solid #444;
      padding: 3.5pt 5.5pt;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f2f2f2; font-weight: bold; }
    /* Category / NEW GOALS header rows (colspan cells) */
    td[colspan], th[colspan] {
      text-align: center;
      background: #f8f8f8;
      font-weight: bold;
    }
    @media print {
      html, body {
        width: 8.5in;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
      h2, h3, h4 { page-break-after: avoid; }
      a { color: #000; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main id="paginated-pages"></main>
  <div id="pagination-source" style="display:none">
    ${headerBlockHtml}
    ${sectionHtml}
  </div>
</body>
</html>`);

  win.document.close();

  function paginatePrintDocument(doc: Document) {
    const source = doc.getElementById("pagination-source");
    const target = doc.getElementById("paginated-pages");
    if (!source || !target) return;

    const tolerance = 2;
    let pageInner: HTMLElement | null = null;

    function createPage() {
      const page = doc.createElement("section");
      page.className = "content-page";
      page.setAttribute("aria-label", "Assessment page");

      const letterhead = doc.createElement("img");
      letterhead.className = "page-letterhead";
      letterhead.src = LETTERHEAD_TOP_SRC;
      letterhead.alt = "";

      const watermark = doc.createElement("img");
      watermark.className = "page-watermark";
      watermark.src = LETTERHEAD_WATERMARK_SRC;
      watermark.alt = "";

      const band = doc.createElement("img");
      band.className = "page-band";
      band.src = LETTERHEAD_BOTTOM_SRC;
      band.alt = "";

      const inner = doc.createElement("div");
      inner.className = "content-page-inner";

      page.append(letterhead, watermark, inner, band);
      target!.appendChild(page);
      pageInner = inner;
      return inner;
    }

    function createSectionShell(titleHtml: string, continued: boolean) {
      const shell = doc.createElement("section");
      shell.className = "report-section";
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = titleHtml;
      if (continued) {
        const title = wrapper.querySelector("h2");
        if (title) title.innerHTML += ` <em style="font-weight:normal;font-size:9pt">(continued)</em>`;
      }
      const contentEl = doc.createElement("div");
      contentEl.className = "section-content";
      shell.append(...Array.from(wrapper.childNodes), contentEl);
      return { shell, contentEl };
    }

    function pageOverflows() {
      return !!pageInner && pageInner.scrollHeight > pageInner.clientHeight + tolerance;
    }

    function appendHeaderBlock(block: Element) {
      if (!pageInner) createPage();
      pageInner!.appendChild(block);
    }

    function appendSectionToPages(section: Element) {
      const heading = section.querySelector(".section-title");
      const content = section.querySelector(".section-content");
      const titleHtml = heading?.outerHTML || "";
      // Skip whitespace-only text nodes — they cause phantom "(continued)" shells
      const blocks = content
        ? Array.from(content.childNodes).filter(
            (n) => n.nodeType !== Node.TEXT_NODE || (n.nodeValue ?? "").trim() !== "",
          )
        : [];
      let current = createSectionShell(titleHtml, false);
      let placedInCurrent = 0;

      if (!pageInner) createPage();
      pageInner!.appendChild(current.shell);

      if (pageOverflows()) {
        current.shell.remove();
        createPage();
        pageInner!.appendChild(current.shell);
      }

      function startContinuationShell() {
        createPage();
        current = createSectionShell(titleHtml, true);
        pageInner!.appendChild(current.shell);
        placedInCurrent = 0;
      }

      /** Moves trailing tbody rows into a cloned continuation table until the
       *  page fits; continuation tables (with a copied thead) flow onto the
       *  following pages. Keeps every row — nothing is clipped. */
      function appendTableAcrossPages(table: HTMLTableElement) {
        current.contentEl.appendChild(table);
        placedInCurrent++;
        if (!pageOverflows()) return;

        let working = table;
        for (;;) {
          const tbody = working.tBodies[0];
          const removed: HTMLTableRowElement[] = [];
          while (pageOverflows() && tbody && tbody.rows.length > 1) {
            const last = tbody.rows[tbody.rows.length - 1];
            removed.unshift(last);
            tbody.removeChild(last);
          }

          if (pageOverflows()) {
            // Even a single row doesn't fit on this page.
            if (placedInCurrent > 1 || (pageInner && pageInner.children.length > 1)) {
              // Page had other content — move the whole table to a fresh page.
              removed.forEach((r) => tbody?.appendChild(r));
              current.contentEl.removeChild(working);
              placedInCurrent--;
              startContinuationShell();
              current.contentEl.appendChild(working);
              placedInCurrent++;
              continue;
            }
            // Table alone on an empty page and still overflowing with one row —
            // pathological row; restore and let it clip rather than loop forever.
            removed.forEach((r) => tbody?.appendChild(r));
            return;
          }

          if (removed.length === 0) return;

          // Build continuation table on a new page with the remaining rows.
          const cont = working.cloneNode(false) as HTMLTableElement;
          const thead = working.tHead;
          if (thead) cont.appendChild(thead.cloneNode(true));
          const contBody = doc.createElement("tbody");
          removed.forEach((r) => contBody.appendChild(r));
          cont.appendChild(contBody);

          startContinuationShell();
          current.contentEl.appendChild(cont);
          placedInCurrent++;
          if (!pageOverflows()) return;
          working = cont;
        }
      }

      for (const block of blocks) {
        if (block.nodeType === Node.ELEMENT_NODE && (block as Element).tagName === "TABLE") {
          appendTableAcrossPages(block as HTMLTableElement);
          continue;
        }

        current.contentEl.appendChild(block);
        placedInCurrent++;
        if (!pageOverflows()) continue;

        current.contentEl.removeChild(block);
        placedInCurrent--;
        if (placedInCurrent === 0) {
          // First block of this shell doesn't fit. If the page has other
          // content, move the whole shell to a fresh page and retry there.
          if (pageInner && pageInner.children.length > 1) {
            current.shell.remove();
            createPage();
            pageInner!.appendChild(current.shell);
            current.contentEl.appendChild(block);
            placedInCurrent++;
            if (!pageOverflows()) continue;
            current.contentEl.removeChild(block);
            placedInCurrent--;
          }
          // single block taller than an empty page — keep it and let it clip
          current.contentEl.appendChild(block);
          placedInCurrent++;
          continue;
        }

        startContinuationShell();
        current.contentEl.appendChild(block);
        placedInCurrent++;
      }
    }

    createPage();
    const headerBlock = source.querySelector(".hdr-block");
    if (headerBlock) appendHeaderBlock(headerBlock);
    Array.from(source.querySelectorAll(".report-section")).forEach(appendSectionToPages);
    const lastInner = target.lastElementChild?.querySelector(".content-page-inner");
    if (lastInner && lastInner.childNodes.length === 0) {
      target.lastElementChild!.remove();
    }
    source.remove();
  }

  const images = Array.from(win.document.images);
  Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  })).then(() => {
    paginatePrintDocument(win.document);
    win.focus();
    setTimeout(() => { win.print(); }, 100);
  });
}
