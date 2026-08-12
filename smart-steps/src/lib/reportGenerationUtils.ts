/**
 * Helpers for auto-generating clinical report section content.
 * Server-side only — no "use client" directive.
 * All HTML produced here must pass through sanitizeHtml() before being stored.
 *
 * Behavior: builders REPLACE section content (Option B1).
 * Passthrough sections receive only placeholder substitution.
 */

import { escapeHtml, formatDate } from "./sanitizeHtml";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssessmentType = "initial" | "reassessment";

export interface TrialStats {
  correct: number;
  total: number;
}

export interface ReportClient {
  id: string;
  name: string;
  dob: Date;
  address?: string | null;
  diagnosis: string[];
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  school?: string | null;
  insuranceId?: string | null;
  intakeNotes?: string | null;
}

export interface ReportBcba {
  name: string;
  email: string;
  phone?: string | null;
  credentials?: string | null;
  role: string;
}

/** @deprecated Use ReportBcba. Kept for backward compatibility. */
export type ReportProvider = ReportBcba;

export interface ServicePeriod {
  start?: string;
  end?: string;
}

export interface ReportProgram {
  id: string;
  name: string;
  domain: string;
}

export interface ReportTarget {
  id: string;
  definition: string;
  phase: string;
  targetType: string;
  baseline?: string | null;
  dateMastered?: Date | null;
  notes?: string | null;
  createdAt?: Date | string | null;
  /** Raw JSON from Target.masteryRule — may contain openedDate, masteredDate, etc. */
  masteryRule?: unknown;
}

export interface ReportParentGoal {
  id: string;
  title: string;
  description?: string | null;
  domain?: string | null;
  status: string;
  programId?: string | null;
  notes?: string | null;
  createdAt?: Date | string | null;
  program?: { id: string; name: string; domain: string } | null;
  targets: ReportTarget[];
}

// ── Section-type detection ────────────────────────────────────────────────────

export type SectionType =
  | { kind: "provider_info" }
  | { kind: "biopsychosocial" }
  | { kind: "why_aba" }
  | { kind: "category_goals"; keywords: string[] }
  | { kind: "mastered_goals" }
  | { kind: "current_goals" }
  | { kind: "parent_goals" }
  | { kind: "new_goals" }
  | { kind: "passthrough" };

/**
 * Maps a section title to a structured type that drives auto-population.
 * Keyword-based, case-insensitive. mastered_goals checked before current_goals.
 */
