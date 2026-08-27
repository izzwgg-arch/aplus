import type { SessionTargetSummary, BehaviorRecord } from "@/lib/sessionNoteData";
import { bcbaServiceLabelWithCode } from "@/lib/noteTypes";

/**
 * Deterministic BCBA service-note generators.
 *
 * A BCBA note documents a SERVICE, and the narrative has to describe the
 * service that was actually delivered — supervision of a named therapist's
 * session on that date, treatment planning against the current program data,
 * parent training on the goals the caregiver is running. Before this, every
 * service type produced one fixed paragraph with the names swapped in, so a
 * supervision note for Tuesday and one for Thursday read identically and the
 * BCBA had to rewrite both.
 *
 * Deterministic, not model-generated: everything below is derived from rows in
 * the database. A clinical record must never contain an invented number, and a
 * regenerated note must reproduce exactly the same text from the same data.
 */

export type ObservedSession = {
  id:            string;
  startedAt:     Date;
  endedAt:       Date | null;
  mode:          string;
  providerName:  string;
  providerRole:  string | null;
  targets:       SessionTargetSummary[];
  behaviors:     BehaviorRecord[];
};

/** The program-level picture behind planning / meeting / assessment services. */
export type ProgramSnapshot = {
  windowDays:       number;
  activeTargets:    number;
  phaseCounts:      Record<string, number>;
  masteredRecently: string[];
  newTargets:       string[];
  lowAccuracy:      Array<{ title: string; percentage: number; trialCount: number }>;
  highAccuracy:     Array<{ title: string; percentage: number; trialCount: number }>;
  totalTrials:      number;
  overallPct:       number | null;
  domains:          string[];
  sessionCount:     number;
  providers:        string[];
};

export type GeneratedNote = {
  title:           string;
  content:         string;
  recommendations: string;
  nextSteps:       string;
};

export type GenerateInput = {
  serviceType:     string;
  clientName:      string;
  bcbaName:        string;
  serviceDate:     Date;
  /** Minutes the clinic's clock is behind UTC on the service date (browser value). */
  tzOffsetMinutes: number;
  sessions:        ObservedSession[];
  program:         ProgramSnapshot;
};

/* ── Clinic-local date/time formatting ────────────────────────────────────── */

/**
 * Server time is not clinic time, so every date and time in the narrative is
 * rendered through the offset the browser reported for the service date. The
 * instant is shifted into the clinic's wall clock and then read in UTC.
 */
function clinicLocal(date: Date, tzOffsetMinutes: number): Date {
  return new Date(date.getTime() - tzOffsetMinutes * 60_000);
}

function fmtLongDate(date: Date, tz: number): string {
  return clinicLocal(date, tz).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtShortDate(date: Date, tz: number): string {
  return clinicLocal(date, tz).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function fmtTime(date: Date, tz: number): string {
  return clinicLocal(date, tz).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
  });
}

/** "3:00 PM – 5:00 PM (2 hrs)" for a session window, or "" when it has no end. */
function fmtWindow(s: ObservedSession, tz: number): string {
  const start = fmtTime(s.startedAt, tz);
  if (!s.endedAt) return start;
  const minutes = Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60_000);
  const hours = Math.round((minutes / 60) * 100) / 100;
  const hoursText = `${hours.toFixed(2).replace(/\.?0+$/, "")} ${hours === 1 ? "hr" : "hrs"}`;
  const plausible = minutes > 0 && minutes <= 8 * 60;
  return `${start} – ${fmtTime(s.endedAt, tz)}${plausible ? ` (${hoursText})` : ""}`;
}

function modeLabel(mode: string): string {
  return mode === "DTT" ? "Discrete Trial Training (DTT)"
    : mode === "INTERVAL" ? "interval recording"
    : mode === "ABC" ? "ABC narrative recording"
    : mode;
}

/* ── Shared derivations ───────────────────────────────────────────────────── */

/** Only goals with trials count toward accuracy — a zero-trial goal would score 0%. */
function scored(targets: SessionTargetSummary[]): SessionTargetSummary[] {
  return targets.filter((t) => t.trialCount > 0);
}

