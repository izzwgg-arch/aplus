/**
 * Helpers for auto-generating clinical report section content.
 * Server-side only — no "use client" directive.
 * All HTML produced here must pass through sanitizeHtml() before being stored.
 *
 * Layout follows the approved Smart Steps initial-assessment document
 * (2026-08-17): narrative prose uses the client's FIRST NAME only; default
 * boilerplate paragraphs are fixed text with the first name substituted;
 * goal tables are generated from BT-entered target/trial data grouped under
 * the five fixed clinical categories.
 *
 * Behavior: builders REPLACE section content (Option B1).
 * Passthrough sections receive only placeholder substitution.
 */

import { escapeHtml, formatDate, replaceClientNamePlaceholders } from "./sanitizeHtml";

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

// ── Fixed clinical categories (approved document order) ───────────────────────

interface FixedCategory {
  /** Narrative heading, e.g. "LANGUAGE AND COMMUNICATION" */
  label: string;
  /** Table header row label, e.g. "LANGUAGE & COMMUNICATION" */
  tableLabel: string;
  keywords: string[];
  /** Skeleton skill rows for the mastered-goals table */
  skills: string[];
}

const FIXED_CATEGORIES: FixedCategory[] = [
  {
    label: "LANGUAGE AND COMMUNICATION",
    tableLabel: "LANGUAGE & COMMUNICATION",
    keywords: [
      "language", "communication", "manding", "requesting", "tacting",
      "labeling", "intraverbal", "verbal", "echoic", "listener", "speech",
    ],
    skills: ["Receptive Language", "Expressive Language", "Conversation Skills", "Emotional Expression"],
  },
  {
    label: "SOCIAL/EMOTIONAL SKILLS",
    tableLabel: "SOCIAL/EMOTIONAL",
    keywords: ["social", "emotional", "play", "leisure", "peer", "perspective"],
    skills: ["Social Interaction", "Social Awareness", "Perspective Taking", "Problem Solving", "Play/Leisure"],
  },
  {
    label: "CHALLENGING BEHAVIOR",
    tableLabel: "CHALLENGING BEHAVIOR",
    keywords: [
      "challenging", "behavior reduction", "aggression", "tantrum",
      "compulsive", "stereotyp", "problem behavior", "behavior",
    ],
    skills: ["Aggression", "Tantrums", "Compulsive Behavior"],
  },
  {
    label: "ADAPTIVE BEHAVIOR",
    tableLabel: "ADAPTIVE BEHAVIOR",
    keywords: [
      "adaptive", "daily living", "self-care", "self care", "self-help",
      "self help", "safety", "feeding", "toileting", "dressing", "hygiene", "compliance",
    ],
    skills: ["Flexibility/Compliance", "Self-Help", "Safety Skills", "Appropriate Engagement"],
  },
  {
    label: "EXECUTIVE FUNCTIONING",
    tableLabel: "EXECUTIVE FUNCTIONING",
    keywords: ["executive", "attending", "attention", "planning", "self-regulation", "self regulation"],
    skills: ["Attending", "Planning", "Self-regulation"],
  },
];

/**
 * The five fixed clinical categories, in document order, as the report's own
 * table headings spell them. Exported so the assessment editor's goal picker
 * offers exactly the categories the generated tables group rows under — a
 * free-typed category would land in an "extra" group at the bottom instead.
 */
export const REPORT_CATEGORY_OPTIONS: { label: string; tableLabel: string }[] =
  FIXED_CATEGORIES.map((c) => ({ label: c.label, tableLabel: c.tableLabel }));

/** Resolves a goal's raw domain string (program name → domain → "General"). */
function goalDomainString(g: ReportParentGoal, programMap: Map<string, string>): string {
  return (
    g.program?.name ??
    (g.programId ? programMap.get(g.programId) : undefined) ??
    g.domain ??
    "General"
  );
}

/** Index into FIXED_CATEGORIES, or -1 when the goal matches none of them. */
function fixedCategoryIndex(domainString: string): number {
  const d = domainString.toLowerCase();
  return FIXED_CATEGORIES.findIndex((c) => c.keywords.some((kw) => d.includes(kw)));
}

/**
 * Groups goals under the five fixed categories (document order), then any
 * unmatched domains in first-seen order. Returns ordered [label, tableLabel, goals[]].
 */
function groupByFixedCategory(
  goals: ReportParentGoal[],
  programMap: Map<string, string>,
): { label: string; tableLabel: string; catIndex: number; goals: ReportParentGoal[] }[] {
  const fixed: ReportParentGoal[][] = FIXED_CATEGORIES.map(() => []);
  const extraOrder: string[] = [];
  const extras = new Map<string, ReportParentGoal[]>();

  for (const g of goals) {
    const domain = goalDomainString(g, programMap);
    const idx = fixedCategoryIndex(domain);
    if (idx >= 0) {
      fixed[idx].push(g);
    } else {
      if (!extras.has(domain)) { extraOrder.push(domain); extras.set(domain, []); }
      extras.get(domain)!.push(g);
    }
  }

  const out: { label: string; tableLabel: string; catIndex: number; goals: ReportParentGoal[] }[] = [];
  FIXED_CATEGORIES.forEach((c, i) => {
    out.push({ label: c.label, tableLabel: c.tableLabel, catIndex: i, goals: fixed[i] });
  });
  for (const name of extraOrder) {
    out.push({ label: name.toUpperCase(), tableLabel: name.toUpperCase(), catIndex: -1, goals: extras.get(name)! });
  }
  return out;
}

// ── Section-type detection ────────────────────────────────────────────────────