export function detectSectionType(title: string): SectionType {
  const t = title.toLowerCase();

  if (/service\s+period|provider\s+info/.test(t))
    return { kind: "provider_info" };

  if (/biopsychosocial|biophysical/.test(t))
    return { kind: "biopsychosocial" };

  if (/why\s+(aba|services?\s+(are\s+)?needed)/.test(t))
    return { kind: "why_aba" };

  if (/mastered\s+goals?/.test(t))
    return { kind: "mastered_goals" };

  if (/parent\s+goals?/.test(t))
    return { kind: "parent_goals" };

  if (/new\s+goals?|upcoming\s+goals?/.test(t))
    return { kind: "new_goals" };

  if (/current\s+goals?|goals?\s+and\s+objectives|skill\s+acquisition/.test(t) && !/mastered/.test(t))
    return { kind: "current_goals" };

  if (/language|communication/.test(t))
    return { kind: "category_goals", keywords: ["language", "communication"] };

  if (/social/.test(t))
    return { kind: "category_goals", keywords: ["social", "emotional"] };

  if (/adaptive|daily\s+living|self.care/.test(t))
    return { kind: "category_goals", keywords: ["adaptive", "daily living", "self-care", "self care"] };

  if (/challenging\s+behav|behavior\s+reduc/.test(t))
    return { kind: "category_goals", keywords: ["behavior", "challenging", "reduction"] };

  if (/executive\s+function/.test(t))
    return { kind: "category_goals", keywords: ["executive"] };

  if (/fine\s+motor/.test(t))
    return { kind: "category_goals", keywords: ["fine motor", "motor"] };

  if (/gross\s+motor/.test(t))
    return { kind: "category_goals", keywords: ["gross motor"] };

  if (/academic|pre.academic/.test(t))
    return { kind: "category_goals", keywords: ["academic"] };

  if (/vocational/.test(t))
    return { kind: "category_goals", keywords: ["vocational"] };

  if (/manding|requesting/.test(t))
    return { kind: "category_goals", keywords: ["manding", "requesting"] };

  if (/tacting|labeling/.test(t))
    return { kind: "category_goals", keywords: ["tacting", "labeling"] };

  if (/intraverbal/.test(t))
    return { kind: "category_goals", keywords: ["intraverbal"] };

  return { kind: "passthrough" };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function computeAge(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Returns the first space-delimited token of a full name for use in narrative prose. */
function firstNameOnly(fullName: string): string {
  if (!fullName) return "The client";
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName;
}

function phaseLabel(phase: string): string {
  switch ((phase ?? "").toUpperCase()) {
    case "NEW":            return "New";
    case "ACQUISITION":    return "In Treatment";
    case "BASELINE":       return "Baseline";
    case "MASTERED":       return "Mastered";
    case "MAINTENANCE":    return "Maintenance";
    case "GENERALIZATION": return "Generalization";
    default:               return phase;
  }
}

/** Extracts Date Opened from masteryRule.openedDate, falls back to createdAt. */
function getTargetStartDate(t: ReportTarget): string {
  const mr = (t.masteryRule != null && typeof t.masteryRule === "object" && !Array.isArray(t.masteryRule))
    ? (t.masteryRule as Record<string, unknown>)
    : null;
  const openedDate = mr?.openedDate;
  if (openedDate && typeof openedDate === "string") return formatDate(openedDate);
  if (t.createdAt) {
    return formatDate(t.createdAt instanceof Date ? t.createdAt : new Date(String(t.createdAt)));
  }
  return "—";
}

function dateOrDash(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return formatDate(d instanceof Date ? d : new Date(String(d)));
}

/**
 * Computes current performance level from recent trial batch.
 * Returns percentage string like "78%" or "—" when no data.
 */
export function computeCurrentLevel(
  targetId: string,
  trialStats: Map<string, TrialStats>,
): string {
  const s = trialStats.get(targetId);
  if (!s || s.total === 0) return "—";
  return `${Math.round((s.correct / s.total) * 100)}%`;
}

/**
 * Computes progress percentage for table display.
 * Returns "X% (N trials)" or "—".
 */
export function computeProgressPct(
  targetId: string,
  trialStats: Map<string, TrialStats>,
): string {
  const s = trialStats.get(targetId);
  if (!s || s.total === 0) return "—";
  const pct = Math.round((s.correct / s.total) * 100);
  return `${pct}% (${s.total} trial${s.total !== 1 ? "s" : ""})`;
}

// ── Clinical paragraph generator ─────────────────────────────────────────────

/**
 * Generates a multi-sentence clinical narrative paragraph for a given category domain.
 * Covers: strengths, deficits, skill acquisition progress, mastered areas,
 * areas still needing intervention, current treatment focus, future direction,
 * behavioral trends, and clinical observations.
 *
 * Initial assessment: establishes baseline, current targets, future planning.
 * Reassessment: includes mastery progress, maintenance phase, updated targets.
 */
function buildCategoryParagraph(
  clientName: string,
  categoryName: string,
  goals: ReportParentGoal[],
  assessmentType: AssessmentType,
): string {
  const name      = firstNameOnly(clientName);
  const allTs     = goals.flatMap((g) => g.targets);
  const activeTs  = allTs.filter((t) => ["ACQUISITION", "BASELINE"].includes(t.phase));
  const newTs     = allTs.filter((t) => t.phase === "NEW");
  const masteredTs = allTs.filter((t) => t.phase === "MASTERED");
  const maintTs   = allTs.filter((t) => ["MAINTENANCE", "GENERALIZATION"].includes(t.phase));

  if (allTs.length === 0) {
    return `<p>No goals have been identified in the ${escapeHtml(categoryName)} domain at this time.</p>`;
  }

  const sentences: string[] = [];

  // ── Initial assessment ────────────────────────────────────────────────────
  if (assessmentType === "initial") {
    sentences.push(
      `${escapeHtml(name)}'s ${escapeHtml(categoryName)} skills were assessed as part of this initial comprehensive ABA evaluation to establish a clinical baseline for individualized treatment planning.`,
    );

    if (activeTs.length > 0) {
      const list = activeTs
        .map((t) => `<em>${escapeHtml(t.definition)}</em>`).join("; ");
      sentences.push(
        `Assessment findings indicate that ${escapeHtml(name)} presents with skill deficits in this domain that would benefit from structured behavioral programming. ` +
        `${activeTs.length} objective${activeTs.length !== 1 ? "s have" : " has"} been identified as priority targets for the current service period: ${list}. ` +
        `These represent areas of emerging skill development where systematic instruction, evidence-based prompting hierarchies, and consistent reinforcement across settings are indicated to support acquisition and functional generalization.`,
      );
    } else {
      sentences.push(
        `Assessment findings in the ${escapeHtml(categoryName)} domain indicate foundational skills are present, with specific objectives to be introduced as treatment progresses.`,
      );
    }

    if (newTs.length > 0) {
      const list = newTs.map((t) => `<em>${escapeHtml(t.definition)}</em>`).join("; ");
      sentences.push(
        `Additionally, ${newTs.length} upcoming objective${newTs.length !== 1 ? "s have" : " has"} been incorporated into the treatment plan as introductory targets: ${list}. ` +
        `These goals will be formally introduced as prerequisite foundational skills are established and ${escapeHtml(name)}'s readiness for new programming is confirmed by progress data.`,
      );
    }

    sentences.push(
      `ABA intervention in the ${escapeHtml(categoryName)} domain will employ direct instruction, naturalistic teaching strategies, incidental learning opportunities, and caregiver training to facilitate skill acquisition across home, school, and community settings. ` +
      `Ongoing data collection will inform clinical decision-making and ensure that programming remains responsive to ${escapeHtml(name)}'s rate of progress, individual learning profile, and functional needs.`,
    );

  // ── Reassessment ─────────────────────────────────────────────────────────
  } else {
    sentences.push(
      `${escapeHtml(name)}'s progress in the ${escapeHtml(categoryName)} domain has been reviewed and summarized as part of this reassessment period.`,
    );

    if (masteredTs.length > 0) {
      const list = masteredTs.map((t) => `<em>${escapeHtml(t.definition)}</em>`).join("; ");
      sentences.push(
        `${escapeHtml(name)} has demonstrated clinical mastery of ${masteredTs.length} objective${masteredTs.length !== 1 ? "s" : ""} in this domain during the current service period: ${list}. ` +
        `This progress reflects a positive response to ABA programming, effective implementation of behavioral strategies, and ${escapeHtml(name)}'s capacity for meaningful skill acquisition within a structured intervention framework.`,
      );
    } else {
      sentences.push(
        `${escapeHtml(name)} continues to receive targeted ABA intervention in the ${escapeHtml(categoryName)} domain, with measurable progress documented across the current service period. ` +
        `While formal mastery criteria have not yet been achieved for current targets, data indicate consistent skill-building that supports continued programming.`,
      );
    }

    if (maintTs.length > 0) {
      sentences.push(
        `${maintTs.length} previously mastered skill${maintTs.length !== 1 ? "s are" : " is"} currently in the maintenance and generalization phase, with ongoing data collection monitoring performance across novel settings, varied materials, and different communication partners. ` +
        `These skills are being tracked to ensure long-term retention, functional application, and carryover across natural environments.`,
      );
    }

    if (activeTs.length > 0) {
      const list = activeTs.map((t) => `<em>${escapeHtml(t.definition)}</em>`).join("; ");
      sentences.push(
        `${activeTs.length} objective${activeTs.length !== 1 ? "s remain" : " remains"} in active treatment: ${list}. ` +
        `These targets represent areas of continued need where ${escapeHtml(name)} demonstrates emerging but inconsistent performance, requiring structured instruction, systematic prompting, and differential reinforcement to support independent, reliable skill demonstration.`,
      );
    }

    if (newTs.length > 0) {
      const list = newTs.map((t) => `<em>${escapeHtml(t.definition)}</em>`).join("; ");
      sentences.push(
        `${newTs.length} new objective${newTs.length !== 1 ? "s have" : " has"} been introduced for the upcoming service period: ${list}. ` +
        `These targets were selected based on updated assessment findings, functional relevance, developmental sequencing, and hierarchical skill progression within the ${escapeHtml(categoryName)} domain.`,
      );
    }

    sentences.push(
      `Continued ABA intervention in this domain will prioritize generalization of established skills across natural environments, ongoing systematic instruction for current acquisition targets, and introduction of new objectives as clinically indicated by progress data and caregiver input. ` +
      `Treatment decisions will be guided by individualized clinical judgment, empirical data review, and collaboration with ${escapeHtml(name)}'s family and educational team to ensure that programming remains effective, meaningful, and responsive to changing needs.`,
    );
  }

  return sentences.map((s) => `<p>${s}</p>`).join("\n");
}

// ── Shared row helpers ────────────────────────────────────────────────────────

/**
 * Builds table rows for active (non-mastered) goals.
 * Uses masteryRule.openedDate for Start Date when available, falls back to createdAt.
 */
function _buildActiveGoalsRows(
  goals: ReportParentGoal[],
  trialStats: Map<string, TrialStats>,
): string[] {
  return goals.flatMap((g) => {
    const goalIntroDate = dateOrDash(g.createdAt);

    if (g.targets.length === 0) {
      return [
        `<tr><td>${escapeHtml(g.title)}</td>` +
        `<td colspan="7"><em>No targets defined</em></td></tr>`,
      ];
    }

    return g.targets
      .filter((t) => t.phase !== "MASTERED")
      .map((t, idx) => {
        const startDate    = getTargetStartDate(t);
        const currentLevel = computeCurrentLevel(t.id, trialStats);
        const progressPct  = computeProgressPct(t.id, trialStats);
        return (
          `<tr>` +
          `<td>${idx === 0 ? escapeHtml(g.title) : ""}</td>` +
          `<td>${escapeHtml(t.definition)}</td>` +
          `<td>${startDate}</td>` +
          `<td>${t.baseline ? escapeHtml(t.baseline) : "—"}</td>` +
          `<td>${currentLevel}</td>` +
          `<td>${progressPct}</td>` +
          `<td>${phaseLabel(t.phase)}</td>` +
          `<td>${goalIntroDate}</td>` +
          `</tr>`
        );
      });
  });
}

/**
 * Groups goals by category name. Returns ordered [categoryName, goals[]] pairs.
 * Category name resolved from: goal.program.name → programMap → goal.domain → "General"
 */
function _groupByCategory(
  goals: ReportParentGoal[],
  programMap: Map<string, string>,
): [string, ReportParentGoal[]][] {
  const order: string[] = [];
  const groups = new Map<string, ReportParentGoal[]>();

  for (const g of goals) {
    const cat =
      g.program?.name ??
      (g.programId ? programMap.get(g.programId) : undefined) ??
      g.domain ??
      "General";
    if (!groups.has(cat)) {
      order.push(cat);
      groups.set(cat, []);
    }
    groups.get(cat)!.push(g);
  }

  return order.map((c) => [c, groups.get(c)!]);
}

// ── HTML builders ─────────────────────────────────────────────────────────────

/**
 * Service Period / Provider Information section.
 * Replaces template content entirely. Uses BCBA data from selector.
 */
export function buildProviderInfoHtml(
  client: ReportClient,
  provider: ReportBcba,
  servicePeriod: ServicePeriod,
  generationDate: string,
): string {
  const age = computeAge(client.dob);

  const rows: [string, string][] = [
    ["Client Name",          escapeHtml(client.name)],
    ["Date of Birth",        `${formatDate(client.dob)} (Age ${age})`],
    ["Diagnosis",            client.diagnosis.length ? escapeHtml(client.diagnosis.join(", ")) : "[Diagnosis]"],
    ["Insurance ID",         client.insuranceId ? escapeHtml(client.insuranceId) : "[Insurance ID]"],
    ["Address",              client.address ? escapeHtml(client.address) : "[Address]"],
    ["School / Program",     client.school ? escapeHtml(client.school) : "[School / Program]"],
    ["Service Period Start", servicePeriod.start ? escapeHtml(servicePeriod.start) : "[Service Period Start]"],
    ["Service Period End",   servicePeriod.end ? escapeHtml(servicePeriod.end) : "[Service Period End]"],
    ["Assessment Date",      escapeHtml(generationDate)],
    ["BCBA Name",            escapeHtml(provider.name)],
    ["BCBA Credentials",     provider.credentials ? escapeHtml(provider.credentials) : "[BCBA Credentials]"],
    ["BCBA Email",           escapeHtml(provider.email)],
    ["BCBA Phone",           provider.phone ? escapeHtml(provider.phone) : "[BCBA Phone]"],
  ];

  if (client.guardianName)  rows.push(["Guardian / Parent", escapeHtml(client.guardianName)]);
  if (client.guardianPhone) rows.push(["Guardian Phone",    escapeHtml(client.guardianPhone)]);
  if (client.guardianEmail) rows.push(["Guardian Email",    escapeHtml(client.guardianEmail)]);

  const tableRows = rows
    .map(([label, value]) => `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`)
    .join("\n");

  return ["<table><tbody>", tableRows, "</tbody></table>"].join("\n");
}

/**
 * Biopsychosocial Information section.
 * Replaces template content with a narrative paragraph + clinical notes.
 */
export function buildBiopsychosocialHtml(
  client: ReportClient,
  generationDate: string,
): string {
  const age      = computeAge(client.dob);
  const diagText = client.diagnosis.length
    ? `a diagnosis of <strong>${escapeHtml(client.diagnosis.join(", "))}</strong>`
    : "[insert diagnosis / clinical presentation]";

  const firstName = firstNameOnly(client.name);

  const parts: string[] = [
    `<p><strong>${escapeHtml(firstName)}</strong> is a ${age}-year-old individual with ${diagText}. Assessment date: ${escapeHtml(generationDate)}.</p>`,
  ];

  if (client.school) {
    parts.push(`<p>${escapeHtml(firstName)} attends <strong>${escapeHtml(client.school)}</strong>.</p>`);
  }

  const guardianParts: string[] = [];
  if (client.guardianName)  guardianParts.push(escapeHtml(client.guardianName));
  if (client.guardianPhone) guardianParts.push(escapeHtml(client.guardianPhone));
  if (client.guardianEmail) guardianParts.push(escapeHtml(client.guardianEmail));
  if (guardianParts.length) {
    parts.push(`<p><strong>Guardian / Parent Contact:</strong> ${guardianParts.join(" · ")}</p>`);
  }

  if (client.intakeNotes) {
    parts.push(`<p><strong>Clinical Notes:</strong> ${escapeHtml(client.intakeNotes)}</p>`);
  }

  return parts.join("\n");
}

/**
 * Why ABA Services Are Needed section.
 */
export function buildWhyAbaHtml(
  client: ReportClient,
  generationDate: string,
): string {
  const age      = computeAge(client.dob);
  const diagText = client.diagnosis.length
    ? escapeHtml(client.diagnosis.join(", "))
    : "[diagnosis]";

  const firstName = firstNameOnly(client.name);

  return [
    `<p><strong>${escapeHtml(firstName)}</strong>, age ${age}, presents with ${diagText}. `,
    `Applied Behavior Analysis (ABA) services are recommended to address identified skill deficits `,
    `and behavioral needs as documented in this comprehensive assessment (${escapeHtml(generationDate)}).</p>`,
  ].join("");
}

/**
 * Category-specific summary section (Language, Social, Adaptive, etc.).
 * Returns a clinical narrative paragraph ONLY — no goal tables.
 * Goals are displayed once in the dedicated Goals section (buildCurrentGoalsHtml)
 * to prevent duplication across the report.
 * Returns null if no matching goals exist.
 */
export function buildCategoryGoalsHtml(
  programs: ReportProgram[],
  allGoals: ReportParentGoal[],
  categoryKeywords: string[],
  _generationDate: string,
  _trialStats: Map<string, TrialStats> = new Map(),
  assessmentType: AssessmentType = "reassessment",
  clientName: string = "",
): string | null {
  const kwLower = categoryKeywords.map((k) => k.toLowerCase());
  const categoryName = categoryKeywords[0]
    ? categoryKeywords[0].charAt(0).toUpperCase() + categoryKeywords[0].slice(1)
    : "this domain";

  const matchingProgramIds = new Set<string>(
    programs
      .filter((p) =>
        kwLower.some(
          (kw) => p.name.toLowerCase().includes(kw) || p.domain.toLowerCase().includes(kw),
        ),
      )
      .map((p) => p.id),
  );

  const matchingGoals = allGoals.filter(
    (g) =>
      (g.programId && matchingProgramIds.has(g.programId)) ||
      kwLower.some((kw) => (g.domain ?? "").toLowerCase().includes(kw)),
  );

  if (matchingGoals.length === 0) return null;

  // Return clinical narrative paragraph only.
  // Tables are in the Goals section to avoid duplication.
  return buildCategoryParagraph(clientName, categoryName, matchingGoals, assessmentType);
}

/**
 * Mastered Goals and Objectives section — full report-level table, grouped by category.
 * Initial assessment: shows note only. Reassessment: full grouped table.
 */
export function buildMasteredGoalsHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  generationDate: string,
  assessmentType: AssessmentType = "reassessment",
): string {
  if (assessmentType === "initial") {
    return [
      `<p><em>This is an initial assessment. No previously mastered goals to report.</em></p>`,
      `<p><strong>Assessment Date:</strong> ${escapeHtml(generationDate)}</p>`,
    ].join("\n");
  }

  const programMap = new Map(programs.map((p) => [p.id, p.name]));

  // Collect mastered entries grouped by category
  const catOrder: string[] = [];
  const catGroups = new Map<string, { goalTitle: string; target: ReportTarget }[]>();

  for (const g of allGoals) {
    const cat =
      g.program?.name ??
      (g.programId ? programMap.get(g.programId) : undefined) ??
      g.domain ??
      "General";

    const masteredTs = g.targets.filter((t) => t.phase === "MASTERED");
    if (masteredTs.length === 0) continue;

    if (!catGroups.has(cat)) {
      catOrder.push(cat);
      catGroups.set(cat, []);
    }
    for (const t of masteredTs) {
      catGroups.get(cat)!.push({ goalTitle: g.title, target: t });
    }
  }

  if (catOrder.length === 0) {
    return `<p><em>No goals were mastered in the reporting period.</em></p>`;
  }

  const multiCat = catOrder.length > 1;
  const rows: string[] = [];
  let total = 0;

  for (const cat of catOrder) {
    const entries = catGroups.get(cat)!;
    total += entries.length;
    if (multiCat) {
      rows.push(
        `<tr><th colspan="3" style="text-align:left"><strong>${escapeHtml(cat.toUpperCase())}</strong></th></tr>`,
      );
    }
    for (const { goalTitle, target: t } of entries) {
      rows.push(
        `<tr>` +
        `<td>${escapeHtml(goalTitle)}</td>` +
        `<td>${escapeHtml(t.definition)}</td>` +
        `<td>${t.dateMastered ? formatDate(t.dateMastered) : "—"}</td>` +
        `</tr>`,
      );
    }
  }

  return [
    `<p><strong>${total} objective${total !== 1 ? "s" : ""} mastered in the reporting period.</strong></p>`,
    `<table>`,
    `<thead><tr><th>Behavior / Goal</th><th>Objective</th><th>Date Mastered</th></tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody></table>`,
  ].join("\n");
}

/**
 * Goals and Objectives section — structured layout by category → lifecycle phase → skill area.
 *
 * Per-category structure:
 *   CATEGORY NAME (h3 + hr)
 *   ├── New Goals (h4)          — targets with phase = NEW
 *   ├── Goals In Treatment (h4) — ACQUISITION / BASELINE / MAINTENANCE / GENERALIZATION
 *   └── Recently Mastered (h4)  — MASTERED within last 6 months (pre-filtered by DB query)
 *
 * Within each phase section, goals are grouped by skill area (parentGoal.title).
 * Each table row for New / In-Treatment goals includes an editable "Target Date" cell.
 * Archived goals are excluded.
 */
export function buildCurrentGoalsHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  generationDate: string,
  trialStats: Map<string, TrialStats> = new Map(),
  _assessmentType: AssessmentType = "reassessment",
): string {
  const programMap  = new Map(programs.map((p) => [p.id, p.name]));
  const activeGoals = allGoals.filter((g) => g.status !== "ARCHIVED");

  if (activeGoals.length === 0) {
    return `<p><em>No active goals or targets were found for this client as of ${escapeHtml(generationDate)}.</em></p>`;
  }

  const grouped = _groupByCategory(activeGoals, programMap);

  const totalActiveTargets = activeGoals.reduce(
    (n, g) => n + g.targets.filter((t) => t.phase !== "MASTERED").length,
    0,
  );

  const parts: string[] = [
    `<p><strong>${activeGoals.length} skill area${activeGoals.length !== 1 ? "s" : ""} ` +
    `with ${totalActiveTargets} active target${totalActiveTargets !== 1 ? "s" : ""}.</strong></p>`,
  ];

  for (const [cat, catGoals] of grouped) {
    parts.push(`<h3>${escapeHtml(cat.toUpperCase())}</h3>`);
    parts.push(`<hr>`);

    // ── New Goals ─────────────────────────────────────────────────────────────
    const newRows: string[] = [];
    for (const g of catGoals) {
      const newTs = g.targets.filter((t) => t.phase === "NEW");
      if (newTs.length === 0) continue;
      newRows.push(
        `<tr><th colspan="3" style="text-align:left"><em>Skill Area: ${escapeHtml(g.title)}</em></th></tr>`,
      );
      for (const t of newTs) {
        newRows.push(
          `<tr>` +
          `<td>${escapeHtml(t.definition)}</td>` +
          `<td></td>` +
          `<td>${t.baseline ? escapeHtml(t.baseline) : "—"}</td>` +
          `</tr>`,
        );
      }
    }
    if (newRows.length > 0) {
      parts.push(
        `<h4>New Goals</h4>`,
        `<table>`,
        `<thead><tr><th>Objective</th><th>Target Date</th><th>Baseline</th></tr></thead>`,
        `<tbody>`, ...newRows, `</tbody>`,
        `</table>`,
      );
    }

    // ── Goals In Treatment ────────────────────────────────────────────────────
    const inTxRows: string[] = [];
    for (const g of catGoals) {
      const txTs = g.targets.filter((t) =>
        ["ACQUISITION", "BASELINE", "MAINTENANCE", "GENERALIZATION"].includes(t.phase),
      );
      if (txTs.length === 0) continue;
      inTxRows.push(
        `<tr><th colspan="5" style="text-align:left"><em>Skill Area: ${escapeHtml(g.title)}</em></th></tr>`,
      );
      for (const t of txTs) {
        const startDate    = getTargetStartDate(t);
        const currentLevel = computeCurrentLevel(t.id, trialStats);
        const progress     = computeProgressPct(t.id, trialStats);
        inTxRows.push(
          `<tr>` +
          `<td>${escapeHtml(t.definition)}</td>` +
          `<td>${startDate}</td>` +
          `<td></td>` +
          `<td>${currentLevel}</td>` +
          `<td>${progress}</td>` +
          `</tr>`,
        );
      }
    }
    if (inTxRows.length > 0) {
      parts.push(
        `<h4>Goals In Treatment</h4>`,
        `<table>`,
        `<thead><tr><th>Objective</th><th>Start Date</th><th>Target Date</th><th>Current Level</th><th>Progress</th></tr></thead>`,
        `<tbody>`, ...inTxRows, `</tbody>`,
        `</table>`,
      );
    }

    // ── Recently Mastered Goals ───────────────────────────────────────────────
    const masteredRows: string[] = [];
    for (const g of catGoals) {
      const mastTs = g.targets.filter((t) => t.phase === "MASTERED");
      if (mastTs.length === 0) continue;
      masteredRows.push(
        `<tr><th colspan="2" style="text-align:left"><em>Skill Area: ${escapeHtml(g.title)}</em></th></tr>`,
      );
      for (const t of mastTs) {
        masteredRows.push(
          `<tr>` +
          `<td>${escapeHtml(t.definition)}</td>` +
          `<td>${t.dateMastered ? formatDate(t.dateMastered) : "—"}</td>` +
          `</tr>`,
        );
      }
    }
    if (masteredRows.length > 0) {
      parts.push(
        `<h4>Recently Mastered Goals</h4>`,
        `<table>`,
        `<thead><tr><th>Objective</th><th>Date Mastered</th></tr></thead>`,
        `<tbody>`, ...masteredRows, `</tbody>`,
        `</table>`,
      );
    }

    parts.push(`<p> </p>`);
  }

  return parts.join("\n");
}

