import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ sessionId: string }> };

/* ─── Deterministic BT Session Note Generator ───────────────────────────── */

type SessionTargetSummary = {
  targetId:        string;
  targetTitle:     string;
  targetType:      string;
  phase:           string;
  parentGoalTitle: string | null;
  subGoalTitle:    string | null;
  programName:     string | null;
  trialCount:      number;
  correctCount:    number;
  promptedCount:   number;
  incorrectCount:  number;
  noResponseCount: number;
  promptCodes:     Record<string, number>;
  notes:           string[];
  percentage:      number;
};

type BehaviorRecord = {
  type:        string;
  behavior:    string | null;
  antecedent:  string | null;
  consequence: string | null;
  intensity:   string | null;
};

function formatPromptCodes(codes: Record<string, number>): string {
  const entries = Object.entries(codes).filter(([k]) => k !== "INDEPENDENT");
  if (entries.length === 0) return "independent responding";
  return entries
    .map(([k, v]) => `${k.replace(/_/g, " ").toLowerCase()} (${v}×)`)
    .join(", ");
}

function goalLabel(t: SessionTargetSummary): string {
  return t.parentGoalTitle ?? t.programName ?? "General Skills";
}

function generateBTNoteContent(opts: {
  clientName:     string;
  providerName:   string;
  sessionDate:    Date;
  mode:           string;
  sessionTargets: SessionTargetSummary[];
  behaviors:      BehaviorRecord[];
}): { title: string; content: string; recommendations: string; nextSteps: string } {
  const { clientName, providerName, sessionDate, mode, sessionTargets, behaviors } = opts;

  const dateStr  = sessionDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const shortDate = sessionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const modeLabel = mode === "DTT" ? "Discrete Trial Training (DTT)" : mode;

  const totalTrials = sessionTargets.reduce((s, t) => s + t.trialCount, 0);
  const overallPct  = sessionTargets.length > 0
    ? Math.round(sessionTargets.reduce((s, t) => s + t.percentage, 0) / sessionTargets.length)
    : 0;

  /* ── Session Summary ── */
  const summaryParts: string[] = [
    `${clientName} participated in a ${modeLabel} ABA therapy session on ${dateStr} with ${providerName}.`,
    totalTrials > 0
      ? `A total of ${totalTrials} discrete trial${totalTrials !== 1 ? "s" : ""} were administered across ${sessionTargets.length} target${sessionTargets.length !== 1 ? "s" : ""}, with an overall session accuracy of ${overallPct}%.`
      : `No discrete trials were recorded during this session.`,
    `The client demonstrated ${overallPct >= 80 ? "strong" : overallPct >= 60 ? "developing" : "emerging"} skills across targeted areas.`,
  ].filter(Boolean) as string[];

  /* ── Goals Addressed (grouped by parent goal) ── */
  const goalMap = new Map<string, { label: string; targets: SessionTargetSummary[] }>();
  for (const t of sessionTargets) {
    const key   = t.parentGoalTitle ?? t.programName ?? "__general__";
    const label = goalLabel(t);
    if (!goalMap.has(key)) goalMap.set(key, { label, targets: [] });
    goalMap.get(key)!.targets.push(t);
  }

  const goalsLines: string[] = [];
  for (const { label, targets } of goalMap.values()) {
    goalsLines.push(`  • ${label}: ${targets.map((t) => t.targetTitle).join(", ")}`);
  }

  /* ── Progress Per Target ── */
  const progressLines: string[] = [];
  for (const t of sessionTargets) {
    const promptDesc = formatPromptCodes(t.promptCodes);
    const phaseNote  = t.phase === "MASTERED"
      ? " Target met mastery criteria."
      : t.phase === "ACQUISITION"
      ? ""
      : ` (Phase: ${t.phase})`;
    progressLines.push(
      `  • ${t.targetTitle}: ${t.trialCount} trial${t.trialCount !== 1 ? "s" : ""}, ${t.percentage}% accuracy; ${promptDesc}.${phaseNote}${t.notes.length > 0 ? ` Notes: ${t.notes.join("; ")}.` : ""}`
    );
  }

  const masteredTargets = sessionTargets.filter((t) => t.phase === "MASTERED");
  if (masteredTargets.length > 0) {
    progressLines.push(`\n  Mastery Achieved: ${masteredTargets.map((t) => t.targetTitle).join(", ")} met mastery criteria this session.`);
  }

  const newTargets = sessionTargets.filter((t) => t.phase === "NEW" || t.phase === "BASELINE");
  if (newTargets.length > 0) {
    progressLines.push(`\n  New Targets Introduced: ${newTargets.map((t) => t.targetTitle).join(", ")}.`);
  }

  /* ── Behavioral Observations ── */
  const behaviorLines: string[] = [];
  if (behaviors.length > 0) {
    const byType = new Map<string, number>();
    for (const b of behaviors) byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
    for (const [type, count] of byType) {
      behaviorLines.push(`  ${count} ${type.toLowerCase()} behavior event${count !== 1 ? "s" : ""} recorded.`);
    }
    const abcEntries = behaviors.filter((b) => b.antecedent || b.consequence);
    if (abcEntries.length > 0) {
      behaviorLines.push(`  ABC data was collected for ${abcEntries.length} behavior instance${abcEntries.length !== 1 ? "s" : ""}.`);
    }
    behaviorLines.push(`  Behavior intervention plan procedures were implemented as written.`);
  } else {
    behaviorLines.push(
      `  No significant target behaviors were observed during this session.`,
      `  ${clientName} demonstrated appropriate participation and engagement throughout.`,
    );
  }
  behaviorLines.push(
    `  Reinforcement was delivered contingent on appropriate responding and task completion.`,
  );

  /* ── Assemble content ── */
  const sections: string[] = [
    "SESSION SUMMARY",
    summaryParts.join(" "),
    "",
    "GOALS ADDRESSED",
    goalsLines.length > 0 ? goalsLines.join("\n") : "  No targets recorded.",
    "",
    "PROGRESS",
    progressLines.length > 0 ? progressLines.join("\n") : "  No trial data recorded.",
    "",
    "BEHAVIORAL OBSERVATIONS",
    behaviorLines.join("\n"),
  ];

  /* ── Recommendations ── */
  const recLines: string[] = [];
  const lowAcc  = sessionTargets.filter((t) => t.percentage < 60 && t.trialCount >= 3);
  const highAcc = sessionTargets.filter((t) => t.percentage >= 80 && t.trialCount >= 3 && t.phase !== "MASTERED");

  if (masteredTargets.length > 0) {
    recLines.push(`  • Continue maintenance probes for mastered targets: ${masteredTargets.map((t) => t.targetTitle).join(", ")}.`);
  }
  if (lowAcc.length > 0) {
    recLines.push(`  • Review prompt hierarchy and reinforcement schedule for targets below 60% accuracy: ${lowAcc.map((t) => t.targetTitle).join(", ")}.`);
  }
  if (highAcc.length > 0) {
    recLines.push(`  • Consider advancing mastery criteria or introducing generalization probes for high-performing targets: ${highAcc.map((t) => t.targetTitle).join(", ")}.`);
  }
  recLines.push(`  • Continue consistent data collection across all active targets.`);
  recLines.push(`  • Implement behavior intervention plan procedures with fidelity.`);

  /* ── Next Session Focus ── */
  const nextLines: string[] = [];
  const inProgress = sessionTargets.filter((t) => t.phase !== "MASTERED");
  if (inProgress.length > 0) {
    nextLines.push(`  • Continue acquisition targets: ${inProgress.slice(0, 5).map((t) => t.targetTitle).join(", ")}.`);
  }
  if (newTargets.length > 0) {
    nextLines.push(`  • Continue baseline data collection for newly introduced goals.`);
  }
  if (lowAcc.length > 0) {
    nextLines.push(`  • Adjust teaching procedures for targets where accuracy is below 60%.`);
  }
  if (masteredTargets.length > 0) {
    nextLines.push(`  • Identify new skill targets to replace mastered goals as clinically appropriate.`);
  }
  if (nextLines.length === 0) nextLines.push(`  • Continue implementation of current treatment plan.`);

  return {
    title:           `BT Session Note – ${shortDate}`,
    content:         sections.join("\n"),
    recommendations: recLines.join("\n"),
    nextSteps:       nextLines.join("\n"),
  };
}