export type SectionType =
  | { kind: "provider_info" }
  | { kind: "biopsychosocial" }
  | { kind: "why_aba" }
  | { kind: "category_goals"; keywords: string[]; label: string }
  | { kind: "mastered_goals" }
  | { kind: "current_goals" }
  | { kind: "parent_goals" }
  | { kind: "new_goals" }
  | { kind: "coordination" }
  | { kind: "team_training" }
  | { kind: "crisis_plan" }
  | { kind: "transition_plan" }
  | { kind: "discharge_criteria" }
  | { kind: "service_recommendations" }
  | { kind: "schedule" }
  | { kind: "summary_contact" }
  | { kind: "behavior_plan" }
  | { kind: "passthrough" };

/**
 * Maps a section title to a structured type that drives auto-population.
 * Keyword-based, case-insensitive. Specific patterns are checked before
 * broad category keywords; mastered_goals is checked before current_goals.
 */
export function detectSectionType(title: string): SectionType {
  const t = title.toLowerCase();

  if (/service\s+period|provider\s+info/.test(t))
    return { kind: "provider_info" };

  if (/biopsychosocial|biophysical/.test(t))
    return { kind: "biopsychosocial" };

  if (/why\s+(aba|services?\s+(are\s+)?needed)/.test(t))
    return { kind: "why_aba" };

  if (/behavior\s+intervention\s+plan|attachment\s+a/.test(t))
    return { kind: "behavior_plan" };

  if (/mastered\s+goals?/.test(t))
    return { kind: "mastered_goals" };

  if (/parent|guardian/.test(t))
    return { kind: "parent_goals" };

  if (/new\s+goals?|upcoming\s+goals?/.test(t))
    return { kind: "new_goals" };

  if (/current\s+goals?|goals?\s+and\s+objectives|skill\s+acquisition/.test(t) && !/mastered/.test(t))
    return { kind: "current_goals" };

  if (/coordination/.test(t))
    return { kind: "coordination" };

  if (/team\s+training/.test(t))
    return { kind: "team_training" };

  if (/crisis|emergency/.test(t))
    return { kind: "crisis_plan" };

  if (/transition/.test(t))
    return { kind: "transition_plan" };

  if (/discharge/.test(t))
    return { kind: "discharge_criteria" };

  if (/recommendation|treatment\s+hours?/.test(t))
    return { kind: "service_recommendations" };

  if (/schedule/.test(t))
    return { kind: "schedule" };

  // Domain-category checks must run BEFORE the summary check: live templates
  // carry titles like "Language & Communication -Summary", which are domain
  // sections, not the closing summary/contact block.
  if (/language|communication/.test(t))
    return { kind: "category_goals", keywords: FIXED_CATEGORIES[0].keywords, label: FIXED_CATEGORIES[0].label };

  if (/social/.test(t))
    return { kind: "category_goals", keywords: FIXED_CATEGORIES[1].keywords, label: FIXED_CATEGORIES[1].label };

  if (/challenging\s+behav|behavior\s+reduc/.test(t))
    return { kind: "category_goals", keywords: FIXED_CATEGORIES[2].keywords, label: FIXED_CATEGORIES[2].label };

  if (/adaptive|daily\s+living|self.care/.test(t))
    return { kind: "category_goals", keywords: FIXED_CATEGORIES[3].keywords, label: FIXED_CATEGORIES[3].label };

  if (/executive\s+function/.test(t))
    return { kind: "category_goals", keywords: FIXED_CATEGORIES[4].keywords, label: FIXED_CATEGORIES[4].label };

  if (/fine\s+motor/.test(t))
    return { kind: "category_goals", keywords: ["fine motor", "motor"], label: "FINE MOTOR" };

  if (/gross\s+motor/.test(t))
    return { kind: "category_goals", keywords: ["gross motor"], label: "GROSS MOTOR" };

  if (/academic|pre.academic/.test(t))
    return { kind: "category_goals", keywords: ["academic"], label: "ACADEMIC" };

  if (/vocational/.test(t))
    return { kind: "category_goals", keywords: ["vocational"], label: "VOCATIONAL" };

  if (/summary|contact\s+information/.test(t))
    return { kind: "summary_contact" };

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
export function firstNameOnly(fullName: string): string {
  if (!fullName) return "The client";
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName;
}

/** Substitutes {{client}}/(Client) placeholder tokens in BT-entered goal text
 *  with the client's FIRST name, then escapes for HTML. */
function goalText(raw: string, firstName: string): string {
  return escapeHtml(replaceClientNamePlaceholders(raw, firstName));
}

/** Extracts Date Opened from masteryRule.openedDate. Returns "TBD" if never set.
 *  Never falls back to createdAt — an unset date must show TBD per clinical spec. */
function getTargetStartDate(t: ReportTarget): string {
  const mr = (t.masteryRule != null && typeof t.masteryRule === "object" && !Array.isArray(t.masteryRule))
    ? (t.masteryRule as Record<string, unknown>)
    : null;
  const openedDate = mr?.openedDate;
  if (openedDate && typeof openedDate === "string") return formatDate(openedDate);
  return "TBD";
}

/** "To Be Mastered by" label: service-period end when known. */
function masteredByLabel(servicePeriodEnd?: string): string {
  return servicePeriodEnd?.trim() ? servicePeriodEnd.trim() : "the end of the service period";
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

// ── HTML builders ─────────────────────────────────────────────────────────────

/**
 * Service Period / Provider Information section.
 * Kept as a label/value table — the print layout reads these rows as facts
 * to render the fill-in header block, so the labels must stay stable.
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
    ["BCBA Credentials",     provider.credentials ? escapeHtml(provider.credentials) : "BCBA"],
    ["BCBA Email",           escapeHtml(provider.email)],
    ["BCBA Phone",           provider.phone ? escapeHtml(provider.phone) : "[BCBA Phone]"],
  ];

  // Guardian/parent contact info is deliberately NOT included — the assessment
  // document must not surface it (removed 2026-08-31 per clinical request).

  const tableRows = rows
    .map(([label, value]) => `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`)
    .join("\n");

  return ["<table><tbody>", tableRows, "</tbody></table>"].join("\n");
}

/**
 * Biopsychosocial Information section — generated from Client Info fields:
 * age (DOB), address, diagnosis, intake notes verbatim, school, ABA history.
 */
export function buildBiopsychosocialHtml(
  client: ReportClient,
  generationDate: string,
  assessmentType: AssessmentType = "reassessment",
): string {
  const age       = computeAge(client.dob);
  const firstName = firstNameOnly(client.name);
  const first     = escapeHtml(firstName);

  const opener: string[] = [];
  opener.push(
    `${first} is a ${age}-year-old who lives with ${escapeHtml(firstName)}'s family` +
    (client.address ? ` at ${escapeHtml(client.address)}` : "") + `.`,
  );
  if (client.diagnosis.length) {
    opener.push(`${first} has a diagnosis of ${escapeHtml(client.diagnosis.join(", "))}.`);
  }

  const parts: string[] = [`<p>${opener.join(" ")}</p>`];

  // Client-specific history exactly as entered in Client Info → Intake Notes.
  if (client.intakeNotes) {
    const paragraphs = client.intakeNotes
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${goalText(p, firstName).replace(/\n/g, "<br>")}</p>`);
    parts.push(...paragraphs);
  } else {
    parts.push(`<p>[Developmental history, milestones, medical information — add to Client Info → Intake Notes to auto-fill]</p>`);
  }

  // Academic Activities
  parts.push(`<h3>Academic Activities</h3>`);
  parts.push(
    client.school
      ? `<p>${first} currently attends ${escapeHtml(client.school)}.</p>`
      : `<p>${first} is not currently attending any school.</p>`,
  );

  if (assessmentType === "initial") {
    parts.push(
      `<p>${first} is now starting ABA for the very first time and did not receive ABA in the past.</p>`,
    );
  } else {
    parts.push(
      `<p>${first} has been receiving ABA services and continues to benefit from ongoing treatment.</p>`,
    );
  }

  return parts.join("\n");
}

/**
 * Why ABA Services Are Needed — client-specific intro (editable) followed by
 * the two fixed medical-necessity boilerplate paragraphs with the first name
 * substituted. The four domain paragraphs are their own sections.
 */
export function buildWhyAbaHtml(
  client: ReportClient,
  generationDate: string,
): string {
  const firstName = firstNameOnly(client.name);
  const first     = escapeHtml(firstName);
  const diagText  = client.diagnosis.length
    ? escapeHtml(client.diagnosis.join(", "))
    : "[diagnosis]";

  return [
    // Client-specific intro — BCBA edits the bracketed portions
    `<p>${first} presents with skill deficits related to ${diagText} and requires support across multiple areas of development. ` +
    `Based on observation, assessment through the [assessment tool — e.g., AFLS, ABLLS-R, VB-MAPP], parent interviews, and data analysis, ` +
    `${first} presents with significant delays in areas of development related to the diagnosis, including, but not limited to: ` +
    `expressive and receptive language, social awareness, daily living skills, limited attention span, and repetitive behaviors.</p>`,

    // Default paragraph 1 — medical necessity (fixed text, first name substituted)
    `<p>Due to the above-mentioned skill deficits, it continues to be medically necessary for ${first} to receive ABA treatment, ` +
    `in order to attain the necessary skills to function within the family and alongside peers. Treatment (to be detailed in ` +
    `subsequent sections of this Authorization) will utilize ABA methodology and technology to assist ${first} in reaching the ` +
    `treatment goals set forth in this plan. ABA has been scientifically proven to be effective in remediating the deficits ` +
    `associated with Autism Spectrum Disorders. Task analyses of skills in need of development will be outlined, to allow for ` +
    `the creation of an individually designed treatment plan, custom-tailored to the specific needs of the patient. Skills will ` +
    `be taught in a hierarchical manner, with adjustments made to treatment protocol based on data from sessions and ` +
    `parent/clinician feedback, until mastery criteria are achieved.</p>`,

    // Default paragraph 2 — treatment methodology (fixed text, first name substituted)
    `<p>${first} is expected to increase communication, social-emotional, executive functioning, and adaptive behavior skills ` +
    `through ABA services. ${first} will learn both in contrived settings and through naturally occurring learning ` +
    `opportunities, and will be taught to generalize learning to untrained environments (such as to novel settings, persons, ` +
    `and behaviors). Behavioral methods to be used may include but are not limited to: most-to-least/least-to-most prompting, ` +
    `behavioral momentum, shaping, chaining, modeling, role play, contingency contracts, and various differential reinforcement ` +
    `procedures (e.g., DRA, DRI and DRO). Treatment will initially be provided in a 1:1 environment, and generalization to the ` +
    `natural environment will be initiated when ${first} is beginning to show mastery in that setting. Supervision of behavior ` +
    `technicians, teachers, parents, and other caregivers, as well as objective review of treatment data, will continue to be ` +
    `conducted by a BCBA and will take place on a regular basis. The BCBA will provide training and feedback on the progress ` +
    `and implementation of treatment programs and goals, and will monitor treatment integrity and consistency. Goals and ` +
    `behavior plans will be discussed during this time as well. Finally, the BCBA will coordinate care among providers and make ` +
    `efforts to ensure that the treatment protocols are implemented consistently across all settings, through observation and ` +
    `anecdotal feedback.</p>`,
  ].join("\n");
}

/**
 * Domain narrative section (Language & Communication, Social/Emotional,
 * Challenging Behavior, Adaptive Behavior, …).
 * One underlined-heading paragraph generated from the client's MASTERED,
 * CURRENT (active), and FUTURE (new) goals in that domain.
 * ALWAYS returns content (never null): a domain with no goals yet gets the
 * heading plus an editable no-goals line — falling through to raw template
 * text used to leave "[Describe...]" boilerplate in the generated report.
 */
export function buildCategoryGoalsHtml(
  programs: ReportProgram[],
  allGoals: ReportParentGoal[],
  categoryKeywords: string[],
  _generationDate: string,
  _trialStats: Map<string, TrialStats> = new Map(),
  assessmentType: AssessmentType = "reassessment",
  clientName: string = "",
  categoryLabel?: string,
): string | null {
  const firstName = firstNameOnly(clientName);
  const first     = escapeHtml(firstName);
  const kwLower   = categoryKeywords.map((k) => k.toLowerCase());
  const label     = categoryLabel ?? (categoryKeywords[0] ?? "this domain").toUpperCase();

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
      kwLower.some((kw) => (g.domain ?? "").toLowerCase().includes(kw)) ||
      (g.program && kwLower.some((kw) => g.program!.name.toLowerCase().includes(kw))),
  );

  const allTs      = matchingGoals.flatMap((g) => g.targets);
  const masteredTs = allTs.filter((t) => t.phase === "MASTERED");
  const activeTs   = allTs.filter((t) => ["ACQUISITION", "BASELINE", "MAINTENANCE", "GENERALIZATION"].includes(t.phase));
  const newTs      = allTs.filter((t) => t.phase === "NEW");

  const heading = `<u><strong><em>${escapeHtml(label)}:</em></strong></u> `;

  if (allTs.length === 0) {
    if (matchingGoals.length === 0) {
      return `<p>${heading}No goals have been identified in this domain at this time. ` +
        `[Describe ${first}'s current presentation in this area, or add goals in the Goals &amp; Targets tab and regenerate.]</p>`;
    }
    return `<p>${heading}No objectives have been defined in this domain yet. [Describe ${first}'s current presentation in this area.]</p>`;
  }

  const sentences: string[] = [];

  // Editable client-specific opener
  sentences.push(
    `[Describe ${first}'s current presentation and difficulties in this area.]`,
  );

  // Mastered goals → accomplishments to date
  if (masteredTs.length > 0) {
    const list = masteredTs.map((t) => goalText(t.definition, firstName)).join("; ");
    sentences.push(
      `${first} has mastered the following objective${masteredTs.length !== 1 ? "s" : ""} in this area: ${list}.`,
    );
  }

  // Current goals → active treatment focus
  if (activeTs.length > 0) {
    const list = activeTs.map((t) => goalText(t.definition, firstName)).join("; ");
    sentences.push(
      `Currently, the goal is for ${first} to work on the following: ${list}.`,
    );
  }

  // Future goals → upcoming targets
  if (newTs.length > 0) {
    const list = newTs.map((t) => goalText(t.definition, firstName)).join("; ");
    sentences.push(
      `In addition, ${first} will work toward the following upcoming goal${newTs.length !== 1 ? "s" : ""}: ${list}.`,
    );
  }

  if (assessmentType === "initial" && masteredTs.length === 0 && activeTs.length === 0 && newTs.length === 0) {
    sentences.push(`Goals in this area will be identified as treatment progresses.`);
  }

  return `<p>${heading}${sentences.join("  ")}</p>`;
}

/**
 * Mastered Goals and Objectives — the fixed category-skeleton table.
 * Initial assessment: skeleton with the standard skill rows, all cells empty
 * (no goals mastered yet). Reassessment: mastered targets from BT data are
 * filled in under the matching category header; categories with no mastered
 * goals keep their empty skeleton rows.
 */
export function buildMasteredGoalsHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  generationDate: string,
  assessmentType: AssessmentType = "reassessment",
  clientName: string = "",
): string {
  const firstName  = firstNameOnly(clientName);
  const programMap = new Map(programs.map((p) => [p.id, p.name]));

  // mastered entries per fixed-category index (reassessment only)
  const masteredByCat = new Map<number, { skillArea: string; def: string; date: string }[]>();
  const extraCats: { label: string; entries: { skillArea: string; def: string; date: string }[] }[] = [];

  if (assessmentType !== "initial") {
    const extrasMap = new Map<string, { skillArea: string; def: string; date: string }[]>();
    for (const g of allGoals) {
      const masteredTs = g.targets.filter((t) => t.phase === "MASTERED");
      if (masteredTs.length === 0) continue;
      const domain = goalDomainString(g, programMap);
      const idx = fixedCategoryIndex(domain);
      const entries = masteredTs.map((t) => ({
        skillArea: g.title,
        def: t.definition,
        date: t.dateMastered ? formatDate(t.dateMastered) : "—",
      }));
      if (idx >= 0) {
        if (!masteredByCat.has(idx)) masteredByCat.set(idx, []);
        masteredByCat.get(idx)!.push(...entries);
      } else {
        if (!extrasMap.has(domain)) {
          extrasMap.set(domain, []);
          extraCats.push({ label: domain.toUpperCase(), entries: extrasMap.get(domain)! });
        }
        extrasMap.get(domain)!.push(...entries);
      }
    }
  }

  const rows: string[] = [];
  FIXED_CATEGORIES.forEach((cat, i) => {
    rows.push(
      `<tr><td colspan="3" style="text-align:center"><strong>${escapeHtml(cat.label)}</strong></td></tr>`,
    );
    const entries = masteredByCat.get(i);
    if (entries && entries.length > 0) {
      for (const e of entries) {
        rows.push(
          `<tr><td>${goalText(e.skillArea, firstName)}</td><td>${goalText(e.def, firstName)}</td><td>${escapeHtml(e.date)}</td></tr>`,
        );
      }
    } else {
      for (const skill of cat.skills) {
        rows.push(`<tr><td>${escapeHtml(skill)}</td><td></td><td></td></tr>`);
      }
    }
  });
  for (const extra of extraCats) {
    rows.push(
      `<tr><td colspan="3" style="text-align:center"><strong>${escapeHtml(extra.label)}</strong></td></tr>`,
    );
    for (const e of extra.entries) {
      rows.push(
        `<tr><td>${goalText(e.skillArea, firstName)}</td><td>${goalText(e.def, firstName)}</td><td>${escapeHtml(e.date)}</td></tr>`,
      );
    }
  }

  return [
    `<table>`,
    `<thead><tr><th>Category</th><th>Goal/Operational Definition</th><th>Date Mastered</th></tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody></table>`,
  ].join("\n");
}

/**
 * Goals and Objectives for skill acquisition — the classic 5-column chart
 * generated from BT-entered targets, grouped by the fixed categories with
 * "NEW GOALS – To Be Mastered by <service period end>" header rows.
 *
 * Start Date = masteryRule.openedDate or TBD; Baseline = target.baseline or
 * "Low"; Current level = recent-trial percentage (blank on initial assessment
 * — no data has been collected yet).
 */
export function buildCurrentGoalsHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  generationDate: string,
  trialStats: Map<string, TrialStats> = new Map(),
  assessmentType: AssessmentType = "reassessment",
  clientName: string = "",
  servicePeriodEnd?: string,
): string {
  const firstName   = firstNameOnly(clientName);
  const first       = escapeHtml(firstName);
  const programMap  = new Map(programs.map((p) => [p.id, p.name]));
  const activeGoals = allGoals.filter((g) => g.status !== "ARCHIVED");

  const intro = assessmentType === "initial"
    ? `<p>${first} presents with deficits in multiple areas of development. Goals listed below were derived from the ` +
      `findings of ${first}'s functional assessment and skill-based assessments completed during the initial evaluation. ` +
      `The following chart lists the goals to be implemented in the upcoming authorization period:</p>`
    : `<p>${first} presents with deficits in multiple areas of development. Goals listed below were derived from the ` +
      `findings of ${first}'s functional assessment and skill-based assessments completed during the reassessment ` +
      `evaluation. The following chart summarizes progress on goals from the previous authorization period, and includes ` +
      `new goals to be implemented in the next authorization period:</p>`;

  if (activeGoals.length === 0) {
    return [
      intro,
      `<p><em>No active goals or targets were found for this client as of ${escapeHtml(generationDate)}. ` +
      `Add goals and targets in the client's Programs tab, then regenerate this report.</em></p>`,
    ].join("\n");
  }

  const grouped = groupByFixedCategory(activeGoals, programMap);
  const rows: string[] = [];

  for (const cat of grouped) {
    // targets still in treatment (not mastered — mastered live in their own table)
    const catRows: string[] = [];
    for (const g of cat.goals) {
      for (const t of g.targets) {
        if (t.phase === "MASTERED") continue;
        const startDate    = getTargetStartDate(t);
        const baseline     = t.baseline ? escapeHtml(t.baseline) : "Low";
        const currentLevel = assessmentType === "initial" ? "" : computeCurrentLevel(t.id, trialStats);
        catRows.push(
          `<tr>` +
          `<td>${goalText(g.title, firstName)}</td>` +
          `<td>${goalText(t.definition, firstName)}</td>` +
          `<td>${escapeHtml(startDate)}</td>` +
          `<td>${baseline}</td>` +
          `<td>${currentLevel === "—" ? "" : currentLevel}</td>` +
          `</tr>`,
        );
      }
    }
    if (catRows.length === 0) continue;

    rows.push(
      `<tr><td colspan="5" style="text-align:center"><strong>${escapeHtml(cat.tableLabel)}</strong></td></tr>`,
      `<tr><td colspan="5" style="text-align:center"><strong>NEW GOALS &ndash; To Be Mastered by ${escapeHtml(masteredByLabel(servicePeriodEnd))}</strong></td></tr>`,
      ...catRows,
    );
  }

  if (rows.length === 0) {
    return [
      intro,
      `<p><em>No active (non-mastered) targets were found for this client as of ${escapeHtml(generationDate)}.</em></p>`,
    ].join("\n");
  }

  return [
    intro,
    `<table>`,
    `<thead><tr><th>Behavior</th><th>Objective/ Operational Definition</th><th>Start Date</th><th>Baseline Level</th><th>Current level</th></tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody></table>`,
  ].join("\n");
}

