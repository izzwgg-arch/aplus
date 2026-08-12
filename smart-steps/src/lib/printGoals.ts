import { escapeHtml } from "@/lib/sanitizeHtml";

/**
 * Client-side Goals & Targets → PDF export.
 *
 * Uses the same print-window approach as the note/report exporters. Reads goal
 * data (fetched fresh from `/api/clients/[clientId]/goals`) and renders a
 * clinical-documentation table. Nothing is mutated.
 *
 * `statusFilter`:
 *   - "IN_TREATMENT": only targets whose phase === "ACQUISITION" (the app's
 *     "In Treatment" lifecycle state) — parent goals with no matching target
 *     are omitted.
 *   - "ALL": every target returned by the API (already excludes archived goals
 *     and inactive targets server-side).
 */

const LETTERHEAD_TOP_SRC = "/smart-steps/letterhead/smart-steps-top.png";

export type GoalStatusFilter = "IN_TREATMENT" | "ALL";

type MasteryRule = {
  percentage?: number | null;
  minTrialsPerSession?: number | null;
  requiredPrompts?: string | null;
} | null;

export type PrintableTarget = {
  id: string;
  definition: string;
  targetType: string;
  phase: string;
  masteryRule?: MasteryRule;
  promptHierarchy?: string[];
  baseline?: string | null;
  subGoalTitle?: string | null;
};

export type PrintableGoal = {
  id: string;
  title: string;
  domain?: string | null;
  programName?: string | null;
  targets: PrintableTarget[];
};

const PHASE_LABEL: Record<string, string> = {
  NEW: "New",
  ACQUISITION: "In Treatment",
  MASTERED: "Mastered",
  BASELINE: "Baseline",
  MAINTENANCE: "Maintenance",
  GENERALIZATION: "Generalization",
};

function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase;
}

function statusBadgeClass(phase: string): string {
  if (phase === "MASTERED") return "status-mastered";
  if (phase === "NEW") return "status-new";
  if (phase === "ACQUISITION" || phase === "BASELINE") return "status-treatment";
  return "status-neutral";
}

function masteryText(target: PrintableTarget): string {
  const rule = target.masteryRule;
  if (!rule) return "—";
  const parts: string[] = [];
  if (typeof rule.percentage === "number") parts.push(`${rule.percentage}%`);
  if (typeof rule.minTrialsPerSession === "number") parts.push(`over ${rule.minTrialsPerSession} trials`);
  return parts.length ? parts.join(" ") : "—";
}

function promptText(target: PrintableTarget): string {
  if (target.masteryRule?.requiredPrompts) return target.masteryRule.requiredPrompts;
  if (target.promptHierarchy && target.promptHierarchy.length) {
    return target.promptHierarchy.map((p) => p.replace(/_/g, " ")).join(", ");
  }
  return "—";
}

function targetRow(target: PrintableTarget): string {
  const goalName = target.subGoalTitle
    ? `${escapeHtml(target.subGoalTitle)} — ${escapeHtml(target.definition)}`
    : escapeHtml(target.definition);
  return `
    <tr>
      <td class="goal-cell">${goalName}</td>
      <td>${escapeHtml(target.targetType.replace(/_/g, " "))}</td>
      <td>${escapeHtml(promptText(target))}</td>
      <td>${escapeHtml(masteryText(target))}</td>
      <td><span class="status-badge ${statusBadgeClass(target.phase)}">${escapeHtml(phaseLabel(target.phase))}</span></td>
    </tr>`;
}

function goalSection(goal: PrintableGoal): string {
  const subtitle = goal.programName || goal.domain;
  return `
  <section class="goal-group">
    <div class="goal-heading">
      <h2>${escapeHtml(goal.title)}</h2>
      ${subtitle ? `<span class="goal-domain">${escapeHtml(subtitle)}</span>` : ""}
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:34%">Goal / Target</th>
          <th style="width:16%">Type</th>
          <th style="width:20%">Prompt Level</th>
          <th style="width:16%">Mastery Criteria</th>
          <th style="width:14%">Status</th>
        </tr>
      </thead>
      <tbody>
        ${goal.targets.map(targetRow).join("")}
      </tbody>
    </table>
  </section>`;
}