function overallPct(targets: SessionTargetSummary[]): number | null {
  const s = scored(targets);
  if (s.length === 0) return null;
  return Math.round(s.reduce((sum, t) => sum + t.percentage, 0) / s.length);
}

function totalTrials(targets: SessionTargetSummary[]): number {
  return scored(targets).reduce((sum, t) => sum + t.trialCount, 0);
}

function allTargets(sessions: ObservedSession[]): SessionTargetSummary[] {
  return sessions.flatMap((s) => s.targets);
}

function goalLabel(t: SessionTargetSummary): string {
  return t.parentGoalTitle ?? t.programName ?? "General Skills";
}

function formatPromptCodes(codes: Record<string, number>): string {
  const entries = Object.entries(codes).filter(([k]) => k !== "INDEPENDENT");
  if (entries.length === 0) return "independent responding";
  return entries.map(([k, v]) => `${k.replace(/_/g, " ").toLowerCase()} (${v}×)`).join(", ");
}

/** "  • Tacting common objects: 12 trials, 83% accuracy; gestural prompt (2×)." */
function targetLines(targets: SessionTargetSummary[]): string[] {
  const lines: string[] = [];
  const byGoal = new Map<string, SessionTargetSummary[]>();
  for (const t of targets) {
    const key = goalLabel(t);
    if (!byGoal.has(key)) byGoal.set(key, []);
    byGoal.get(key)!.push(t);
  }
  for (const [label, list] of byGoal) {
    lines.push(`  ${label}`);
    for (const t of list) {
      if (t.trialCount > 0) {
        const phaseNote = t.phase === "MASTERED" ? " Met mastery criteria." : "";
        lines.push(
          `    • ${t.targetTitle}: ${t.trialCount} trial${t.trialCount !== 1 ? "s" : ""}, ` +
          `${t.percentage}% accuracy; ${formatPromptCodes(t.promptCodes)}.${phaseNote}` +
          `${t.notes.length > 0 ? ` Notes: ${t.notes.join("; ")}.` : ""}`
        );
      } else {
        lines.push(
          `    • ${t.targetTitle}: addressed without formal trial data.` +
          `${t.addedNote ? ` ${t.addedNote}` : ""}`
        );
      }
    }
  }
  return lines;
}

function behaviorLines(sessions: ObservedSession[], clientName: string): string[] {
  const behaviors = sessions.flatMap((s) => s.behaviors);
  const lines: string[] = [];
  if (behaviors.length === 0) {
    lines.push(`  No significant target behaviors were recorded during the observed session${sessions.length > 1 ? "s" : ""}.`);
    lines.push(`  ${clientName} demonstrated appropriate participation and engagement throughout.`);
    return lines;
  }
  const byType = new Map<string, number>();
  for (const b of behaviors) byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
  for (const [type, count] of byType) {
    lines.push(`  ${count} ${type.toLowerCase()} behavior event${count !== 1 ? "s" : ""} recorded.`);
  }
  const abc = behaviors.filter((b) => b.antecedent || b.consequence);
  if (abc.length > 0) {
    lines.push(`  ABC data was collected for ${abc.length} instance${abc.length !== 1 ? "s" : ""} and reviewed with the therapist.`);
  }
  lines.push(`  Behavior intervention plan procedures were implemented as written.`);
  return lines;
}

function lowPerformers(targets: SessionTargetSummary[]): SessionTargetSummary[] {
  return scored(targets).filter((t) => t.percentage < 60 && t.trialCount >= 3);
}

function highPerformers(targets: SessionTargetSummary[]): SessionTargetSummary[] {
  return scored(targets).filter((t) => t.percentage >= 80 && t.trialCount >= 3 && t.phase !== "MASTERED");
}

function masteredIn(targets: SessionTargetSummary[]): SessionTargetSummary[] {
  return targets.filter((t) => t.phase === "MASTERED");
}