/**
 * Parent/Guardian Involvement — the fixed caregiver-participation paragraph
 * (first name substituted) followed by the parent-training goals table with
 * the standard default rows. Rows are editable after generation.
 */
export function buildParentGoalsHtml(
  _allGoals: ReportParentGoal[],
  _programs: ReportProgram[],
  _generationDate: string,
  _trialStats: Map<string, TrialStats> = new Map(),
  clientName: string = "",
): string {
  const first = escapeHtml(firstNameOnly(clientName));

  const intro =
    `<p>Caregiver participation is a critical component of ${first}'s treatment program. As the therapist and other team ` +
    `members are only with ${first} for a short period of time during the day/week, it is integral that the parents (who ` +
    `spend much more time with the child) maintain an involvement in all aspects of their child's care, especially the ABA ` +
    `program. As such, layman's terminology is used whenever possible in communicating with parents and caregivers; when ` +
    `needed, technical terminology is used and clearly explained. Weekly sessions with the BCBA are held to give the ` +
    `parents/caregivers the opportunity to learn and develop skills to help shape their child's behavior. Parents and other ` +
    `stakeholders (e.g., therapists, school staff) attend monthly case meetings and are encouraged to participate in ` +
    `treatment sessions when appropriate in order to encourage generalization of skills. These continued meetings and ` +
    `updates help maintain a successful relationship between all parties involved, and ease implementation of programs by ` +
    `the parents. Parents/caregivers are advised to contact the BCBA assigned to the case for additional guidance when ` +
    `difficulties arise between parent training sessions. Data are collected on parent/caregiver skill development, and ` +
    `treatment methodology is adjusted for maximum learning based on findings of the data. The itemized treatment goal ` +
    `table below outlines training objectives that parents will be taught to help bring ABA into their lives when teaching ` +
    `and interacting with ${first}.</p>`;

  const HEADER =
    `<thead><tr>` +
    `<th>Behavior</th><th>Objective</th><th>Introduction Date</th><th>Baseline Level</th>` +
    `<th>Current level</th><th>Carrying Over? (Y/N)</th><th>Comments</th>` +
    `</tr></thead>`;

  const rows = [
    `<tr><td colspan="7" style="text-align:center"><strong>NEW GOALS</strong></td></tr>`,
    `<tr><td>ABA principles</td><td>Parents should learn to identify the 4 main functions of behavior.</td><td></td><td></td><td></td><td></td><td></td></tr>`,
    `<tr><td>Reinforcement</td><td>${first}'s parents will learn when to use appropriate reinforcement/consequences.</td><td></td><td></td><td></td><td></td><td></td></tr>`,
    `<tr><td>Compliance</td><td>${first}'s parents will learn how to help ${first} be more compliant.</td><td></td><td></td><td></td><td></td><td></td></tr>`,
  ];

  return [intro, `<table>`, HEADER, `<tbody>`, ...rows, `</tbody></table>`].join("\n");
}

