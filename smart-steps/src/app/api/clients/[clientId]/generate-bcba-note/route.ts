import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse, requireClientAccessResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import {
  loadClientSessionsInRange,
  summarizeSessionTargets,
  type SessionWithNoteData,
} from "@/lib/sessionNoteData";
import {
  generateBcbaNote,
  type ObservedSession,
  type ProgramSnapshot,
} from "@/lib/bcbaNoteGenerators";

type Params = { params: Promise<{ clientId: string }> };

const VALID_BCBA = ["DSU", "TM", "TP", "PRT", "ASSES"];
const DEFAULT_WINDOW_DAYS = 30;

/**
 * POST /smart-steps/api/clients/[clientId]/generate-bcba-note
 *
 * Builds the narrative for a BCBA service note FROM THE DATA — the supervised
 * therapist's session on that service date, plus the program picture behind
 * planning / meeting / assessment services — and returns it WITHOUT saving.
 * The BCBA reviews and edits in the note editor and saves through the ordinary
 * note routes, so nothing is written to the clinical record by generating.
 *
 * Body:
 *   serviceType      DSU | TM | TP | PRT | ASSES
 *   serviceDate      "YYYY-MM-DD" — the clinic's day, not a UTC instant
 *   tzOffsetMinutes  the browser's offset FOR that date (DST-correct)
 *   btUserId         the therapist whose session is being supervised (optional)
 *   sessionId        an exact session, when the caller already knows it
 *   windowDays       program-data lookback (default 30)
 */
