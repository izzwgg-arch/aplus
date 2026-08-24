/**
 * Inserting a goal row into one of the assessment report's goal tables.
 *
 * The report editor stores each section as HTML, and its goal tables are
 * produced by the builders in `reportGenerationUtils.ts`. When a goal is picked
 * from the Goal Library on an assessment, the row has to land in the right
 * table, in the right columns, under the right category heading — regardless of
 * which template built the table or how the BCBA has since edited it.
 *
 * So nothing here hard-codes a column order. Columns are read from the table's
 * own `<thead>` and matched by NAME, which is what keeps this working when a
 * template renames or reorders a column.
 *
 * Browser-only: `insertGoalRow` uses DOMParser. `goalTableKind` is pure.
 */

import { escapeHtml } from "./sanitizeHtml";
import { detectSectionType } from "./reportGenerationUtils";

/** The section kinds whose generated content is a goal TABLE (not prose). */
export type GoalTableKind = "mastered_goals" | "current_goals" | "new_goals" | "parent_goals";

const GOAL_TABLE_KINDS = new Set<string>([
  "mastered_goals",
  "current_goals",
  "new_goals",
  "parent_goals",
]);

/**
 * Which goal table (if any) a section title maps to. Delegates to
 * `detectSectionType` so section naming stays governed by that one function —
 * renaming a template section changes both generation and this picker together.
 */
export function goalTableKind(title: string): GoalTableKind | null {
  const kind = detectSectionType(title).kind;
  return GOAL_TABLE_KINDS.has(kind) ? (kind as GoalTableKind) : null;
}

/**
 * Which goal table a section's CONTENT already holds, judged from the column
 * headings alone.
 *
 * Templates in the wild do not keep the generated section names — a live
 * template carries "7. Parent / Guardian Involvement", "Language &
 * Communication -Summary" and bare "New Section" headings — so a title-only
 * test would leave a real goal table with no way to add a goal to it. Regex,
 * not DOM, so this is safe to call while rendering on either side.
 */
export function inferGoalTableKind(html: string): GoalTableKind | null {
  const headings = Array.from((html ?? "").matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi))
    .map((m) => m[1].replace(/<[^>]*>/g, " ").toLowerCase());
  if (headings.length === 0) return null;
  if (headings.some((h) => /date\s*mastered|mastery\s*date/.test(h))) return "mastered_goals";
  if (headings.some((h) => /carrying\s*over/.test(h))) return "parent_goals";
  if (headings.some((h) => /operational\s*definition|objective/.test(h))) return "current_goals";
  return null;
}

/** Columns used when a goal-table section has no table yet. */
const DEFAULT_COLUMNS: Record<GoalTableKind, string[]> = {
  mastered_goals: ["Category", "Goal/Operational Definition", "Date Mastered"],
  current_goals: [
    "Behavior",
    "Objective/ Operational Definition",
    "Start Date",
    "Baseline Level",
    "Current level",
  ],
  new_goals: ["Behavior / Goal", "Objective", "Baseline", "Introduced"],
  parent_goals: [
    "Behavior",
    "Objective",
    "Introduction Date",
    "Baseline Level",
    "Current level",
    "Carrying Over? (Y/N)",
    "Comments",
  ],
};

export interface GoalRow {
  /** Skill area — the "Behavior" / "Category" column. */
  skillArea: string;
  /** Goal definition — the "Objective / Operational Definition" column. */
  objective: string;
  startDate?: string;
  baseline?: string;
  currentLevel?: string;
  dateMastered?: string;
  comments?: string;
  /** Fixed-category heading to file the row under, e.g. "LANGUAGE & COMMUNICATION". */
  categoryLabel?: string;
}

/**
 * Resolves one cell from a column heading. Order matters: "Goal/Operational
 * Definition" must read as the objective, while a bare "Behavior / Goal" is the
 * skill-area column — so the definition/objective test runs before the
 * catch-all that treats "goal" as a label column.
 */
function cellFor(header: string, row: GoalRow): string {
  const h = header.toLowerCase();
  if (/operational\s*definition|objective/.test(h)) return row.objective;
  if (/date\s*mastered|mastery\s*date/.test(h)) return row.dateMastered ?? "";
  if (/start\s*date|introduction\s*date|introduced|opened|date/.test(h)) return row.startDate ?? "";
  if (/baseline/.test(h)) return row.baseline ?? "";
  if (/current/.test(h)) return row.currentLevel ?? "";
  if (/carrying\s*over/.test(h)) return "";
  if (/comment|note/.test(h)) return row.comments ?? "";
  if (/category|behavior|skill|goal|domain|area/.test(h)) return row.skillArea;
  return "";
}