/**
 * New Goals section — only NEW-phase targets, grouped by category.
 * Kept for templates that include a dedicated "New Goals" section.
 */
export function buildNewGoalsHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  generationDate: string,
  clientName: string = "",
): string {
  const firstName  = firstNameOnly(clientName);
  const programMap = new Map(programs.map((p) => [p.id, p.name]));
  const grouped    = groupByFixedCategory(allGoals, programMap);
  const rows: string[] = [];
  let total = 0;

  for (const cat of grouped) {
    const entries = cat.goals.flatMap((g) =>
      g.targets.filter((t) => t.phase === "NEW").map((t) => ({ goalTitle: g.title, target: t })),
    );
    if (entries.length === 0) continue;
    total += entries.length;
    rows.push(
      `<tr><td colspan="4" style="text-align:center"><strong>${escapeHtml(cat.tableLabel)}</strong></td></tr>`,
    );
    for (const { goalTitle, target: t } of entries) {
      rows.push(
        `<tr>` +
        `<td>${goalText(goalTitle, firstName)}</td>` +
        `<td>${goalText(t.definition, firstName)}</td>` +
        `<td>${t.baseline ? escapeHtml(t.baseline) : "Low"}</td>` +
        `<td>${escapeHtml(getTargetStartDate(t))}</td>` +
        `</tr>`,
      );
    }
  }

  if (total === 0) {
    return `<p><em>No newly introduced goals at this time (${escapeHtml(generationDate)}).</em></p>`;
  }

  return [
    `<table>`,
    `<thead><tr><th>Behavior / Goal</th><th>Objective</th><th>Baseline</th><th>Introduced</th></tr></thead>`,
    `<tbody>`,
    ...rows,
    `</tbody></table>`,
  ].join("\n");
}