function joinTitles(list: Array<{ targetTitle: string }>, max = 6): string {
  const titles = list.slice(0, max).map((t) => t.targetTitle);
  const extra = list.length - titles.length;
  return titles.join(", ") + (extra > 0 ? `, and ${extra} other${extra !== 1 ? "s" : ""}` : "");
}

function section(heading: string, body: string[] | string): string[] {
  const lines = Array.isArray(body) ? body : [body];
  if (lines.length === 0 || lines.every((l) => !l.trim())) return [];
  return [heading, ...lines, ""];
}

/** The line every service type opens with when no session data backs it up. */
function noSessionLine(serviceLabel: string, clientName: string, dateStr: string): string {
  return `No session data was recorded for ${clientName} on ${dateStr}, so this ${serviceLabel} note documents the service without reference to same-day session data.`;
}

/* ── Per-service generators ───────────────────────────────────────────────── */

function generateSupervision(input: GenerateInput): GeneratedNote {
  const { clientName, bcbaName, serviceDate, tzOffsetMinutes: tz, sessions } = input;
  const dateStr = fmtLongDate(serviceDate, tz);
  const targets = allTargets(sessions);
  const pct = overallPct(targets);
  const trials = totalTrials(targets);
  const therapists = Array.from(new Set(sessions.map((s) => s.providerName)));

  const summary: string[] = [];
  if (sessions.length === 0) {
    summary.push(noSessionLine("direct supervision", clientName, dateStr));
    summary.push(`${bcbaName} provided direct supervision of ABA therapy services for ${clientName}, reviewed program data, and provided feedback to the treatment team.`);
  } else {
    summary.push(
      `On ${dateStr}, ${bcbaName} conducted direct supervision (DSU) of ABA therapy services delivered to ${clientName} by ` +
      `${therapists.join(" and ")}${sessions[0].providerRole ? `, ${sessions[0].providerRole}` : ""}.`
    );
    summary.push(
      sessions.length === 1
        ? `Supervision covered the ${fmtWindow(sessions[0], tz)} ${modeLabel(sessions[0].mode)} session.`
        : `Supervision covered ${sessions.length} sessions: ${sessions.map((s) => fmtWindow(s, tz)).join("; ")}.`
    );
    summary.push(
      trials > 0
        ? `${trials} trial${trials !== 1 ? "s were" : " was"} administered across ${scored(targets).length} target${scored(targets).length !== 1 ? "s" : ""}, with an overall accuracy of ${pct}%.`
        : `No trial data was recorded during the observed session${sessions.length > 1 ? "s" : ""}.`
    );
    summary.push(
      `The BCBA observed therapist implementation of treatment procedures, reviewed the data collected during the session, and provided corrective and positive feedback to support procedural fidelity.`
    );
  }

  const observed: string[] = sessions.map((s) => {
    const st = scored(s.targets);
    return `  • ${s.providerName}${s.providerRole ? ` (${s.providerRole})` : ""} — ${fmtWindow(s, tz)}, ${modeLabel(s.mode)}; ` +
      `${totalTrials(s.targets)} trial${totalTrials(s.targets) !== 1 ? "s" : ""} across ${st.length} target${st.length !== 1 ? "s" : ""}` +
      `${overallPct(s.targets) !== null ? `, ${overallPct(s.targets)}% accuracy` : ""}.`;
  });

  const feedback: string[] = [];
  const low = lowPerformers(targets);
  const high = highPerformers(targets);
  const mastered = masteredIn(targets);
  if (sessions.length > 0) {
    feedback.push(`  Procedural fidelity was observed across the goals listed above; teaching procedures, prompting and reinforcement delivery were reviewed in vivo.`);
    if (low.length > 0) {
      feedback.push(`  Feedback was provided on prompt hierarchy and error-correction for goals responding below 60%: ${joinTitles(low)}.`);
    }
    if (high.length > 0) {
      feedback.push(`  Performance at or above 80% was reviewed for advancement: ${joinTitles(high)}.`);
    }
    if (mastered.length > 0) {
      feedback.push(`  Mastery criteria were verified for: ${joinTitles(mastered)}.`);
    }
    feedback.push(`  Data collection accuracy was reviewed with the therapist and clinical direction was documented.`);
  }

  const content = [
    ...section("SERVICE SUMMARY", summary.join(" ")),
    ...section("SESSION SUPERVISED", observed),
    ...section("GOALS OBSERVED", targetLines(targets)),
    ...(sessions.length > 0 ? section("BEHAVIOR DURING SUPERVISION", behaviorLines(sessions, clientName)) : []),
    ...section("SUPERVISION AND FEEDBACK", feedback),
  ].join("\n").trimEnd();

  const recs: string[] = [];
  if (low.length > 0)  recs.push(`  • Adjust prompt fading and reinforcement schedule for: ${joinTitles(low)}.`);
  if (high.length > 0) recs.push(`  • Advance mastery criteria or begin generalization probes for: ${joinTitles(high)}.`);
  if (mastered.length > 0) recs.push(`  • Move mastered goals to maintenance probes: ${joinTitles(mastered)}.`);
  recs.push(`  • Continue implementation of the behavior intervention plan with fidelity.`);
  recs.push(`  • Continue consistent data collection across all active goals.`);

  const next: string[] = [];
  if (therapists.length > 0) next.push(`  • Follow up with ${therapists.join(" and ")} on the feedback documented above.`);
  if (low.length > 0)  next.push(`  • Re-observe the goals below criteria at the next supervision.`);
  next.push(`  • Continue scheduled direct supervision and review of session data.`);

  return {
    title:           `Direct Supervision Note – ${fmtShortDate(serviceDate, tz)}`,
    content,
    recommendations: recs.join("\n"),
    nextSteps:       next.join("\n"),
  };
}

