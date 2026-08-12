"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeHtml, plainTextToHtml } from "@/lib/sanitizeHtml";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT_SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "24px"] as const;

const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
] as const;

const TEXT_COLORS = [
  { label: "Default",   value: "#111111" },
  { label: "Gray",      value: "#666666" },
  { label: "Red",       value: "#cc0000" },
  { label: "Dark Blue", value: "#003399" },
  { label: "Blue",      value: "#0055cc" },
  { label: "Green",     value: "#006600" },
  { label: "Purple",    value: "#660099" },
  { label: "Orange",    value: "#cc5500" },
] as const;

const HIGHLIGHT_COLORS = [
  { label: "Yellow",  value: "#ffff00" },
  { label: "Cyan",    value: "#ccffff" },
  { label: "Green",   value: "#ccffcc" },
  { label: "Pink",    value: "#ffcccc" },
  { label: "Tan",     value: "#fff0cc" },
] as const;

// ── Toolbar helpers ───────────────────────────────────────────────────────────

function Btn({
  children, title, onClick, active = false,
}: {
  children: React.ReactNode; title: string;
  onClick: () => void; active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors
        ${active
          ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30"
          : "border border-[var(--glass-border)] text-zinc-400 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/5"
        }`}
    >
      {children}
    </button>
  );
}

function TableBtn({
  children, title, onClick, disabled,
}: {
  children: React.ReactNode; title: string;
  onClick: () => void; disabled: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors
        border-emerald-800/40 text-emerald-500
        hover:border-emerald-600/50 hover:bg-emerald-500/10 hover:text-emerald-400
        disabled:cursor-not-allowed disabled:border-[var(--glass-border)] disabled:text-zinc-700
        disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Select dropdown styled to match the toolbar. Saves selection before the
 *  editor loses focus to the dropdown, then restores it in `onChange`. */
function ToolbarSelect({
  placeholder, options, onSaveSelection, onApply,
}: {
  placeholder: string;
  options: readonly string[];
  onSaveSelection: () => void;
  onApply: (value: string) => void;
}) {
  return (
    <select
      defaultValue=""
      onMouseDown={onSaveSelection}
      onChange={(e) => {
        const v = e.target.value;
        if (v) onApply(v);
        // Reset so same value can be re-applied
        e.target.value = "";
      }}
      className="rounded border border-[var(--glass-border)] bg-[var(--glass-bg)] px-1.5 py-0.5
        text-[11px] text-zinc-400 hover:border-[var(--accent-cyan)]/40
        hover:text-[var(--accent-cyan)] transition-colors cursor-pointer outline-none"
    >
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

/** Color select dropdown — accepts labeled {label,value} options. */
function ColorSelect({
  placeholder, options, onSaveSelection, onApply,
}: {
  placeholder: string;
  options: readonly { label: string; value: string }[];
  onSaveSelection: () => void;
  onApply: (value: string) => void;
}) {
  return (
    <select
      defaultValue=""
      onMouseDown={onSaveSelection}
      onChange={(e) => {
        const v = e.target.value;
        if (v) onApply(v);
        e.target.value = "";
      }}
      className="rounded border border-[var(--glass-border)] bg-[var(--glass-bg)] px-1.5 py-0.5
        text-[11px] text-zinc-400 hover:border-[var(--accent-cyan)]/40
        hover:text-[var(--accent-cyan)] transition-colors cursor-pointer outline-none"
    >
      <option value="" disabled>{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Default table blocks ──────────────────────────────────────────────────────

const TABLE_BLOCKS = [
  { id: "mastered",   label: "Mastered Goals",   cols: ["Category", "Goal / Operational Definition", "Date Mastered"] },
  { id: "current",    label: "Current Goals",    cols: ["Behavior", "Objective / Operational Definition", "Start Date", "Baseline Level", "Current Level"] },
  { id: "parent",     label: "Parent Goals",     cols: ["Behavior", "Objective", "Introduction Date", "Baseline Level", "Current Level", "Carrying Over?", "Comments"] },
  { id: "treatment",  label: "Treatment Hrs",    cols: ["Service", "# Hrs Presently Receiving", "Recommendation", "Rationale"] },
  { id: "schedule",   label: "Schedule",         cols: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] },
] as const;

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildTable(cols: readonly string[]): string {
  const heads = cols.map((c) => `<th>${esc(c)}</th>`).join("");
  const cells = cols.map(() => "<td><br></td>").join("");
  return `<table><thead><tr>${heads}</tr></thead><tbody><tr>${cells}</tr></tbody></table><p><br></p>`;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

/** Returns the logical column index of `cell` in `row`, accounting for colspans. */
function getLogicalColIndex(row: HTMLTableRowElement, cell: HTMLTableCellElement): number {
  let col = 0;
  for (let i = 0; i < row.cells.length; i++) {
    if (row.cells[i] === cell) return col;
    col += (row.cells[i] as HTMLTableCellElement).colSpan || 1;
  }
  return col;
}

/** Returns the cell at `targetCol` logical column in `row`, or null. */
function findCellAtLogicalCol(
  row: HTMLTableRowElement,
  targetCol: number,
): HTMLTableCellElement | null {
  let col = 0;
  for (let i = 0; i < row.cells.length; i++) {
    if (col === targetCol) return row.cells[i] as HTMLTableCellElement;
    col += (row.cells[i] as HTMLTableCellElement).colSpan || 1;
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RichTextEditor({ value, onChange, disabled = false, placeholder }: Props) {
  const editorRef      = useRef<HTMLDivElement>(null);
  const lastHtmlRef    = useRef("");
  const activeCellRef  = useRef<HTMLTableCellElement | null>(null);
  const prevCellRef    = useRef<HTMLTableCellElement | null>(null);
  /** Saved selection range — persists when editor loses focus to toolbar controls. */
  const savedRangeRef  = useRef<Range | null>(null);

  const [hasCell,      setHasCell]      = useState(false);
  const [hasMergeRight, setHasMergeRight] = useState(false);
  const [hasMergeDown,  setHasMergeDown]  = useState(false);

  // Sync incoming value → DOM (only when changed externally)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const clean = sanitizeHtml(value || "");
    if (clean !== lastHtmlRef.current && el.innerHTML !== clean) {
      el.innerHTML = clean;
      lastHtmlRef.current = clean;
    }
  }, [value]);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    const clean = sanitizeHtml(el.innerHTML);
    lastHtmlRef.current = clean;
    onChange(clean);
  };

  // ── Cell tracking ──────────────────────────────────────────────────────────

  function getSelectionCell(): HTMLTableCellElement | null {
    const el  = editorRef.current;
    const sel = window.getSelection?.();
    if (!el || !sel || sel.rangeCount === 0) return null;
    let node: Node | null = sel.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = (node as Text).parentElement;
    while (node && node !== el) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches("td,th"))
        return node as HTMLTableCellElement;
      node = (node as Element).parentElement;
    }
    return null;
  }

  function syncCell() {
    const el   = editorRef.current;
    const cell = getSelectionCell();
    const next = cell && el?.contains(cell) ? cell : null;

    // Save current selection for font operations (before focus can move to toolbar)
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }

    // Update DOM class for active-cell highlight (stripped by sanitizer on save)
    if (prevCellRef.current !== next) {
      prevCellRef.current?.classList.remove("rte-active-cell");
      next?.classList.add("rte-active-cell");
      prevCellRef.current = next;
    }
    activeCellRef.current = next;
    setHasCell(Boolean(next));

    // Update merge-right availability
    if (next) {
      const row   = next.parentElement as HTMLTableRowElement | null;
      const table = next.closest("table") as HTMLTableElement | null;
      if (row) {
        const idx = Array.from(row.cells).indexOf(next);
        setHasMergeRight(idx < row.cells.length - 1);
      } else {
        setHasMergeRight(false);
      }
      if (table && row) {
        const rowIdx = Array.from(table.rows).indexOf(row);
        setHasMergeDown(rowIdx < table.rows.length - 1);
      } else {
        setHasMergeDown(false);
      }
    } else {
      setHasMergeRight(false);
      setHasMergeDown(false);
    }
  }

  function getActiveCell(): HTMLTableCellElement | null {
    const el   = editorRef.current;
    const cur  = activeCellRef.current;
    if (cur && el?.contains(cur)) return cur;
    const found = getSelectionCell();
    activeCellRef.current = found;
    setHasCell(Boolean(found));
    return found;
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  function cmd(command: string, arg: string | null = null) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, arg ?? undefined);
    emit();
  }

  /**
   * Applies an inline style to the currently selected text by wrapping it in
   * a <span style="..."> element.  Uses the saved selection so it works even
   * after the toolbar control has taken focus from the editor.
   *
   * Supports: fontSize, fontFamily (via span.style[prop]), and
   * color / backgroundColor (via setAttribute to preserve hex values —
   * the DOM would otherwise normalize hex to rgb()).
   * All values are validated by sanitizeHtml on the next emit.
   */
  function applyInlineStyle(
    cssProp: "fontSize" | "fontFamily" | "color" | "backgroundColor",
    cssValue: string,
  ) {
    const el = editorRef.current;
    if (!el || disabled) return;

    // Restore saved selection (editor may have lost focus to toolbar select)
    const savedRange = savedRangeRef.current;
    const sel = window.getSelection();
    if (!sel || !savedRange) return;

    try {
      if (!el.contains(savedRange.commonAncestorContainer)) return;
      sel.removeAllRanges();
      sel.addRange(savedRange);
    } catch { return; }

    if (sel.isCollapsed) return; // nothing selected — silent no-op

    el.focus();

    const range = sel.getRangeAt(0);
    const span  = document.createElement("span");

    // Use setAttribute for colors to preserve hex (DOM normalizes to rgb())
    if (cssProp === "color") {
      span.setAttribute("style", `color:${cssValue}`);
    } else if (cssProp === "backgroundColor") {
      span.setAttribute("style", `background-color:${cssValue}`);
    } else {
      span.style[cssProp] = cssValue;
    }

    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      // Re-select the wrapped content
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
      savedRangeRef.current = newRange.cloneRange();
    } catch {
      return; // safe failure — do not emit
    }

    emit();
  }

  /** Save current selection before the toolbar control takes focus. */
  function saveSelection() {
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }

  // ── Table operations ───────────────────────────────────────────────────────

  function insertTable(cols: readonly string[]) {
    cmd("insertHTML", buildTable(cols));
  }

  function focusCell(cell: HTMLTableCellElement | null | undefined) {
    if (!cell) return;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    prevCellRef.current?.classList.remove("rte-active-cell");
    cell.classList.add("rte-active-cell");
    prevCellRef.current = cell;
    activeCellRef.current = cell;
    setHasCell(true);
    editorRef.current?.focus();
    syncCell();
  }

  function addRowBelow() {
    if (disabled) return;
    const cell = getActiveCell();
    const row  = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !row) return;
    const newRow = row.cloneNode(false) as HTMLTableRowElement;
    Array.from(row.cells).forEach((src) => {
      const tag  = src.tagName.toLowerCase();
      const next = document.createElement(tag) as HTMLTableCellElement;
      if (src.colSpan > 1) next.setAttribute("colspan", String(src.colSpan));
      if (src.rowSpan > 1) next.setAttribute("rowspan", String(src.rowSpan));
      next.innerHTML = "<br>";
      newRow.appendChild(next);
    });
    row.parentNode!.insertBefore(newRow, row.nextSibling);
    emit();
    focusCell(newRow.cells[Math.min(cell.cellIndex, newRow.cells.length - 1)] as HTMLTableCellElement);
  }

  function addRowAbove() {
    if (disabled) return;
    const cell = getActiveCell();
    const row  = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !row) return;
    const newRow = row.cloneNode(false) as HTMLTableRowElement;
    Array.from(row.cells).forEach((src) => {
      const tag  = src.tagName.toLowerCase();
      const next = document.createElement(tag) as HTMLTableCellElement;
      if (src.colSpan > 1) next.setAttribute("colspan", String(src.colSpan));
      if (src.rowSpan > 1) next.setAttribute("rowspan", String(src.rowSpan));
      next.innerHTML = "<br>";
      newRow.appendChild(next);
    });
    row.parentNode!.insertBefore(newRow, row);
    emit();
    focusCell(newRow.cells[Math.min(cell.cellIndex, newRow.cells.length - 1)] as HTMLTableCellElement);
  }

  function deleteCurrentRow() {
    if (disabled) return;
    const cell  = getActiveCell();
    const row   = cell?.parentElement as HTMLTableRowElement | null;
    const table = row?.closest("table") as HTMLTableElement | null;
    if (!cell || !row || !table) return;
    const rows = Array.from(table.rows);
    if (rows.length <= 1) {
      table.remove();
      emit();
      activeCellRef.current = null;
      setHasCell(false);
      editorRef.current?.focus();
      return;
    }
    const idx      = rows.indexOf(row);
    const nextRow  = rows[idx + 1] ?? rows[idx - 1];
    const nextCell = nextRow?.cells[Math.min(cell.cellIndex, nextRow.cells.length - 1)] as HTMLTableCellElement | undefined;
    row.remove();
    emit();
    focusCell(nextCell);
  }

  function addColumnRight() {
    if (disabled) return;
    const cell  = getActiveCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const insertIdx = cell.cellIndex + 1;
    Array.from(table.rows).forEach((row) => {
      const ref  = insertIdx < row.cells.length ? row.cells[insertIdx] : null;
      const tag  = row.parentElement?.tagName === "THEAD" ? "th" : "td";
      const next = document.createElement(tag) as HTMLTableCellElement;
      next.innerHTML = "<br>";
      row.insertBefore(next, ref);
    });
    emit();
    focusCell((cell.parentElement as HTMLTableRowElement | null)?.cells[insertIdx] as HTMLTableCellElement | undefined);
  }

  function addColumnLeft() {
    if (disabled) return;
    const cell  = getActiveCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const insertIdx = cell.cellIndex;
    Array.from(table.rows).forEach((row) => {
      const ref  = insertIdx < row.cells.length ? row.cells[insertIdx] : null;
      const tag  = row.parentElement?.tagName === "THEAD" ? "th" : "td";
      const next = document.createElement(tag) as HTMLTableCellElement;
      next.innerHTML = "<br>";
      row.insertBefore(next, ref);
    });
    emit();
    focusCell((cell.parentElement as HTMLTableRowElement | null)?.cells[insertIdx] as HTMLTableCellElement | undefined);
  }

  function deleteCurrentColumn() {
    if (disabled) return;
    const cell  = getActiveCell();
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !table) return;
    const removeIdx = cell.cellIndex;
    const maxCols   = Math.max(...Array.from(table.rows).map((r) => r.cells.length));
    if (maxCols <= 1) {
      table.remove();
      emit();
      activeCellRef.current = null;
      setHasCell(false);
      editorRef.current?.focus();
      return;
    }
    let nextCell: HTMLTableCellElement | null = null;
    Array.from(table.rows).forEach((row) => {
      const target = row.cells[removeIdx];
      if (!nextCell)
        nextCell = (row.cells[removeIdx + 1] ?? row.cells[removeIdx - 1] ?? null) as HTMLTableCellElement | null;
      target?.remove();
    });
    emit();
    focusCell(nextCell);
  }

  /**
   * Merge Right — combines the active cell with the immediately adjacent right
   * cell in the same row, increasing colspan and transferring content.
   * Safe failure: any error leaves the table unchanged.
   */
  function mergeRight() {
    if (disabled) return;
    const cell = getActiveCell();
    const row  = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !row) return;
    try {
      const idx      = Array.from(row.cells).indexOf(cell);
      const nextCell = row.cells[idx + 1] as HTMLTableCellElement | undefined;
      if (!nextCell) return;
      // Transfer content (with a <br> separator)
      cell.appendChild(document.createElement("br"));
      while (nextCell.firstChild) cell.appendChild(nextCell.firstChild);
      cell.colSpan = (cell.colSpan || 1) + (nextCell.colSpan || 1);
      nextCell.remove();
      emit();
      focusCell(cell);
    } catch { /* safe failure — table not modified */ }
  }

  /**
   * Merge Down — combines the active cell with the cell directly below it in
   * the next row (identified by logical column index, accounting for existing
   * colspans).  Increases rowspan and transfers content.
   * Safe failure: any error leaves the table unchanged.
   */
  function mergeDown() {
    if (disabled) return;
    const cell  = getActiveCell();
    const row   = cell?.parentElement as HTMLTableRowElement | null;
    const table = cell?.closest("table") as HTMLTableElement | null;
    if (!cell || !row || !table) return;
    try {
      const logicalCol = getLogicalColIndex(row, cell);
      const rowIdx     = Array.from(table.rows).indexOf(row);
      const nextRow    = table.rows[rowIdx + 1] as HTMLTableRowElement | undefined;
      if (!nextRow) return;
      const nextCell = findCellAtLogicalCol(nextRow, logicalCol);
      if (!nextCell) return;
      // Transfer content (with a <br> separator)
      cell.appendChild(document.createElement("br"));
      while (nextCell.firstChild) cell.appendChild(nextCell.firstChild);
      cell.rowSpan = (cell.rowSpan || 1) + (nextCell.rowSpan || 1);
      nextCell.remove();
      emit();
      focusCell(cell);
    } catch { /* safe failure — table not modified */ }
  }

  // ── Paste ──────────────────────────────────────────────────────────────────

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    let clean: string;
    if (html) {
      clean = sanitizeHtml(html);
    } else if (getSelectionCell()) {
      clean = text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
    } else {
      clean = plainTextToHtml(text);
    }
    document.execCommand("insertHTML", false, clean);
    emit();
  }

  function handleBlur() {
    const el = editorRef.current;
    if (!el) return;
    const clean = sanitizeHtml(el.innerHTML);
    if (el.innerHTML !== clean) el.innerHTML = clean;
    lastHtmlRef.current = clean;
    onChange(clean);
    syncCell();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] focus-within:border-[var(--accent-cyan)]/40 transition-colors">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--glass-border)] bg-white/3 px-3 py-2">

        {/* Formatting */}
        <Btn title="Bold (Ctrl+B)"      onClick={() => cmd("bold")}>Bold</Btn>
        <Btn title="Italic (Ctrl+I)"    onClick={() => cmd("italic")}><em>Italic</em></Btn>
        <Btn title="Underline (Ctrl+U)" onClick={() => cmd("underline")}>Underline</Btn>
        <Btn title="Heading"            onClick={() => cmd("formatBlock", "h3")}>Heading</Btn>
        <Btn title="Paragraph"          onClick={() => cmd("formatBlock", "p")}>Paragraph</Btn>
        <Btn title="Bulleted list"      onClick={() => cmd("insertUnorderedList")}>• List</Btn>
        <Btn title="Numbered list"      onClick={() => cmd("insertOrderedList")}>1. List</Btn>

        {/* Undo / Redo */}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--glass-border)]" />
        <Btn title="Undo (Ctrl+Z)" onClick={() => cmd("undo")}>↩ Undo</Btn>
        <Btn title="Redo (Ctrl+Y)" onClick={() => cmd("redo")}>↪ Redo</Btn>

        {/* Indent / Outdent / HR */}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--glass-border)]" />
        <Btn title="Indent"          onClick={() => cmd("indent")}>→ Indent</Btn>
        <Btn title="Outdent"         onClick={() => cmd("outdent")}>← Outdent</Btn>
        <Btn title="Horizontal rule" onClick={() => cmd("insertHorizontalRule")}>─ HR</Btn>

        {/* Font size + family — select text first, then choose */}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--glass-border)]" />
        <ToolbarSelect
          placeholder="Size"
          options={FONT_SIZES}
          onSaveSelection={saveSelection}
          onApply={(v) => applyInlineStyle("fontSize", v)}
        />
        <ToolbarSelect
          placeholder="Font"
          options={FONT_FAMILIES}
          onSaveSelection={saveSelection}
          onApply={(v) => applyInlineStyle("fontFamily", v)}
        />

        {/* Text color + highlight */}
        <ColorSelect
          placeholder="Color"
          options={TEXT_COLORS}
          onSaveSelection={saveSelection}
          onApply={(v) => applyInlineStyle("color", v)}
        />
        <ColorSelect
          placeholder="Highlight"
          options={HIGHLIGHT_COLORS}
          onSaveSelection={saveSelection}
          onApply={(v) => applyInlineStyle("backgroundColor", v)}
        />

        {/* Text alignment — persists via sanitizer text-align allowance */}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--glass-border)]" />
        <Btn title="Align left"   onClick={() => cmd("justifyLeft")}>L</Btn>
        <Btn title="Align center" onClick={() => cmd("justifyCenter")}>C</Btn>
        <Btn title="Align right"  onClick={() => cmd("justifyRight")}>R</Btn>

        {/* Table inserts */}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--glass-border)]" />
        <Btn title="Insert blank table" onClick={() => cmd("insertHTML", buildTable(["Label", "Details"]))}>
          Table
        </Btn>
        {TABLE_BLOCKS.map((block) => (
          <Btn key={block.id} title={`Insert ${block.label} table`} onClick={() => insertTable(block.cols)}>
            {block.label}
          </Btn>
        ))}

        {/* Table row/col + merge controls — only active when cursor is inside a cell */}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--glass-border)]" />
        <TableBtn title="Add row below"    disabled={disabled || !hasCell} onClick={addRowBelow}>+Row↓</TableBtn>
        <TableBtn title="Add row above"    disabled={disabled || !hasCell} onClick={addRowAbove}>+Row↑</TableBtn>
        <TableBtn title="Delete row"       disabled={disabled || !hasCell} onClick={deleteCurrentRow}>−Row</TableBtn>
        <TableBtn title="Add column right" disabled={disabled || !hasCell} onClick={addColumnRight}>+Col→</TableBtn>
        <TableBtn title="Add column left"  disabled={disabled || !hasCell} onClick={addColumnLeft}>+Col←</TableBtn>
        <TableBtn title="Delete column"    disabled={disabled || !hasCell} onClick={deleteCurrentColumn}>−Col</TableBtn>
        <TableBtn
          title="Merge with cell to the right (increases colspan)"
          disabled={disabled || !hasMergeRight}
          onClick={mergeRight}
        >
          Merge→
        </TableBtn>
        <TableBtn
          title="Merge with cell below (increases rowspan)"
          disabled={disabled || !hasMergeDown}
          onClick={mergeDown}
        >
          Merge↓
        </TableBtn>
      </div>

      {/* Editable area */}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onKeyUp={syncCell}
        onMouseUp={syncCell}
        onClick={syncCell}
        onPaste={handlePaste}
        onBlur={handleBlur}
        onFocus={syncCell}
        data-placeholder={placeholder}
        className="rich-text-editor min-h-[180px] overflow-x-auto px-4 py-3 text-sm leading-relaxed text-zinc-200 outline-none"
      />
    </div>
  );
}
