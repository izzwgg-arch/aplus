import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import {
  loadSessionForNote,
  summarizeSessionTargets,
  type SessionTargetSummary,
  type BehaviorRecord,
} from "@/lib/sessionNoteData";

type Params = { params: Promise<{ sessionId: string }> };

/* ─── Deterministic BT Session Note Generator ───────────────────────────────
   The session query and the per-goal aggregation live in @/lib/sessionNoteData
   so this note and the BCBA service note written ABOUT the same session can
   never report different numbers. ─────────────────────────────────────────── */

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

  const dateStr   = sessionDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const shortDate = sessionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const modeLabel = mode === "DTT" ? "Discrete Trial Training (DTT)" : mode;

  /* Only goals that actually have trials count toward the session's accuracy —
     a goal attached by hand with no data would otherwise score 0% and drag the
     whole session average down. */
  const scoredTargets = sessionTargets.filter((t) => t.trialCount > 0);
  const addedOnly     = sessionTargets.filter((t) => t.trialCount === 0);
  const totalTrials = scoredTargets.reduce((s, t) => s + t.trialCount, 0);
  const overallPct  = scoredTargets.length > 0
    ? Math.round(scoredTargets.reduce((s, t) => s + t.percentage, 0) / scoredTargets.length)
    : 0;

  /* ── Summary: one sentence of context, one of data. ── */
  const summaryParts: string[] = [
    `${clientName} attended a ${modeLabel} session on ${dateStr} with ${providerName}.`,
    totalTrials > 0
      ? `${totalTrials} trial${totalTrials !== 1 ? "s" : ""} across ${scoredTargets.length} goal${scoredTargets.length !== 1 ? "s" : ""}, ${overallPct}% overall accuracy.`
      : `No trial data was recorded.`,
    addedOnly.length > 0
      ? `${addedOnly.length} additional goal${addedOnly.length !== 1 ? "s were" : " was"} addressed without data.`
      : "",
  ].filter(Boolean) as string[];

  /* ── One line per goal: the numbers, nothing restated. ── */
  const goalLines: string[] = [];
  for (const t of scoredTargets) {
    const prompts   = formatPromptCodes(t.promptCodes);
    const phaseNote = t.phase === "MASTERED" ? " Mastery criteria met." : "";
    goalLines.push(
      `  • ${t.targetTitle} (${goalLabel(t)}): ${t.trialCount} trial${t.trialCount !== 1 ? "s" : ""}, ${t.percentage}%, ${prompts}.${phaseNote}${t.notes.length > 0 ? ` ${t.notes.join("; ")}.` : ""}`
    );
  }
  /* Goals worked on without trial data still belong in the note — they were
     part of the session, they are just reported qualitatively. */
  for (const t of addedOnly) {
    goalLines.push(
      `  • ${t.targetTitle} (${goalLabel(t)}): addressed, no data.${t.addedNote ? ` ${t.addedNote}` : ""}`
    );
  }

  const masteredTargets = scoredTargets.filter((t) => t.phase === "MASTERED");
  const newTargets      = scoredTargets.filter((t) => t.phase === "NEW" || t.phase === "BASELINE");

  /* ── Behavior: only what was actually recorded. ── */
  let behaviorLine: string;
  if (behaviors.length > 0) {
    const byType = new Map<string, number>();
    for (const b of behaviors) byType.set(b.type, (byType.get(b.type) ?? 0) + 1);
    const counts = Array.from(byType).map(([type, count]) => `${count} ${type.toLowerCase()}`).join(", ");
    const abc = behaviors.filter((b) => b.antecedent || b.consequence).length;
    behaviorLine = `  Behavior events: ${counts}.${abc > 0 ? ` ABC data collected on ${abc}.` : ""} BIP procedures implemented as written.`;
  } else {
    behaviorLine = `  No target behaviors observed. ${clientName} participated appropriately throughout.`;
  }

  const sections: string[] = [
    "SESSION SUMMARY",
    summaryParts.join(" "),
    "",
    "GOALS & DATA",
    goalLines.length > 0 ? goalLines.join("\n") : "  No goals recorded.",
    "",
    "BEHAVIOR",
    behaviorLine,
  ];

  /* ── Recommendations: data-driven only; one fallback when there is nothing
     the data says. ── */
  const recLines: string[] = [];
  const lowAcc  = scoredTargets.filter((t) => t.percentage < 60 && t.trialCount >= 3);
  const highAcc = scoredTargets.filter((t) => t.percentage >= 80 && t.trialCount >= 3 && t.phase !== "MASTERED");

  if (lowAcc.length > 0) {
    recLines.push(`  • Review prompting and reinforcement below 60%: ${lowAcc.map((t) => t.targetTitle).join(", ")}.`);
  }
  if (highAcc.length > 0) {
    recLines.push(`  • Consider advancing or probing generalization at or above 80%: ${highAcc.map((t) => t.targetTitle).join(", ")}.`);
  }
  if (masteredTargets.length > 0) {
    recLines.push(`  • Begin maintenance probes: ${masteredTargets.map((t) => t.targetTitle).join(", ")}.`);
  }
  if (recLines.length === 0) {
    recLines.push(`  • Continue the current treatment plan as written.`);
  }

  /* ── Next session: at most two concrete items. ── */
  const nextLines: string[] = [];
  if (addedOnly.length > 0) {
    nextLines.push(`  • Collect data on: ${addedOnly.slice(0, 3).map((t) => t.targetTitle).join(", ")}.`);
  }
  if (lowAcc.length > 0) {
    nextLines.push(`  • Adjust teaching procedures for targets below 60%.`);
  } else if (newTargets.length > 0) {
    nextLines.push(`  • Continue baseline data collection on newly introduced goals.`);
  } else if (masteredTargets.length > 0) {
    nextLines.push(`  • Identify replacement targets for mastered goals.`);
  }
  if (nextLines.length === 0) {
    const inProgress = sessionTargets.filter((t) => t.phase !== "MASTERED");
    nextLines.push(
      inProgress.length > 0
        ? `  • Continue acquisition targets: ${inProgress.slice(0, 3).map((t) => t.targetTitle).join(", ")}.`
        : `  • Continue implementation of the current treatment plan.`
    );
  }

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
    const s = await loadSessionForNote(sessionId);

    if (!s || s.deletedAt) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    /* 2. Aggregate trials by target, merging in hand-attached goals */
    const sessionTargets: SessionTargetSummary[] = summarizeSessionTargets(s);

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
