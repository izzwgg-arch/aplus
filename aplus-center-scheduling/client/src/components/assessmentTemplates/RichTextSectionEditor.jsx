import { useEffect, useRef, useState } from "react";
import { plainTextToHtml, sanitizeRichTextHtml } from "../../lib/richTextSanitizer";

function ToolbarButton({ children, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
    >
      {children}
    </button>
  );
}

function TableButton({ children, onClick, title, disabled }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}

const DEFAULT_TABLE_BLOCKS = [
  {
    id: "mastered-goals",
    label: "Mastered Goals table",
    columns: ["Category", "Goal / Operational Definition", "Date Mastered"]
  },
  {
    id: "current-goals",
    label: "Current Goals table",
    columns: ["Behavior", "Objective / Operational Definition", "Start Date", "Baseline Level", "Current Level"]
  },
  {
    id: "parent-goals",
    label: "Parent Goals table",
    columns: ["Behavior", "Objective", "Introduction Date", "Baseline Level", "Current Level", "Carrying Over?", "Comments"]
  },
  {
    id: "treatment-recommendations",
    label: "Treatment Recommendation table",
    columns: ["Service", "# Hrs Presently Receiving", "Recommendation", "Rationale"]
  },
  {
    id: "schedule",
    label: "Schedule table",
    columns: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  }
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildTableHtml(columns) {
  const headers = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const cells = columns.map(() => "<td><br></td>").join("");
  return `<table><thead><tr>${headers}</tr></thead><tbody><tr>${cells}</tr></tbody></table><p><br></p>`;
}

export default function RichTextSectionEditor({ value, onChange, disabled = false, placeholder }) {
  const editorRef = useRef(null);
  const lastHtmlRef = useRef("");
  const activeCellRef = useRef(null);
  const [hasActiveCell, setHasActiveCell] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const cleanValue = sanitizeRichTextHtml(value || "");
    if (cleanValue !== lastHtmlRef.current && editor.innerHTML !== cleanValue) {
      editor.innerHTML = cleanValue;
      lastHtmlRef.current = cleanValue;
    }
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const cleanHtml = sanitizeRichTextHtml(editor.innerHTML);
    lastHtmlRef.current = cleanHtml;
    onChange(cleanHtml);
  };

  const getSelectionCell = () => {
    const editor = editorRef.current;
    const selection = window.getSelection?.();
    if (!editor || !selection || selection.rangeCount === 0) return null;

    let node = selection.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches?.("td, th")) return node;
      node = node.parentElement;
    }
    return null;
  };

  const updateActiveCell = () => {
    const editor = editorRef.current;
    const selectedCell = getSelectionCell();
    const nextCell = selectedCell && editor?.contains(selectedCell) ? selectedCell : null;
    activeCellRef.current = nextCell;
    setHasActiveCell(Boolean(nextCell));
  };

  const getActiveCell = () => {
    const editor = editorRef.current;
    const current = activeCellRef.current;
    if (current && editor?.contains(current)) return current;
    const selectedCell = getSelectionCell();
    activeCellRef.current = selectedCell;
    setHasActiveCell(Boolean(selectedCell));
    return selectedCell;
  };

  const runCommand = (command, argument = null) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    emitChange();
  };

  const insertTable = () => {
    runCommand("insertHTML", buildTableHtml(["Label", "Details"]));
  };

  const insertDefaultTable = (blockId) => {
    const block = DEFAULT_TABLE_BLOCKS.find((item) => item.id === blockId);
    if (!block) return;
    runCommand("insertHTML", buildTableHtml(block.columns));
  };

  const focusCell = (cell) => {
    if (!cell) return;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    activeCellRef.current = cell;
    setHasActiveCell(true);
    editorRef.current?.focus();
  };

  const addRowBelow = () => {
    if (disabled) return;
    const cell = getActiveCell();
    const row = cell?.parentElement;
    if (!cell || !row) return;
    const newRow = row.cloneNode(false);
    Array.from(row.cells).forEach((sourceCell) => {
      const nextCell = document.createElement(sourceCell.tagName.toLowerCase());
      if (sourceCell.colSpan > 1) nextCell.setAttribute("colspan", String(sourceCell.colSpan));
      if (sourceCell.rowSpan > 1) nextCell.setAttribute("rowspan", String(sourceCell.rowSpan));
      nextCell.innerHTML = "<br>";
      newRow.appendChild(nextCell);
    });
    row.parentNode.insertBefore(newRow, row.nextSibling);
    emitChange();
    focusCell(newRow.cells[Math.min(cell.cellIndex, newRow.cells.length - 1)]);
  };

  const deleteCurrentRow = () => {
    if (disabled) return;
    const cell = getActiveCell();
    const row = cell?.parentElement;
    const table = row?.closest("table");
    if (!cell || !row || !table) return;
    const rows = Array.from(table.rows);
    if (rows.length <= 1) {
      table.remove();
      emitChange();
      activeCellRef.current = null;
      setHasActiveCell(false);
      editorRef.current?.focus();
      return;
    }
    const nextRow = rows[rows.indexOf(row) + 1] || rows[rows.indexOf(row) - 1];
    const nextCell = nextRow?.cells[Math.min(cell.cellIndex, nextRow.cells.length - 1)];
    row.remove();
    emitChange();
    focusCell(nextCell);
  };

  const addColumnRight = () => {
    if (disabled) return;
    const cell = getActiveCell();
    const table = cell?.closest("table");
    if (!cell || !table) return;
    const insertIndex = cell.cellIndex + 1;
    Array.from(table.rows).forEach((row) => {
      const referenceCell = row.cells[Math.min(insertIndex, row.cells.length - 1)];
      const tagName = row.parentElement?.tagName === "THEAD" ? "th" : "td";
      const nextCell = document.createElement(tagName);
      nextCell.innerHTML = "<br>";
      row.insertBefore(nextCell, referenceCell?.nextSibling || null);
    });
    emitChange();
    focusCell(cell.parentElement?.cells[insertIndex]);
  };

  const deleteCurrentColumn = () => {
    if (disabled) return;
    const cell = getActiveCell();
    const table = cell?.closest("table");
    if (!cell || !table) return;
    const removeIndex = cell.cellIndex;
    const maxCells = Math.max(...Array.from(table.rows).map((row) => row.cells.length));
    if (maxCells <= 1) {
      table.remove();
      emitChange();
      activeCellRef.current = null;
      setHasActiveCell(false);
      editorRef.current?.focus();
      return;
    }
    let nextCell = null;
    Array.from(table.rows).forEach((row) => {
      const target = row.cells[removeIndex];
      if (!nextCell) nextCell = row.cells[removeIndex + 1] || row.cells[removeIndex - 1] || null;
      target?.remove();
    });
    emitChange();
    focusCell(nextCell);
  };

  const handlePaste = (event) => {
    if (disabled) return;
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const cleanHtml = html ? sanitizeRichTextHtml(html) : plainTextToHtml(text);
    document.execCommand("insertHTML", false, cleanHtml);
    emitChange();
  };

  const handleBlur = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const cleanHtml = sanitizeRichTextHtml(editor.innerHTML);
    if (editor.innerHTML !== cleanHtml) editor.innerHTML = cleanHtml;
    lastHtmlRef.current = cleanHtml;
    onChange(cleanHtml);
    updateActiveCell();
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <ToolbarButton title="Bold" onClick={() => runCommand("bold")}>Bold</ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => runCommand("underline")}>Underline</ToolbarButton>
        <ToolbarButton title="Heading" onClick={() => runCommand("formatBlock", "h3")}>Heading</ToolbarButton>
        <ToolbarButton title="Paragraph" onClick={() => runCommand("formatBlock", "p")}>Paragraph</ToolbarButton>
        <ToolbarButton title="Bulleted list" onClick={() => runCommand("insertUnorderedList")}>Bullets</ToolbarButton>
        <ToolbarButton title="Numbered list" onClick={() => runCommand("insertOrderedList")}>Numbers</ToolbarButton>
        <ToolbarButton title="Insert table" onClick={insertTable}>Table</ToolbarButton>
        {DEFAULT_TABLE_BLOCKS.map((block) => (
          <ToolbarButton key={block.id} title={block.label} onClick={() => insertDefaultTable(block.id)}>
            {block.label.replace(" table", "")}
          </ToolbarButton>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <TableButton title="Add row below current row" disabled={disabled || !hasActiveCell} onClick={addRowBelow}>Add row</TableButton>
        <TableButton title="Delete current row" disabled={disabled || !hasActiveCell} onClick={deleteCurrentRow}>Delete row</TableButton>
        <TableButton title="Add column right of current column" disabled={disabled || !hasActiveCell} onClick={addColumnRight}>Add column</TableButton>
        <TableButton title="Delete current column" disabled={disabled || !hasActiveCell} onClick={deleteCurrentColumn}>Delete column</TableButton>
      </div>

      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emitChange}
        onKeyUp={updateActiveCell}
        onMouseUp={updateActiveCell}
        onClick={updateActiveCell}
        onPaste={handlePaste}
        onBlur={handleBlur}
        onFocus={updateActiveCell}
        data-placeholder={placeholder}
        className="rich-text-editor min-h-[180px] px-4 py-3 text-sm leading-relaxed text-slate-800 outline-none empty:before:text-slate-400"
      />
    </div>
  );
}