export async function POST(req: Request, { params }: Params) {
  const user = await requireSession();
  const userId = user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(userId, "smartsteps.notes.create");
  if (denied) return denied;

  const { clientId } = await params;
  const clientDenied = await requireClientAccessResponse(userId, clientId, "smartsteps.notes.view");
  if (clientDenied) return clientDenied;

  try {
    const body = await req.json() as {
      serviceType?:     string;
      serviceDate?:     string;
      tzOffsetMinutes?: number;
      btUserId?:        string | null;
      sessionId?:       string | null;
      windowDays?:      number;
    };

    const serviceType = body.serviceType ?? "";
    if (!VALID_BCBA.includes(serviceType))
      return NextResponse.json({ error: "Invalid BCBA service type" }, { status: 400 });

    if (!body.serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate))
      return NextResponse.json({ error: "serviceDate (YYYY-MM-DD) required" }, { status: 400 });

    /* The service date is a CLINIC day. The browser sends its offset for that
       date so the day window is the clinic's midnight-to-midnight, not the
       server's — the server's timezone is not the clinic's. */
    const tz = Number.isFinite(body.tzOffsetMinutes) ? Number(body.tzOffsetMinutes) : 0;
    const dayStart = new Date(Date.parse(`${body.serviceDate}T00:00:00Z`) + tz * 60_000);
    const dayEnd   = new Date(dayStart.getTime() + 24 * 60 * 60_000 - 1);
    /* Noon of the clinic day — a stable instant to render the date from. */
    const serviceDate = new Date(dayStart.getTime() + 12 * 60 * 60_000);

    const windowDays = Math.min(Math.max(Number(body.windowDays) || DEFAULT_WINDOW_DAYS, 1), 365);
    const windowStart = new Date(dayEnd.getTime() - windowDays * 24 * 60 * 60_000);

    const client = await prisma.client.findUnique({
      where:  { id: clientId },
      select: { id: true, name: true },
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    /* ── 1. The session(s) the service was delivered around ───────────────── */
    const rawSessions = await loadClientSessionsInRange({
      clientId,
      from:      dayStart,
      to:        dayEnd,
      userId:    body.btUserId || null,
      sessionId: body.sessionId || null,
    });

    const sessions: ObservedSession[] = rawSessions.map((s: SessionWithNoteData) => ({
      id:           s.id,
      startedAt:    s.startedAt,
      endedAt:      s.endedAt,
      mode:         s.mode,
      providerName: s.user?.name ?? "the assigned therapist",
      providerRole: s.user?.displayRole ?? (s.user?.role === "RBT" ? "BT/RBT" : s.user?.role ?? null),
      targets:      summarizeSessionTargets(s),
      behaviors:    s.behaviors,
    }));

    /* ── 2. The program picture behind planning / meeting / assessment ────── */
    const program = await buildProgramSnapshot({ clientId, windowStart, windowEnd: dayEnd, windowDays });

    /* ── 3. Narrative for THIS service type ───────────────────────────────── */
    const generated = generateBcbaNote({
      serviceType,
      clientName:      client.name,
      bcbaName:        user.name ?? "The BCBA",
      serviceDate,
      tzOffsetMinutes: tz,
      sessions,
      program,
    });

    return NextResponse.json({
      ...generated,
      /* A supervision note is ABOUT one session — link it so the note carries
         the session's own timing and shows up against it. */
      sessionId: sessions.length === 1 ? sessions[0].id : null,
      sessions: sessions.map((s) => ({
        id:           s.id,
        startedAt:    s.startedAt,
        endedAt:      s.endedAt,
        mode:         s.mode,
        providerName: s.providerName,
        trialCount:   s.targets.reduce((sum, t) => sum + t.trialCount, 0),
        targetCount:  s.targets.length,
      })),
      matchedSessions: sessions.length,
    });
  } catch (e) {
    console.error("POST /api/clients/[clientId]/generate-bcba-note error:", e);
    return NextResponse.json({ error: "Failed to generate note" }, { status: 500 });
  }
}

/* ── Program snapshot ──────────────────────────────────────────────────────── */

async function buildProgramSnapshot(opts: {
  clientId:    string;
  windowStart: Date;
  windowEnd:   Date;
  windowDays:  number;
}): Promise<ProgramSnapshot> {
  const { clientId, windowStart, windowEnd, windowDays } = opts;

  const targets = await prisma.target.findMany({
    where: {
      isActive: true,
      OR: [
        { parentGoal: { clientId } },
        { subGoal: { parentGoal: { clientId } } },
        { programId: { not: null }, program: { clientId }, parentGoalId: null, subGoalId: null },
      ],
    },
    select: {
      id:           true,
      definition:   true,
      phase:        true,
      dateMastered: true,
      parentGoal:   { select: { domain: true } },
      subGoal:      { select: { parentGoal: { select: { domain: true } } } },
      program:      { select: { domain: true } },
    },
  });

  const titleById = new Map(targets.map((t) => [t.id, t.definition]));
  const phaseCounts: Record<string, number> = {};
  const domains = new Set<string>();
  const newTargets: string[] = [];
  const masteredRecently: string[] = [];

  for (const t of targets) {
    phaseCounts[t.phase] = (phaseCounts[t.phase] ?? 0) + 1;
    const domain = t.parentGoal?.domain ?? t.subGoal?.parentGoal?.domain ?? t.program?.domain;
    if (domain) domains.add(domain);
    if (t.phase === "NEW" || t.phase === "BASELINE") newTargets.push(t.definition);
    if (t.dateMastered && t.dateMastered >= windowStart && t.dateMastered <= windowEnd) {
      masteredRecently.push(t.definition);
    }
  }

  /* Counts only — pulling every trial row for a 30-day window would be a large
     read for a narrative that needs percentages. */
  const grouped = targets.length > 0
    ? await prisma.trial.groupBy({
        by:    ["targetId", "result"],
        where: {
          deletedAt: null,
          targetId:  { in: targets.map((t) => t.id) },
          session:   { deletedAt: null, startedAt: { gte: windowStart, lte: windowEnd } },
        },
        _count: { _all: true },
      })
    : [];

  const perTarget = new Map<string, { correct: number; total: number }>();
  for (const row of grouped) {
    const entry = perTarget.get(row.targetId) ?? { correct: 0, total: 0 };
    entry.total += row._count._all;
    if (row.result === "CORRECT" || row.result === "INDEPENDENT") entry.correct += row._count._all;
    perTarget.set(row.targetId, entry);
  }

  const scored = Array.from(perTarget.entries())
    .filter(([, v]) => v.total >= 3)
    .map(([targetId, v]) => ({
      title:      titleById.get(targetId) ?? "Goal",
      percentage: Math.round((v.correct / v.total) * 100),
      trialCount: v.total,
    }));

  const totalTrials = Array.from(perTarget.values()).reduce((sum, v) => sum + v.total, 0);
  const overallPct = scored.length > 0
    ? Math.round(scored.reduce((sum, t) => sum + t.percentage, 0) / scored.length)
    : null;

  const sessionsInWindow = await prisma.session.findMany({
    where:  { clientId, deletedAt: null, startedAt: { gte: windowStart, lte: windowEnd } },
    select: { id: true, user: { select: { name: true } } },
  });

  return {
    windowDays,
    activeTargets:    targets.length,
    phaseCounts,
    masteredRecently,
    newTargets,
    lowAccuracy:      scored.filter((t) => t.percentage < 60).sort((a, b) => a.percentage - b.percentage),
    highAccuracy:     scored.filter((t) => t.percentage >= 80).sort((a, b) => b.percentage - a.percentage),
    totalTrials,
    overallPct,
    domains:          Array.from(domains),
    sessionCount:     sessionsInWindow.length,
    providers:        Array.from(new Set(sessionsInWindow.map((s) => s.user?.name).filter((n): n is string => !!n))),
  };
}
