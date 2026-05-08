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

// ── Component ─────────────────────────────────────────────────────────────────

export default function RichTextEditor({ value, onChange, disabled = false, placeholder }: Props) {
  const editorRef       = useRef<HTMLDivElement>(null);
  const lastHtmlRef     = useRef("");
  const activeCellRef   = useRef<HTMLTableCellElement | null>(null);
  const prevCellRef     = useRef<HTMLTableCellElement | null>(null);
  const [hasCell, setHasCell] = useState(false);

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
    // Update DOM class for active-cell highlight (class is stripped by sanitizer on save)
    if (prevCellRef.current !== next) {
      prevCellRef.current?.classList.remove("rte-active-cell");
      next?.classList.add("rte-active-cell");
      prevCellRef.current = next;
    }
    activeCellRef.current = next;
    setHasCell(Boolean(next));
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
    // Update active-cell highlight
    prevCellRef.current?.classList.remove("rte-active-cell");
    cell.classList.add("rte-active-cell");
    prevCellRef.current = cell;
    activeCellRef.current = cell;
    setHasCell(true);
    editorRef.current?.focus();
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
    row.parentNode!.insertBefore(newRow, row); // before current row, not after
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
      // Insert before the cell currently at insertIdx (or append if at end)
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
    const insertIdx = cell.cellIndex; // insert AT current index — pushes current cell right
    Array.from(table.rows).forEach((row) => {
      const ref  = insertIdx < row.cells.length ? row.cells[insertIdx] : null;
      const tag  = row.parentElement?.tagName === "THEAD" ? "th" : "td";
      const next = document.createElement(tag) as HTMLTableCellElement;
      next.innerHTML = "<br>";
      row.insertBefore(next, ref);
    });
    emit();
    // New cell lands at insertIdx; current cell shifted to insertIdx+1
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
      // Inside a table cell: use <br> for line breaks instead of wrapping in <p> blocks
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
        <Btn title="Bold"           onClick={() => cmd("bold")}>Bold</Btn>
        <Btn title="Underline"      onClick={() => cmd("underline")}>Underline</Btn>
        <Btn title="Heading"        onClick={() => cmd("formatBlock", "h3")}>Heading</Btn>
        <Btn title="Paragraph"      onClick={() => cmd("formatBlock", "p")}>Paragraph</Btn>
        <Btn title="Bulleted list"  onClick={() => cmd("insertUnorderedList")}>• List</Btn>
        <Btn title="Numbered list"  onClick={() => cmd("insertOrderedList")}>1. List</Btn>

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

        {/* Table row/col controls — only active when cursor is inside a cell */}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--glass-border)]" />
        <TableBtn title="Add row below" disabled={disabled || !hasCell} onClick={addRowBelow}>+Row↓</TableBtn>
        <TableBtn title="Add row above" disabled={disabled || !hasCell} onClick={addRowAbove}>+Row↑</TableBtn>
        <TableBtn title="Delete row"    disabled={disabled || !hasCell} onClick={deleteCurrentRow}>−Row</TableBtn>
        <TableBtn title="Add column right" disabled={disabled || !hasCell} onClick={addColumnRight}>+Col→</TableBtn>
        <TableBtn title="Add column left"  disabled={disabled || !hasCell} onClick={addColumnLeft}>+Col←</TableBtn>
        <TableBtn title="Delete column"    disabled={disabled || !hasCell} onClick={deleteCurrentColumn}>−Col</TableBtn>
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