// ── Default boilerplate sections (fixed text, first name substituted) ─────────

export function buildCoordinationHtml(clientName: string): string {
  const first = escapeHtml(firstNameOnly(clientName));
  return [
    `<p>The BCBA assigned to this case reviews the reports from all health and medical providers that service ${first} ` +
    `outside of those delivered through Smart Steps. Additionally, observations of ${first} in therapy are conducted when ` +
    `approved by the service providers and the goals of these service providers have been integrated into therapy when ` +
    `deemed appropriate. The BCBA makes every effort to communicate with the client's service providers including, but not ` +
    `limited to: e.g., Psychologists, Individualized Education Plan/School Service Providers, Psychiatrists and Speech ` +
    `Therapists. Reports of progress are shared among providers in order to establish consistency in treatment and promote ` +
    `generalization in learning when appropriate. Declination of participation in coordination of care by a service ` +
    `provider is documented. To date no service providers have declined participation in coordination of care.</p>`,
  ].join("\n");
}

export function buildTeamTrainingHtml(clientName: string): string {
  const first = escapeHtml(firstNameOnly(clientName));
  return [
    `<p>Intense staff training is critical to maintain treatment quality, consistency and integrity across providers. ` +
    `The BCBA assigned to ${first}'s case observes ${first} and clinician during treatment sessions when deemed ` +
    `appropriate, and coaches clinicians on proper protocol to be used during sessions and techniques to promote ` +
    `generalization of skills to other environments.</p>`,
    `<p>Team Clinic Meetings are held at a minimum of once monthly with parents, clinicians and the BCBA assigned to ` +
    `${first}'s case. Said meetings serve to enhance treatment outcomes via discussion of BCBA observation, parent and ` +
    `clinician feedback regarding treatment data and protocol, and opportunities for generalization of skills in community ` +
    `settings. In addition, team members endeavor to ameliorate parents' and/or clinicians' concerns regarding treatment ` +
    `and progression toward treatment goals. Patient's progress toward acquisition goals and rates/frequencies of ` +
    `challenging behaviors is examined regularly to determine progress toward goals and necessity of plan modification. ` +
    `Parent training goals are addressed as well, but dealt with more thoroughly during scheduled Parent Training sessions.</p>`,
  ].join("\n");
}