/**
 * Parent Goals section — 5-column table: Parent Goal, Status, Date Introduced, Progress, Comments.
 * Grouped by category when multiple programs/domains are present.
 * When no parent goals exist, renders an empty editable table (not just a message).
 */
export function buildParentGoalsHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  generationDate: string,
  trialStats: Map<string, TrialStats> = new Map(),
): string {
  const HEADER = [
    `<thead><tr>`,
    `<th>Parent Goal</th><th>Status</th><th>Date Introduced</th>`,
    `<th>Progress</th><th>Comments</th>`,
    `</tr></thead>`,
  ].join("");

  const programMap    = new Map(programs.map((p) => [p.id, p.name]));
  const relevantGoals = allGoals.filter((g) => g.status !== "ARCHIVED");

  // Empty editable table when no parent goals stored
  if (relevantGoals.length === 0) {
    const blankRows = Array.from({ length: 3 }, () =>
      `<tr><td></td><td></td><td></td><td></td><td></td></tr>`,
    ).join("");
    return [
      `<p><em>No parent goals found as of ${escapeHtml(generationDate)}. Add goals below or edit this section directly.</em></p>`,
      `<table>`, HEADER,
      `<tbody>`, blankRows, `</tbody>`,
      `</table>`,
    ].join("\n");
  }

  const grouped  = _groupByCategory(relevantGoals, programMap);
  const multiCat = grouped.length > 1;
  const rows: string[] = [];

  for (const [cat, catGoals] of grouped) {
    if (multiCat) {
      rows.push(
        `<tr><th colspan="5" style="text-align:left"><strong>${escapeHtml(cat.toUpperCase())}</strong></th></tr>`,
      );
    }

    for (const g of catGoals) {
      const introDate   = dateOrDash(g.createdAt);
      const firstTarget = g.targets[0];
      const progress    = firstTarget ? computeProgressPct(firstTarget.id, trialStats) : "—";

      rows.push(
        `<tr>` +
        `<td>${escapeHtml(g.title)}</td>` +
        `<td>${escapeHtml(g.status)}</td>` +
        `<td>${introDate}</td>` +
        `<td>${progress}</td>` +
        `<td>${g.notes ? escapeHtml(g.notes) : ""}</td>` +
        `</tr>`,
      );
    }
  }

  return [`<table>`, HEADER, `<tbody>`, ...rows, `</tbody></table>`].join("\n");
}