function generateTreatmentPlanning(input: GenerateInput): GeneratedNote {
  const { clientName, bcbaName, serviceDate, tzOffsetMinutes: tz, sessions, program } = input;
  const dateStr = fmtLongDate(serviceDate, tz);
  const targets = allTargets(sessions);

  const summary: string[] = [
    `On ${dateStr}, ${bcbaName} completed treatment planning (TP) for ${clientName}.`,
    program.totalTrials > 0
      ? `The current treatment program was reviewed against the last ${program.windowDays} days of data: ${program.totalTrials} trial${program.totalTrials !== 1 ? "s" : ""} recorded across ${program.sessionCount} session${program.sessionCount !== 1 ? "s" : ""}, with an overall accuracy of ${program.overallPct}%.`
      : `No trial data has been recorded in the last ${program.windowDays} days; planning was completed against the current program structure.`,
    `Goals and targets were reviewed and updated based on recent session data, mastery criteria and teaching procedures were evaluated for clinical appropriateness, and the behavior intervention plan was reviewed.`,
  ];
  if (sessions.length > 0) {
    summary.push(`Same-day session data from ${Array.from(new Set(sessions.map((s) => s.providerName))).join(" and ")} was included in this review.`);
  }

  const status: string[] = [
    `  • Active goals: ${program.activeTargets}${
      Object.keys(program.phaseCounts).length > 0
        ? ` (${Object.entries(program.phaseCounts).map(([p, c]) => `${p.toLowerCase()} ${c}`).join(", ")})`
        : ""
    }.`,
  ];
  if (program.domains.length > 0) status.push(`  • Domains addressed: ${program.domains.join(", ")}.`);
  if (program.providers.length > 0) status.push(`  • Providers delivering service: ${program.providers.join(", ")}.`);

  const review: string[] = [];
  if (program.masteredRecently.length > 0) {
    review.push(`  • Mastered in the review period: ${program.masteredRecently.slice(0, 8).join(", ")}. These move to maintenance probes.`);
  }
  if (program.highAccuracy.length > 0) {
    review.push(`  • At or above 80% and ready for advancement: ${program.highAccuracy.slice(0, 8).map((t) => `${t.title} (${t.percentage}%)`).join(", ")}.`);
  }
  if (program.lowAccuracy.length > 0) {
    review.push(`  • Below 60% and requiring modification of teaching procedures: ${program.lowAccuracy.slice(0, 8).map((t) => `${t.title} (${t.percentage}%)`).join(", ")}.`);
  }
  if (program.newTargets.length > 0) {
    review.push(`  • Newly opened goals awaiting baseline data: ${program.newTargets.slice(0, 8).join(", ")}.`);
  }
  if (review.length === 0) review.push(`  • No goals met criteria for advancement or modification during this review period.`);

  const content = [
    ...section("SERVICE SUMMARY", summary.join(" ")),
    ...section("PROGRAM STATUS", status),
    ...section("GOALS REVIEWED", review),
    ...(targets.length > 0 ? section("SAME-DAY SESSION DATA", targetLines(targets)) : []),
  ].join("\n").trimEnd();

  const recs: string[] = [];
  if (program.lowAccuracy.length > 0) recs.push(`  • Modify prompting and reinforcement procedures for goals below 60%.`);
  if (program.highAccuracy.length > 0) recs.push(`  • Advance criteria or introduce generalization for goals at or above 80%.`);
  if (program.masteredRecently.length > 0) recs.push(`  • Begin maintenance probes for newly mastered goals.`);
  if (program.newTargets.length > 0) recs.push(`  • Collect baseline data on newly opened goals.`);
  recs.push(`  • Continue the current behavior intervention plan and review at the next planning session.`);

  const next: string[] = [
    `  • Communicate program changes to the treatment team.`,
    `  • Monitor the goals modified above at the next data review.`,
  ];
  if (program.activeTargets === 0) next.push(`  • Open initial goals so data collection can begin.`);

  return {
    title:           `Treatment Planning Note – ${fmtShortDate(serviceDate, tz)}`,
    content,
    recommendations: recs.join("\n"),
    nextSteps:       next.join("\n"),
  };
}