export function buildCrisisPlanHtml(clientName: string): string {
  const first = escapeHtml(firstNameOnly(clientName));
  return [
    `<h3>Safety:</h3>`,
    `<p>Clinical staff working with ${first} have access to a working phone at all times in case of emergency. Report of ` +
    `physical examination by a physician and current record of immunizations is on-site in a known location at all times, ` +
    `together with an Emergency Log Book. The Log book is used to document any emergency or crisis. One of the parents is ` +
    `notified of any serious incident, accident or injury involving the patient if they are not present at the moment of ` +
    `injury/emergency. To ensure safety, a parent or caregiver is present at all times during treatment sessions.</p>`,
    `<h3>Emergency Procedure</h3>`,
    `<p>A crisis or clinical emergency is defined as any situation in which there is a question of danger to ${first}'s ` +
    `health and well-being, or the health and well-being of those in the immediate vicinity. No distinction is made of ` +
    `whether the danger is present as a result of an action done to the client or one that the client does to themselves ` +
    `or others.</p>`,
    `<p>In case of a true crisis or clinical emergency, the clinician will immediately inform ${first}'s parent or ` +
    `caregiver. Every effort will be made to protect ${first}'s safety, as well as the safety of those around ${first}. ` +
    `Emergency information (emergency contacts, phone numbers of treating physicians and emergency protocols for specific ` +
    `medical conditions) is kept in the client's emergency log book, which will be carried on outings in the community.</p>`,
    `<h3>Accidents/Medical Emergencies</h3>`,
    `<p>911 or Hatzolah (the local emergency service provider) will be called when the situation necessitates a first ` +
    `responder. A parent will be notified immediately, or at the first opportunity. CPR/First Aid will only be ` +
    `administered if the clinician with ${first} at the time of the incident has been certified to do so. Minor incidents ` +
    `or injuries (i.e., bruises, scrapes or scratches from a simple fall) are reported to the parents via telephone after ` +
    `the child has been treated. All incidents, both major and minor, are documented in the emergency log book.</p>`,
    `<h3>Weather-Related Emergencies</h3>`,
    `<p>In case of inclement weather where travel may be unsafe (e.g., in situations where school would be cancelled), ` +
    `treatment is postponed until weather conditions are sufficient to support safe travel.</p>`,
  ].join("\n");
}