/* ─── Route handler ──────────────────────────────────────────────────────── */

export async function POST(
  _req: Request,
  { params }: Params
) {
  const user = await requireSession();
  const userId = user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(userId, "smartsteps.notes.create");
  if (denied) return denied;

  const { sessionId } = await params;

  try {
    /* 1. Load session + related data (read-only) */
    const s = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        client: { select: { id: true, name: true } },
        user:   { select: { id: true, name: true } },
        trials: {
          where: { deletedAt: null },
          include: {
            target: {
              select: {
                id:          true,
                definition:  true,
                targetType:  true,
                phase:       true,
                dateMastered: true,
                inMaintenance: true,
                parentGoal:  { select: { id: true, title: true } },
                subGoal:     {
                  select: {
                    id: true, title: true,
                    parentGoal: { select: { id: true, title: true } },
                  },
                },
                program: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        behaviors: {
          orderBy: { createdAt: "asc" },
          select: {
            type:        true,
            behavior:    true,
            antecedent:  true,
            consequence: true,
            intensity:   true,
          },
        },
      },
    });

    if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    /* 2. Aggregate trials by target */
    const grouped = new Map<string, SessionTargetSummary>();

    for (const trial of s.trials) {
      const pg = trial.target.parentGoal ?? trial.target.subGoal?.parentGoal ?? null;
      const key = trial.target.id;
      const existing = grouped.get(key) ?? {
        targetId:        trial.target.id,
        targetTitle:     trial.target.definition,
        targetType:      trial.target.targetType,
        phase:           trial.target.phase,
        parentGoalTitle: pg?.title ?? null,
        subGoalTitle:    trial.target.subGoal?.title ?? null,
        programName:     trial.target.program?.name ?? null,
        trialCount:      0,
        correctCount:    0,
        promptedCount:   0,
        incorrectCount:  0,
        noResponseCount: 0,
        promptCodes:     {},
        notes:           [],
        percentage:      0,
      };

      existing.trialCount += 1;
      if (trial.result === "CORRECT" || trial.result === "INDEPENDENT") existing.correctCount += 1;
      else if (trial.result === "PROMPTED") existing.promptedCount += 1;
      else if (trial.result === "INCORRECT") existing.incorrectCount += 1;
      else existing.noResponseCount += 1;

      const code = trial.promptLevel ?? "INDEPENDENT";
      existing.promptCodes[code] = (existing.promptCodes[code] ?? 0) + 1;
      if (trial.notes?.trim()) existing.notes.push(trial.notes.trim());

      grouped.set(key, existing);
    }

    const sessionTargets: SessionTargetSummary[] = Array.from(grouped.values()).map((t) => ({
      ...t,
      percentage: t.trialCount > 0 ? Math.round((t.correctCount / t.trialCount) * 100) : 0,
      notes:      Array.from(new Set(t.notes)),
    }));

    /* 3. Generate note text — session times are stored on the session record,
       so duration is intentionally omitted from the narrative. */
    const generated = generateBTNoteContent({
      clientName:     s.client.name,
      providerName:   s.user?.name ?? "the assigned therapist",
      sessionDate:    s.startedAt,
      mode:           s.mode,
      sessionTargets,
      behaviors:      s.behaviors,
    });

    /* 5. Save the note */
    const note = await prisma.note.create({
      data: {
        clientId:        s.client.id,
        userId,
        sessionId:       s.id,
        title:           generated.title,
        type:            "BT_SESSION",
        serviceDate:     s.startedAt,
        providerName:    s.user?.name ?? null,
        content:         generated.content,
        recommendations: generated.recommendations,
        nextSteps:       generated.nextSteps,
        isGenerated:     true,
      },
    });

    return NextResponse.json({
      note,
      clientId:  s.client.id,
      sessionId: s.id,
    }, { status: 201 });
  } catch (e) {
    console.error("POST /sessions/[sessionId]/generate-note error:", e);
    return NextResponse.json({ error: "Failed to generate note" }, { status: 500 });
  }
}