function generateParentTraining(input: GenerateInput): GeneratedNote {
  const { clientName, bcbaName, serviceDate, tzOffsetMinutes: tz, sessions, program } = input;
  const dateStr = fmtLongDate(serviceDate, tz);
  const targets = allTargets(sessions);
  const focus = scored(targets).length > 0
    ? scored(targets)
    : [];

  const summary: string[] = [
    `On ${dateStr}, ${bcbaName} provided parent/caregiver training (PRT) for the family of ${clientName}.`,
    `ABA strategies and intervention procedures were reviewed, modeled, and practiced with the caregiver, and feedback was provided on implementation.`,
  ];
  if (sessions.length > 0) {
    const trials = totalTrials(targets);
    summary.push(
      `Training was anchored to the ${fmtWindow(sessions[0], tz)} session run by ${Array.from(new Set(sessions.map((s) => s.providerName))).join(" and ")}` +
      `${trials > 0 ? `, in which ${trials} trial${trials !== 1 ? "s were" : " was"} recorded at ${overallPct(targets)}% accuracy` : ""}.`
    );
  } else {
    summary.push(`Training was anchored to ${clientName}'s current treatment goals and recent session data.`);
  }

  const goalsForCaregiver: string[] = [];
  if (focus.length > 0) {
    goalsForCaregiver.push(`  Goals reviewed with the caregiver, using the same procedures the treatment team runs:`);
    goalsForCaregiver.push(...targetLines(focus));
  } else if (program.highAccuracy.length > 0 || program.lowAccuracy.length > 0) {
    goalsForCaregiver.push(`  Goals reviewed with the caregiver, drawn from the last ${program.windowDays} days of data:`);
    for (const t of [...program.highAccuracy.slice(0, 4), ...program.lowAccuracy.slice(0, 4)]) {
      goalsForCaregiver.push(`    • ${t.title} — currently at ${t.percentage}% across ${t.trialCount} trial${t.trialCount !== 1 ? "s" : ""}.`);
    }
  } else {
    goalsForCaregiver.push(`  No recent trial data was available; training covered the current treatment goals and general strategy implementation.`);
  }

  const training: string[] = [
    `  Antecedent strategies, prompting and prompt fading, and reinforcement delivery were modeled by the BCBA and rehearsed by the caregiver.`,
    `  The caregiver demonstrated emerging to competent implementation and questions were addressed.`,
    `  Home programming recommendations and generalization opportunities were discussed.`,
  ];
  const lows = lowPerformers(targets);
  if (lows.length > 0) {
    training.push(`  Additional practice focused on goals currently below criteria: ${joinTitles(lows)}.`);
  }

  const content = [
    ...section("SERVICE SUMMARY", summary.join(" ")),
    ...section("GOALS ADDRESSED IN TRAINING", goalsForCaregiver),
    ...section("TRAINING PROVIDED", training),
    ...(sessions.length > 0 ? section("BEHAVIOR OBSERVED", behaviorLines(sessions, clientName)) : []),
  ].join("\n").trimEnd();

  const recs: string[] = [
    `  • Caregiver to implement the reviewed procedures during identified daily routines.`,
  ];
  if (lows.length > 0) recs.push(`  • Focus home practice on: ${joinTitles(lows)}.`);
  if (masteredIn(targets).length > 0) recs.push(`  • Generalize mastered goals to the home setting: ${joinTitles(masteredIn(targets))}.`);
  recs.push(`  • Continue scheduled parent training sessions.`);

  return {
    title:           `Parent Training Note – ${fmtShortDate(serviceDate, tz)}`,
    content,
    recommendations: recs.join("\n"),
    nextSteps: [
      `  • Review caregiver implementation and barriers at the next parent training session.`,
      `  • Adjust home programming based on the caregiver's report and session data.`,
    ].join("\n"),
  };
}