export function buildTransitionPlanHtml(clientName: string): string {
  const first = escapeHtml(firstNameOnly(clientName));
  return [
    `<p>Discharge is not being recommended at this time. A systematic plan for stopping services will be developed when it ` +
    `has been determined that a discharge from services is clinically appropriate (see discharge criteria below). As ABA ` +
    `services are individualized to meet the specific needs of each client and treatment decisions are objective and ` +
    `data-based, a plan to discontinue services will be developed by analyzing data available at the time that discharge ` +
    `from services is deemed clinically appropriate.</p>`,
    `<p>Plans for treatment fading will be determined by ${first}'s progress. In the event that ${first} effectively meets ` +
    `all objectives, hours of treatment will be gradually decreased. The BCBA will coordinate team meetings with all the ` +
    `members of the team including the special education teacher and parents before initiating any changes. ${first}'s ` +
    `progress will be periodically reviewed and treatment plans will be designed and changed accordingly. The BCBA will ` +
    `coordinate communication between the parents and school and will continue to review data to ensure progress is ` +
    `maintained after treatment is faded.</p>`,
  ].join("\n");
}

export function buildDischargeCriteriaHtml(clientName: string): string {
  const first = escapeHtml(firstNameOnly(clientName));
  return [
    `<p>Individuals who exit the Smart Steps program leave for a variety of reasons, which include:</p>`,
    `<ul>`,
    `<li>Complete outcome of service: the client's referred excesses and deficits have been addressed and remediated. All ` +
    `problem behaviors identified at entry of service have been addressed and are exhibited within typical ranges.</li>`,
    `<li>Age appropriate ranges of development on standardized testing in the areas of diagnostic criteria, cognition, ` +
    `language (basic speech and language as well as pragmatic language), social problem solving, executive functioning, ` +
    `and adaptive skill functioning have been achieved.</li>`,
    `<li>Family's decision to terminate due to various reasons, including disagreement regarding the client's program.</li>`,
    `<li>Inconsistency by family; failure to follow through with treatment plans as established in the client's program plan.</li>`,
    `<li>Services are deemed no longer appropriate due to minimal progress over a substantial period of time.</li>`,
    `</ul>`,
    `<p>After discharge, the family will be informed that they may contact the local office at any time with additional ` +
    `questions or concerns. The client will not be considered for discharge unless the objectives set out have been met. ` +
    `An appropriate follow up plan will be designed to ensure progress is maintained. Both parents will be provided with ` +
    `the team coordinator/BCBA contact information. The BCBA will remain available to answer parent concerns and ` +
    `questions.</p>`,
  ].join("\n");
}

