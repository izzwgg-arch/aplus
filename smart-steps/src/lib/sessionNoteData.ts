import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Shared session → note data layer.
 *
 * Both note generators read a session the same way: the BT session note
 * (`POST /api/sessions/[sessionId]/generate-note`) and the BCBA service note
 * (`POST /api/clients/[clientId]/generate-bcba-note`, which writes a supervision
 * / treatment-planning / parent-training narrative ABOUT the BT's session).
 *
 * They must never disagree about what happened in a session — if the BT note
 * says 42 trials at 78% and the supervision note written about that same
 * session says something else, one of them is wrong in a clinical record. So
 * the query shape and the per-target aggregation live here, once.
 */

export type SessionTargetSummary = {
  targetId:        string;
  targetTitle:     string;
  targetType:      string;
  phase:           string;
  parentGoalTitle: string | null;
  subGoalTitle:    string | null;
  programName:     string | null;
  domain:          string | null;
  trialCount:      number;
  correctCount:    number;
  promptedCount:   number;
  incorrectCount:  number;
  noResponseCount: number;
  promptCodes:     Record<string, number>;
  notes:           string[];
  percentage:      number;
  /** True when the goal was attached to the session by hand rather than derived
   *  from trials. Such a goal may legitimately have zero trials. */
  addedManually:   boolean;
  addedNote:       string | null;
};

export type BehaviorRecord = {
  type:        string;
  behavior:    string | null;
  antecedent:  string | null;
  consequence: string | null;
  intensity:   string | null;
};

const TARGET_SELECT = {
  id:            true,
  definition:    true,
  targetType:    true,
  phase:         true,
  dateMastered:  true,
  inMaintenance: true,
  parentGoal:    { select: { id: true, title: true, domain: true } },
  subGoal:       {
    select: {
      id: true, title: true,
      parentGoal: { select: { id: true, title: true, domain: true } },
    },
  },
  program: { select: { id: true, name: true, domain: true } },
} satisfies Prisma.TargetSelect;

export const sessionNoteInclude = {
  client:    { select: { id: true, name: true } },
  user:      { select: { id: true, name: true, role: true, displayRole: true, credentials: true } },
  trials:    {
    where:   { deletedAt: null },
    include: { target: { select: TARGET_SELECT } },
    orderBy: { createdAt: "asc" },
  },
  behaviors: {
    orderBy: { createdAt: "asc" },
    select:  {
      type:        true,
      behavior:    true,
      antecedent:  true,
      consequence: true,
      intensity:   true,
    },
  },
  // Goals attached to the session by hand — worked on, but with no trial data
  // of their own. They belong in the note just like the rest.
  addedTargets: {
    orderBy: { createdAt: "asc" },
    include: { target: { select: TARGET_SELECT } },
  },
} satisfies Prisma.SessionInclude;

export type SessionWithNoteData = Prisma.SessionGetPayload<{ include: typeof sessionNoteInclude }>;

/** Aggregates a loaded session's trials + hand-attached goals into per-goal rows. */
export function summarizeSessionTargets(s: SessionWithNoteData): SessionTargetSummary[] {
  const grouped = new Map<string, SessionTargetSummary>();

  for (const trial of s.trials) {
    const t  = trial.target;
    const pg = t.parentGoal ?? t.subGoal?.parentGoal ?? null;
    const existing = grouped.get(t.id) ?? blankSummary(t, pg, false, null);

    existing.trialCount += 1;
    if (trial.result === "CORRECT" || trial.result === "INDEPENDENT") existing.correctCount += 1;
    else if (trial.result === "PROMPTED") existing.promptedCount += 1;
    else if (trial.result === "INCORRECT") existing.incorrectCount += 1;
    else existing.noResponseCount += 1;

    const code = trial.promptLevel ?? "INDEPENDENT";
    existing.promptCodes[code] = (existing.promptCodes[code] ?? 0) + 1;
    if (trial.notes?.trim()) existing.notes.push(trial.notes.trim());

    grouped.set(t.id, existing);
  }

  /* A hand-attached goal that also has trials keeps its trial data and is only
     flagged; one with no trials joins the list with a zero count. */
  for (const link of s.addedTargets) {
    const t  = link.target;
    const pg = t.parentGoal ?? t.subGoal?.parentGoal ?? null;
    const existing = grouped.get(t.id);
    if (existing) {
      existing.addedManually = true;
      existing.addedNote = link.note;
      if (link.note?.trim()) existing.notes.push(link.note.trim());
      continue;
    }
    grouped.set(t.id, blankSummary(t, pg, true, link.note));
  }

  return Array.from(grouped.values()).map((t) => ({
    ...t,
    percentage: t.trialCount > 0 ? Math.round((t.correctCount / t.trialCount) * 100) : 0,
    notes:      Array.from(new Set(t.notes)),
  }));
}

type LoadedTarget = Prisma.TargetGetPayload<{ select: typeof TARGET_SELECT }>;
type LoadedParentGoal = { id: string; title: string; domain: string | null } | null;

function blankSummary(
  t: LoadedTarget,
  pg: LoadedParentGoal,
  addedManually: boolean,
  addedNote: string | null,
): SessionTargetSummary {
  return {
    targetId:        t.id,
    targetTitle:     t.definition,
    targetType:      t.targetType,
    phase:           t.phase,
    parentGoalTitle: pg?.title ?? null,
    subGoalTitle:    t.subGoal?.title ?? null,
    programName:     t.program?.name ?? null,
    domain:          pg?.domain ?? t.program?.domain ?? null,
    trialCount:      0,
    correctCount:    0,
    promptedCount:   0,
    incorrectCount:  0,
    noResponseCount: 0,
    promptCodes:     {},
    notes:           [],
    percentage:      0,
    addedManually,
    addedNote,
  };
}

/**
 * Every non-deleted session for a client inside an instant range, optionally
 * limited to one provider.
 *
 * The range is computed by the CALLER from the browser's clock — the service
 * date a BCBA picks means the clinic's day, and the server's timezone is not
 * the clinic's.
 */
export async function loadClientSessionsInRange(opts: {
  clientId:  string;
  from:      Date;
  to:        Date;
  userId?:   string | null;
  sessionId?: string | null;
}): Promise<SessionWithNoteData[]> {
  const { clientId, from, to, userId, sessionId } = opts;

  if (sessionId) {
    const one = await prisma.session.findFirst({
      where:   { id: sessionId, clientId, deletedAt: null },
      include: sessionNoteInclude,
    });
    return one ? [one] : [];
  }

  return prisma.session.findMany({
    where: {
      clientId,
      deletedAt: null,
      startedAt: { gte: from, lte: to },
      ...(userId ? { userId } : {}),
    },
    include: sessionNoteInclude,
    orderBy: { startedAt: "asc" },
  });
}

/** One session by id, with everything a note generator needs. */
export async function loadSessionForNote(sessionId: string): Promise<SessionWithNoteData | null> {
  return prisma.session.findUnique({
    where:   { id: sessionId },
    include: sessionNoteInclude,
  });
}
