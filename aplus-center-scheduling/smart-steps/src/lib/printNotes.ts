import { escapeHtml } from "@/lib/sanitizeHtml";

/**
 * Client-side session-note → PDF export.
 *
 * Mirrors the print-window approach used by the clinical report exporter
 * (`assessments/reports/[id]/page.tsx`): open a blank window, write a fully
 * styled, self-contained HTML document, then call `window.print()` so the user
 * can "Save as PDF". No note data is mutated — content is read directly from
 * the records passed in.
 *
 * Supports single OR multiple notes in one document. Each note begins on its
 * own page via `page-break-before: always`.
 */

const LETTERHEAD_TOP_SRC = "/smart-steps/letterhead/smart-steps-top.png";

export type PrintableNote = {
  id: string;
  title: string | null;
  type: string;
  bcbaServiceType: string | null;
  serviceDate: string | null;
  timeIn: string | null;
  timeOut: string | null;
  attendance: string | null;
  content: string;
  recommendations: string | null;
  nextSteps: string | null;
  providerName: string | null;
  createdAt: string;
  user?: { name?: string | null; credentials?: string | null } | null;
};

const TYPE_LABEL: Record<string, string> = {
  BT_SESSION: "BT Session Note",
  BCBA: "BCBA Note",
  GENERAL: "General Note",
};

const BCBA_SERVICE_LABEL: Record<string, string> = {
  DSU: "Direct Supervision (DSU)",
  TM: "Team Meeting (TM)",
  TP: "Treatment Planning (TP)",
  PRT: "Parent Training (PRT)",
  ASSES: "Assessment (ASSES)",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function metaRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<div class="meta-item"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`;
}

/** Renders plain-text note content (the generator emits section headers + line breaks). */
function contentBlock(heading: string, text: string | null | undefined): string {
  if (!text || !text.trim()) return "";
  return `
    <section class="note-block">
      <h3>${escapeHtml(heading)}</h3>
      <div class="note-body">${escapeHtml(text)}</div>
    </section>`;
}

function noteHtml(note: PrintableNote, index: number): string {
  const typeLabel = TYPE_LABEL[note.type] ?? "Note";
  const provider = note.providerName ?? note.user?.name ?? "—";
  const credentials = note.user?.credentials ? `, ${note.user.credentials}` : "";
  const timeRange = note.timeIn ? `${note.timeIn}${note.timeOut ? ` – ${note.timeOut}` : ""}` : "";

  return `
  <article class="note-page" ${index > 0 ? 'style="page-break-before: always;"' : ""}>
    <header class="note-header">
      <img class="letterhead" src="${LETTERHEAD_TOP_SRC}" alt="">
      <div class="doc-title">
        <span class="doc-kind">${escapeHtml(typeLabel)}</span>
        <h1>${escapeHtml(note.title || typeLabel)}</h1>
      </div>
    </header>

    <div class="meta-grid">
      ${metaRow("Service Date", fmtDate(note.serviceDate ?? note.createdAt))}
      ${metaRow("Provider", provider + credentials)}
      ${note.type === "BCBA" && note.bcbaServiceType ? metaRow("Service Type", BCBA_SERVICE_LABEL[note.bcbaServiceType] ?? note.bcbaServiceType) : ""}
      ${metaRow("Time", timeRange)}
      ${metaRow("Attendance", note.attendance)}
    </div>

    ${contentBlock(note.type === "BCBA" ? "Narrative" : "Session Content", note.content)}
    ${contentBlock("Recommendations", note.recommendations)}
    ${contentBlock("Next Session Focus", note.nextSteps)}
  </article>`;
}

/**
 * Opens a print window containing one or more session notes and triggers the
 * browser print dialog. Returns `false` if the pop-up was blocked.
 */
export function printSessionNotes(notes: PrintableNote[], clientName: string): boolean {
  if (notes.length === 0) return true;
  const win = window.open("", "_blank");
  if (!win) return false;

  const docTitle = notes.length === 1
    ? `${notes[0].title || "Session Note"} — ${clientName}`
    : `Session Notes (${notes.length}) — ${clientName}`;

  const body = notes.map((note, i) => noteHtml(note, i)).join("");

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page { size: letter; margin: 0.7in 0.75in; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0b2f5b;
      --teal: #15948d;
      --line: #dfe7ed;
      --text: #162238;
      --muted: #5b6978;
    }
    body {
      font-family: "Aptos", "Segoe UI", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.5;
      color: var(--text);
      background: #fff;
    }
    .note-page { padding-top: 4pt; }
    .note-header {
      display: flex;
      align-items: center;
      gap: 14pt;
      border-bottom: 2px solid var(--navy);
      padding-bottom: 10pt;
      margin-bottom: 12pt;
    }
    .letterhead { width: 150px; height: auto; }
    .doc-title { flex: 1; min-width: 0; }
    .doc-kind {
      display: block;
      color: var(--teal);
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .doc-title h1 {
      color: var(--navy);
      font-size: 16pt;
      line-height: 1.15;
      margin-top: 2pt;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6pt 18pt;
      border: 1px solid var(--line);
      border-radius: 5pt;
      padding: 10pt 12pt;
      margin-bottom: 14pt;
      background: #f8fafb;
    }
    .meta-item { display: flex; flex-direction: column; }
    .meta-label {
      color: var(--muted);
      font-size: 7pt;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }
    .meta-value { color: var(--navy); font-size: 9.5pt; font-weight: 650; }
    .note-block { margin-bottom: 13pt; page-break-inside: auto; }
    .note-block h3 {
      color: var(--navy);
      font-size: 10pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--line);
      padding-bottom: 4pt;
      margin-bottom: 7pt;
    }
    .note-body { white-space: pre-wrap; font-size: 10pt; line-height: 1.55; }
    @media print {
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`);
  win.document.close();

  const images = Array.from(win.document.images);
  Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  })).then(() => {
    win.focus();
    setTimeout(() => { win.print(); }, 100);
  });

  return true;
}