/** Service recommendations + hour-summary tables (BCBA fills values per client). */
export function buildServiceRecommendationsHtml(): string {
  const services = [
    "1:1 Direct Care Home/ Office", "1:1 Direct Care School", "BCBA 1:1 Direct Care",
    "Social Skills Group", "Supervision", "Treatment Planning", "Parent Training",
  ];
  const recRows = services
    .map((s) => `<tr><td>${escapeHtml(s)}</td><td></td><td></td><td></td></tr>`)
    .join("\n");

  return [
    `<table>`,
    `<thead><tr><th>Service</th><th># Hrs. Presently Receiving</th><th>Recommendation</th><th>Rationale</th></tr></thead>`,
    `<tbody>`, recRows, `</tbody></table>`,
    `<p><strong>Additional Recommendations:</strong> n/a</p>`,
    `<p><strong>Summary of ABA Treatment Hour Recommendations (Hrs. per Week):</strong></p>`,
    `<table><tbody>`,
    `<tr><td>1:1 Direct Care Home/ Office</td><td></td><td>Treatment Planning</td><td></td></tr>`,
    `<tr><td>1:1 Direct Care School</td><td></td><td>Parent Training</td><td></td></tr>`,
    `<tr><td>BCBA 1:1 Direct Care</td><td></td><td>Social Skills Group</td><td></td></tr>`,
    `<tr><td>Supervision (hours per week)</td><td></td><td>Re-assessment</td><td></td></tr>`,
    `</tbody></table>`,
  ].join("\n");
}

/** Current + New daily schedule tables. Current is empty on an initial assessment. */
export function buildScheduleHtml(servicePeriodStart?: string): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const headerRow = `<tr><th></th>${days.map((d) => `<th>${d}</th>`).join("")}</tr>`;
  const emptyRow = (label: string) => `<tr><td>${label}</td>${days.map(() => `<td></td>`).join("")}</tr>`;
  const startLabel = servicePeriodStart?.trim() ? escapeHtml(servicePeriodStart.trim()) : "[start date]";

  return [
    `<p><strong>Current Daily Schedule of ABA 1:1 therapy:</strong></p>`,
    `<table><thead>${headerRow}</thead><tbody>`,
    emptyRow("Home"),
    emptyRow("School"),
    `</tbody></table>`,
    `<p><strong>New Daily Schedule of ABA 1:1 therapy:</strong> Start Date ${startLabel}</p>`,
    `<table><thead>${headerRow}</thead><tbody>`,
    emptyRow("Home"),
    emptyRow("School"),
    `</tbody></table>`,
  ].join("\n");
}

/** Closing contact line + BCBA signature block. */
export function buildSummaryContactHtml(
  provider: ReportBcba,
  generationDate: string,
): string {
  const phone = provider.phone ? escapeHtml(provider.phone) : "[BCBA phone]";
  const email = provider.email ? escapeHtml(provider.email) : "[BCBA email]";
  const name  = escapeHtml(provider.name);

  return [
    `<p>If you have any questions or concerns regarding these recommendations for the client, please contact me at ` +
    `${phone} or via email at ${email}.</p>`,
    `<p>BCBA (Print): <u>${name}</u>&nbsp;&nbsp;&nbsp;&nbsp;Contact: <u>${phone}</u></p>`,
    `<p>BCBA Signature: ______________________________&nbsp;&nbsp;&nbsp;&nbsp;Date: <u>${escapeHtml(generationDate)}</u></p>`,
  ].join("\n");
}

/**
 * Attachment A: Behavior Intervention Plan.
 * Pre-filled from the client's challenging-behavior goals when available
 * (behavior name from the goal title, operational definition from targets);
 * strategy lines stay as editable placeholders. Falls back to two skeleton
 * target-behavior blocks when no behavior goals exist.
 */
export function buildBehaviorPlanHtml(
  allGoals: ReportParentGoal[],
  programs: ReportProgram[],
  clientName: string,
): string {
  const firstName  = firstNameOnly(clientName);
  const programMap = new Map(programs.map((p) => [p.id, p.name]));

  const behaviorGoals = allGoals.filter((g) => {
    const domain = goalDomainString(g, programMap);
    return fixedCategoryIndex(domain) === 2; // CHALLENGING BEHAVIOR
  });

  const block = (n: number, behavior: string, definition: string) => [
    `<p><strong>TARGET BEHAVIOR #${n}:</strong> ${behavior}</p>`,
    `<p>Operational Definition of Behavior: ${definition}</p>`,
    `<p>Function of Behavior: [access to tangible / escape / attention / sensory]</p>`,
    `<p>Reactive Strategies: [e.g., extinction]</p>`,
    `<p>Proactive Strategies: [e.g., warning before transitions]</p>`,
    `<p>Replacement Behaviors to be Taught: [e.g., complying, functional communication]</p>`,
    `<p>Plan for Generalization Across Settings: parents and caregivers will be trained in following this goal</p>`,
  ].join("\n");

  const blocks: string[] = [];
  let n = 1;
  for (const g of behaviorGoals) {
    const def = g.targets.length > 0
      ? g.targets.map((t) => goalText(t.definition, firstName)).join("; ")
      : (g.description ? goalText(g.description, firstName) : "[operational definition]");
    blocks.push(block(n, goalText(g.title, firstName), def));
    n++;
    if (n > 6) break;
  }

  if (blocks.length === 0) {
    blocks.push(block(1, "[behavior name]", "[operational definition]"));
    blocks.push(block(2, "[behavior name]", "[operational definition]"));
  }

  return blocks.join("\n<hr>\n");
}