function generateTeamMeeting(input: GenerateInput): GeneratedNote {
  const { clientName, bcbaName, serviceDate, tzOffsetMinutes: tz, sessions, program } = input;
  const dateStr = fmtLongDate(serviceDate, tz);
  const targets = allTargets(sessions);
  const team = Array.from(new Set([...sessions.map((s) => s.providerName), ...program.providers]));

  const summary: string[] = [
    `On ${dateStr}, ${bcbaName} participated in a team meeting (TM) regarding the treatment program for ${clientName}.`,
    team.length > 0 ? `Team members involved in service delivery: ${team.join(", ")}.` : "",
    program.totalTrials > 0
      ? `Progress was reviewed against the last ${program.windowDays} days of data: ${program.totalTrials} trial${program.totalTrials !== 1 ? "s" : ""} across ${program.sessionCount} session${program.sessionCount !== 1 ? "s" : ""} at ${program.overallPct}% overall accuracy.`
      : `No trial data was available for the last ${program.windowDays} days; the meeting addressed program structure and service delivery.`,
    `Topics discussed included progress toward goals and targets, data review, and coordination of services among team members.`,
  ].filter(Boolean);

  const discussion: string[] = [];
  if (program.masteredRecently.length > 0) discussion.push(`  • Goals mastered since the last review: ${program.masteredRecently.slice(0, 8).join(", ")}.`);
  if (program.lowAccuracy.length > 0) discussion.push(`  • Goals below criteria requiring team attention: ${program.lowAccuracy.slice(0, 8).map((t) => `${t.title} (${t.percentage}%)`).join(", ")}.`);
  if (program.newTargets.length > 0) discussion.push(`  • Newly opened goals introduced to the team: ${program.newTargets.slice(0, 8).join(", ")}.`);
  if (sessions.length > 0) discussion.push(`  • Same-day session data was reviewed with the treating therapist.`);
  if (discussion.length === 0) discussion.push(`  • Current programming was reviewed; no changes were indicated at this time.`);

  const content = [
    ...section("SERVICE SUMMARY", summary.join(" ")),
    ...section("ITEMS DISCUSSED", discussion),
    ...(targets.length > 0 ? section("SESSION DATA REVIEWED", targetLines(targets)) : []),
  ].join("\n").trimEnd();

  return {
    title:           `Team Meeting Note – ${fmtShortDate(serviceDate, tz)}`,
    content,
    recommendations: [
      `  • Team to implement the programming decisions documented above with fidelity.`,
      `  • Maintain consistent data collection across all providers.`,
    ].join("\n"),
    nextSteps: [
      `  • Distribute action items to the treatment team.`,
      `  • Review outcomes at the next scheduled team meeting.`,
    ].join("\n"),
  };
}