/**
 * Opens a print window with a Goals & Targets summary and triggers the browser
 * print dialog. Returns `false` if the pop-up was blocked.
 */
export function printGoals(
  goals: PrintableGoal[],
  clientName: string,
  statusFilter: GoalStatusFilter,
): boolean {
  const filtered = goals
    .map((goal) => ({
      ...goal,
      targets: statusFilter === "IN_TREATMENT"
        ? goal.targets.filter((t) => t.phase === "ACQUISITION")
        : goal.targets,
    }))
    .filter((goal) => goal.targets.length > 0);

  const win = window.open("", "_blank");
  if (!win) return false;

  const filterLabel = statusFilter === "IN_TREATMENT" ? "In Treatment" : "All Statuses";
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const totalTargets = filtered.reduce((sum, g) => sum + g.targets.length, 0);

  const bodyHtml = filtered.length
    ? filtered.map(goalSection).join("")
    : `<p class="empty">No goals match the selected filter (${escapeHtml(filterLabel)}).</p>`;

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Goals & Targets — ${escapeHtml(clientName)}</title>
  <style>
    @page { size: letter; margin: 0.7in 0.75in; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0b2f5b;
      --teal: #15948d;
      --line: #dfe7ed;
      --line-strong: #cdd8e0;
      --text: #162238;
      --muted: #5b6978;
    }
    body {
      font-family: "Aptos", "Segoe UI", Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.45;
      color: var(--text);
      background: #fff;
    }
    header.doc-header {
      display: flex;
      align-items: center;
      gap: 14pt;
      border-bottom: 2px solid var(--navy);
      padding-bottom: 10pt;
      margin-bottom: 6pt;
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
    .doc-title h1 { color: var(--navy); font-size: 16pt; margin-top: 2pt; }
    .doc-sub { color: var(--muted); font-size: 8.5pt; margin-bottom: 14pt; }
    .goal-group { margin-bottom: 15pt; page-break-inside: auto; }
    .goal-heading {
      display: flex;
      align-items: baseline;
      gap: 8pt;
      margin-bottom: 5pt;
      page-break-after: avoid;
    }
    .goal-heading h2 { color: var(--navy); font-size: 11pt; }
    .goal-domain {
      color: var(--teal);
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid var(--line);
      border-radius: 4pt;
      overflow: hidden;
      font-size: 8pt;
    }
    thead { display: table-header-group; }
    th, td {
      border-bottom: 1px solid #e7edf2;
      padding: 5pt 7pt;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f4f8fa;
      color: var(--navy);
      font-size: 6.6pt;
      font-weight: 850;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-bottom: 1.4px solid var(--line-strong);
    }
    tbody tr:nth-child(even) td { background: #f9fbfc; }
    tr { page-break-inside: avoid; }
    tr:last-child td { border-bottom: 0; }
    .goal-cell { font-weight: 650; color: var(--navy); }
    .status-badge {
      display: inline-flex;
      border-radius: 999px;
      padding: 2pt 6pt;
      font-size: 6.2pt;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .status-new { background: #fff6d9; color: #796129; }
    .status-treatment { background: #dff3ef; color: #08736c; }
    .status-mastered { background: #e9f6ee; color: #216b3f; }
    .status-neutral { background: #eef3f7; color: var(--muted); }
    .empty { color: var(--muted); font-style: italic; padding: 20pt 0; text-align: center; }
    @media print {
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <header class="doc-header">
    <img class="letterhead" src="${LETTERHEAD_TOP_SRC}" alt="">
    <div class="doc-title">
      <span class="doc-kind">Goals &amp; Targets</span>
      <h1>${escapeHtml(clientName)}</h1>
    </div>
  </header>
  <p class="doc-sub">Filter: ${escapeHtml(filterLabel)} · ${totalTargets} target${totalTargets !== 1 ? "s" : ""} · Generated ${escapeHtml(generated)}</p>
  ${bodyHtml}
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