/**
 * New Goals section — only NEW-phase targets, grouped by category.
 */
export function buildNewGoalsHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  generationDate: string,
): string {
  const programMap = new Map(programs.map((p) => [p.id, p.name]));

  const catOrder: string[] = [];
  const catGroups = new Map<string, { goalTitle: string; target: ReportTarget }[]>();

  for (const g of allGoals) {
    const cat =
      g.program?.name ??
      (g.programId ? programMap.get(g.programId) : undefined) ??
      g.domain ??
      "General";

    const newTs = g.targets.filter((t) => t.phase === "NEW");
    if (newTs.length === 0) continue;

    if (!catGroups.has(cat)) {
      catOrder.push(cat);
      catGroups.set(cat, []);
    }
    for (const t of newTs) {
      catGroups.get(cat)!.push({ goalTitle: g.title, target: t });
    }
  }

  if (catOrder.length === 0) {
    return `<p><em>No newly introduced goals at this time (${escapeHtml(generationDate)}).</em></p>`;
  }

  const multiCat = catOrder.length > 1;
  const rows: string[] = [];
  let total = 0;

  for (const cat of catOrder) {
    const entries = catGroups.get(cat)!;
    total += entries.length;
    if (multiCat) {
      rows.push(
        `<tr><th colspan="4" style="text-align:left"><strong>${escapeHtml(cat.toUpperCase())}</strong></th></tr>`,
      );
    }
    for (const { goalTitle, target: t } of entries) {
      const startDate = getTargetStartDate(t);
      rows.push(
        `<tr>` +
        `<td>${escapeHtml(goalTitle)}</td>` +
        `<td>${escapeHtml(t.definition)}</td>` +
        `<td>${t.baseline ? escapeHtml(t.baseline) : "—"}</td>` +
        `<td>${startDate}</td>` +
        `</tr>`,
      );
    }
  }

  return [
    `<p><strong>${total} newly introduced objective${total !== 1 ? "s" : ""}.</strong></p>`,
    `<table>`,
    `<thead><tr>`,
    `<th>Behavior / Goal</th><th>Objective</th>`,
    `<th>Baseline</th><th>Introduced</th>`,
    `</tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody></table>`,
  ].join("\n");
}