function generateAssessment(input: GenerateInput): GeneratedNote {
  const { clientName, bcbaName, serviceDate, tzOffsetMinutes: tz, sessions, program } = input;
  const dateStr = fmtLongDate(serviceDate, tz);
  const targets = allTargets(sessions);

  const summary: string[] = [
    `On ${dateStr}, ${bcbaName} conducted assessment activities (ASSES) for ${clientName}.`,
    `Assessment activities were administered, observed, and scored according to standardized procedures, and results were documented for use in treatment planning.`,
    program.totalTrials > 0
      ? `Current programming data from the last ${program.windowDays} days was reviewed alongside the assessment: ${program.totalTrials} trial${program.totalTrials !== 1 ? "s" : ""} at ${program.overallPct}% overall accuracy across ${program.activeTargets} active goal${program.activeTargets !== 1 ? "s" : ""}.`
      : `No recent trial data was available; the assessment establishes the baseline for programming.`,
  ];
  if (sessions.length > 0) {
    summary.push(`Direct observation was conducted during the ${fmtWindow(sessions[0], tz)} session with ${sessions[0].providerName}.`);
  }

  const findings: string[] = [];
  if (program.masteredRecently.length > 0) findings.push(`  • Mastered skills confirmed: ${program.masteredRecently.slice(0, 8).join(", ")}.`);
  if (program.highAccuracy.length > 0) findings.push(`  • Emerging strengths: ${program.highAccuracy.slice(0, 6).map((t) => `${t.title} (${t.percentage}%)`).join(", ")}.`);
  if (program.lowAccuracy.length > 0) findings.push(`  • Areas of continued need: ${program.lowAccuracy.slice(0, 6).map((t) => `${t.title} (${t.percentage}%)`).join(", ")}.`);
  if (program.domains.length > 0) findings.push(`  • Domains assessed: ${program.domains.join(", ")}.`);
  if (findings.length === 0) findings.push(`  • Findings were documented for use in the assessment report.`);

  const content = [
    ...section("SERVICE SUMMARY", summary.join(" ")),
    ...section("FINDINGS AND DATA REVIEWED", findings),
    ...(targets.length > 0 ? section("DIRECT OBSERVATION DATA", targetLines(targets)) : []),
  ].join("\n").trimEnd();

  return {
    title:           `Assessment Note – ${fmtShortDate(serviceDate, tz)}`,
    content,
    recommendations: [
      `  • Incorporate assessment findings into the treatment plan and goal selection.`,
      `  • Continue data collection on active goals pending the assessment report.`,
    ].join("\n"),
    nextSteps: [
      `  • Complete scoring and finalize the assessment report.`,
      `  • Review results with the caregiver and the treatment team.`,
    ].join("\n"),
  };
}

/* ── Entry point ──────────────────────────────────────────────────────────── */

/**
 * Builds the narrative for one BCBA service note. The service type decides the
 * generator — a supervision note describes the therapist's session, a planning
 * note describes the program review, a parent-training note describes the
 * caregiver training — so switching the note-type dropdown produces genuinely
 * different documentation rather than the same paragraph relabelled.
 */
export function generateBcbaNote(input: GenerateInput): GeneratedNote {
  switch (input.serviceType) {
    case "DSU":   return generateSupervision(input);
    case "TP":    return generateTreatmentPlanning(input);
    case "PRT":   return generateParentTraining(input);
    case "TM":    return generateTeamMeeting(input);
    case "ASSES": return generateAssessment(input);
    default: {
      const label = bcbaServiceLabelWithCode(input.serviceType) || "clinical services";
      return {
        title:   `BCBA Note – ${fmtShortDate(input.serviceDate, input.tzOffsetMinutes)}`,
        content: `${input.bcbaName} provided ${label} for ${input.clientName} on ${fmtLongDate(input.serviceDate, input.tzOffsetMinutes)}.`,
        recommendations: "",
        nextSteps: "",
      };
    }
  }
}