/** Normalises a heading for comparison: "SOCIAL/EMOTIONAL" ~ "Social & Emotional". */
function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A full-width heading row, e.g. the category banner or "NEW GOALS – …". */
function isHeadingRow(tr: HTMLTableRowElement): boolean {
  const cells = Array.from(tr.cells);
  return cells.length === 1 && (cells[0].colSpan || 1) > 1;
}

/** Sub-headings that belong to the category group above them, not to a new one. */
function isSubHeadingRow(tr: HTMLTableRowElement): boolean {
  return isHeadingRow(tr) && /^new\s+goals/i.test(tr.textContent?.trim() ?? "");
}

function headersOf(table: HTMLTableElement): string[] {
  const headRow =
    table.tHead?.rows[0] ??
    Array.from(table.rows).find((r) => Array.from(r.cells).some((c) => c.tagName === "TH"));
  if (headRow) return Array.from(headRow.cells).map((c) => c.textContent?.trim() ?? "");

  // No header row at all — fall back to the widest body row's column count.
  const widest = Array.from(table.rows).reduce(
    (max, r) => Math.max(max, Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0)),
    0,
  );
  return Array.from({ length: widest }, () => "");
}

/** A table is a goal table when it has an objective/definition or mastery column. */
function looksLikeGoalTable(table: HTMLTableElement): boolean {
  return headersOf(table).some((h) =>
    /operational\s*definition|objective|date\s*mastered/i.test(h),
  );
}

function buildCellsHtml(headers: string[], row: GoalRow): string {
  return headers.map((h) => `<td>${escapeHtml(cellFor(h, row))}</td>`).join("");
}

function buildTableHtml(kind: GoalTableKind, row: GoalRow): string {
  const headers = DEFAULT_COLUMNS[kind];
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const groupRow = row.categoryLabel
    ? `<tr><td colspan="${headers.length}" style="text-align:center"><strong>${escapeHtml(
        row.categoryLabel,
      )}</strong></td></tr>`
    : "";
  return (
    `<table><thead><tr>${head}</tr></thead><tbody>` +
    groupRow +
    `<tr>${buildCellsHtml(headers, row)}</tr>` +
    `</tbody></table>`
  );
}

/**
 * Appends `row` to the goal table in `html` and returns the new section HTML.
 *
 * When the table groups rows under category banners, the row is filed at the
 * end of the matching group rather than at the bottom of the table — a goal
 * dropped below the wrong heading reads as belonging to the wrong domain.
 * "NEW GOALS – …" banners are treated as part of the group above them.
 * With no table present, one is created with this section's standard columns.
 */
export function insertGoalRow(html: string, kind: GoalTableKind, row: GoalRow): string {
  const doc = new DOMParser().parseFromString(`<div id="rgt-root">${html ?? ""}</div>`, "text/html");
  const root = doc.getElementById("rgt-root");
  if (!root) return html ?? "";

  const tables = Array.from(root.querySelectorAll("table"));
  const table =
    [...tables].reverse().find(looksLikeGoalTable) ?? tables[tables.length - 1] ?? null;

  if (!table) {
    const trimmed = (html ?? "").trim();
    return trimmed ? `${trimmed}\n${buildTableHtml(kind, row)}` : buildTableHtml(kind, row);
  }

  const headers = headersOf(table);
  const body = table.tBodies[0] ?? table.createTBody();
  const rows = Array.from(body.rows);

  const tr = doc.createElement("tr");
  tr.innerHTML = buildCellsHtml(headers, row);

  // Locate the end of the matching category group, if there is one.
  let insertBefore: HTMLTableRowElement | null = null;
  const wanted = row.categoryLabel ? normalizeLabel(row.categoryLabel) : "";
  if (wanted) {
    const startIdx = rows.findIndex(
      (r) =>
        isHeadingRow(r) &&
        !isSubHeadingRow(r) &&
        normalizeLabel(r.textContent ?? "") === wanted,
    );
    if (startIdx >= 0) {
      for (let i = startIdx + 1; i < rows.length; i++) {
        if (isHeadingRow(rows[i]) && !isSubHeadingRow(rows[i])) {
          insertBefore = rows[i];
          break;
        }
      }
    }
  }

  if (insertBefore) body.insertBefore(tr, insertBefore);
  else body.appendChild(tr);

  return root.innerHTML;
}
