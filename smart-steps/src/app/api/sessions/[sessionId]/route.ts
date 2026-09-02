import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireAnyPermissionResponse, requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.sessions.edit");
  if (denied) return denied;

  const { sessionId } = await params;

  // Ignore local IDs (offline sessions not yet synced)
  if (sessionId.startsWith("local-")) {
    return NextResponse.json({ ok: true, offline: true });
  }

  // Restrict edits to sessions whose client the user is assigned to (RBTs are
  // ".assigned"-scoped; ".all" holders like BCBA/Admin pass through).
  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const accessDenied = await requireClientAccessResponse(user.id, existing.clientId, "smartsteps.sessions.view");
  if (accessDenied) return accessDenied;

  try {
    const body = await req.json() as {
      endedAt?: string;
      notes?: string;
      startedAt?: string;
      providerId?: string;
      supervised?: boolean;
      supervisorId?: string | null;
    };

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
        notes: body.notes ?? undefined,
        startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
        userId: body.providerId ?? undefined,
        // Clearing the flag clears the supervisor with it — a session that was
        // not supervised must not keep a supervisor on record.
        ...(body.supervised !== undefined
          ? { supervised: body.supervised, ...(body.supervised ? {} : { supervisorId: null }) }
          : {}),
        ...(body.supervisorId !== undefined && body.supervised !== false
          ? { supervisorId: body.supervisorId || null }
          : {}),
      },
    });

    return NextResponse.json({ ok: true, id: updated.id });
  } catch (e) {
    console.error("PATCH /sessions/[sessionId] error:", e);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.sessions.view.assigned", "smartsteps.sessions.view.all"]);
  if (denied) return denied;

  const { sessionId } = await params;

  try {
    const s = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        trials: {
          where: { deletedAt: null },
          include: {
            target: {
              select: {
                id: true,
                definition: true,
                targetType: true,
                phase: true,
                dateMastered: true,
                isActive: true,
                inMaintenance: true,
                parentGoal: { select: { id: true, title: true, status: true, domain: true } },
                subGoal: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    parentGoal: { select: { id: true, title: true, status: true, domain: true } },
                  },
                },
                program: { select: { id: true, name: true, domain: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        behaviors: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, behavior: true, antecedent: true, consequence: true, intensity: true, createdAt: true } },
        user: { select: { id: true, name: true, email: true } },
        supervisor: { select: { id: true, name: true } },
        // Goals attached by hand (worked on without trial data). Merged into
        // `sessionTargets` below alongside the trial-derived ones.
        addedTargets: {
          orderBy: { createdAt: "asc" },
          include: {
            addedBy: { select: { id: true, name: true } },
            target: {
              select: {
                id: true,
                definition: true,
                targetType: true,
                phase: true,
                parentGoal: { select: { id: true, title: true, domain: true } },
                subGoal: {
                  select: {
                    id: true,
                    title: true,
                    parentGoal: { select: { id: true, title: true, domain: true } },
                  },
                },
                program: { select: { id: true, name: true, domain: true } },
              },
            },
          },
        },
        // Notes written for this session — the snapshot shows whether a BT note
        // has already been generated so nobody generates a duplicate blindly.
        sessionNotes: {
          orderBy: { createdAt: "desc" },
          select: { id: true, title: true, type: true, isGenerated: true, createdAt: true },
        },
      },
    });

    if (!s || s.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const grouped = new Map<string, {
      targetId: string;
      targetTitle: string;
      targetType: string;
      phase: string;
      parentGoalId: string | null;
      parentGoalTitle: string | null;
      subGoalId: string | null;
      subGoalTitle: string | null;
      programId: string | null;
      programName: string | null;
      providerId: string | null;
      providerName: string | null;
      sessionKind: string;
      trialCount: number;
      correctCount: number;
      promptedCount: number;
      incorrectCount: number;
      noResponseCount: number;
      maintenanceCount: number;
      promptCodes: Record<string, number>;
      notes: string[];
      firstTimestamp: string | null;
      lastTimestamp: string | null;
      addedManually: boolean;
      addedNote: string | null;
      addedByName: string | null;
    }>();

    for (const trial of s.trials) {
      const parentGoal = trial.target.parentGoal ?? trial.target.subGoal?.parentGoal ?? null;
      const key = trial.target.id;
      const existing = grouped.get(key) ?? {
        targetId: trial.target.id,
        targetTitle: trial.target.definition,
        targetType: trial.target.targetType,
        phase: trial.target.phase,
        parentGoalId: parentGoal?.id ?? null,
        parentGoalTitle: parentGoal?.title ?? null,
        subGoalId: trial.target.subGoal?.id ?? null,
        subGoalTitle: trial.target.subGoal?.title ?? null,
        programId: trial.target.program?.id ?? null,
        programName: trial.target.program?.name ?? null,
        providerId: s.user?.id ?? null,
        providerName: s.user?.name ?? null,
        sessionKind: s.mode,
        trialCount: 0,
        correctCount: 0,
        promptedCount: 0,
        incorrectCount: 0,
        noResponseCount: 0,
        maintenanceCount: 0,
        promptCodes: {},
        notes: [],
        firstTimestamp: null,
        lastTimestamp: null,
        addedManually: false,
        addedNote: null,
        addedByName: null,
      };

      existing.trialCount += 1;
      if (trial.result === "CORRECT" || trial.result === "INDEPENDENT") existing.correctCount += 1;
      else if (trial.result === "PROMPTED") existing.promptedCount += 1;
      else if (trial.result === "INCORRECT") existing.incorrectCount += 1;
      else existing.noResponseCount += 1;
      if (trial.target.inMaintenance) existing.maintenanceCount += 1;
      const promptCode = trial.promptLevel ?? "INDEPENDENT";
      existing.promptCodes[promptCode] = (existing.promptCodes[promptCode] ?? 0) + 1;
      if (trial.notes?.trim()) existing.notes.push(trial.notes.trim());
      const stamp = trial.createdAt.toISOString();
      existing.firstTimestamp = existing.firstTimestamp ? (existing.firstTimestamp < stamp ? existing.firstTimestamp : stamp) : stamp;
      existing.lastTimestamp = existing.lastTimestamp ? (existing.lastTimestamp > stamp ? existing.lastTimestamp : stamp) : stamp;

      grouped.set(key, existing);
    }

    /* Hand-attached goals. A goal that also has trials keeps its trial data and
       is simply flagged; one with no trials joins the list with a zero count so
       it still reads as "worked on" in the snapshot and in the note. */
    for (const link of s.addedTargets) {
      const t = link.target;
      const parentGoal = t.parentGoal ?? t.subGoal?.parentGoal ?? null;
      const existing = grouped.get(t.id);
      if (existing) {
        existing.addedManually = true;
        existing.addedNote = link.note;
        existing.addedByName = link.addedBy?.name ?? null;
        continue;
      }
      grouped.set(t.id, {
        targetId: t.id,
        targetTitle: t.definition,
        targetType: t.targetType,
        phase: t.phase,
        parentGoalId: parentGoal?.id ?? null,
        parentGoalTitle: parentGoal?.title ?? null,
        subGoalId: t.subGoal?.id ?? null,
        subGoalTitle: t.subGoal?.title ?? null,
        programId: t.program?.id ?? null,
        programName: t.program?.name ?? null,
        providerId: s.user?.id ?? null,
        providerName: s.user?.name ?? null,
        sessionKind: s.mode,
        trialCount: 0,
        correctCount: 0,
        promptedCount: 0,
        incorrectCount: 0,
        noResponseCount: 0,
        maintenanceCount: 0,
        promptCodes: {},
        notes: [],
        firstTimestamp: null,
        lastTimestamp: null,
        addedManually: true,
        addedNote: link.note,
        addedByName: link.addedBy?.name ?? null,
      });
    }

    const sessionTargets = Array.from(grouped.values()).map((item) => ({
      ...item,
      percentage: item.trialCount ? Math.round((item.correctCount / item.trialCount) * 100) : 0,
      uniquePromptCodes: Object.keys(item.promptCodes).length,
      notes: Array.from(new Set(item.notes)),
    }));

    return NextResponse.json({
      id: s.id,
      clientId: s.clientId,
      userId: s.userId,
      mode: s.mode,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      notes: s.notes ?? null,
      voiceNotes: s.voiceNotes ?? null,
      // Supervision is what makes a session eligible to be written up as a
      // direct-supervision note.
      supervised: s.supervised,
      supervisorId: s.supervisorId,
      supervisorName: s.supervisor?.name ?? null,
      user: s.user,
      trials: s.trials.map((trial) => ({
        id: trial.id,
        sessionId: trial.sessionId,
        targetId: trial.targetId,
        result: trial.result,
        promptLevel: trial.promptLevel,
        latencyMs: trial.latencyMs,
        notes: trial.notes,
        createdAt: trial.createdAt.toISOString(),
        updatedAt: trial.updatedAt.toISOString(),
        target: {
          id: trial.target.id,
          definition: trial.target.definition,
          targetType: trial.target.targetType,
          phase: trial.target.phase,
          dateMastered: trial.target.dateMastered?.toISOString() ?? null,
          isActive: trial.target.isActive,
          inMaintenance: trial.target.inMaintenance,
          parentGoal: trial.target.parentGoal ?? trial.target.subGoal?.parentGoal ?? null,
          subGoal: trial.target.subGoal
            ? {
                id: trial.target.subGoal.id,
                title: trial.target.subGoal.title,
                status: trial.target.subGoal.status,
              }
            : null,
          program: trial.target.program,
        },
      })),
      behaviors: s.behaviors.map((behavior) => ({
        ...behavior,
        createdAt: behavior.createdAt.toISOString(),
      })),
      sessionTargets,
      trialCount: s.trials.length,
      notesGenerated: s.sessionNotes.map((n) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        isGenerated: n.isGenerated,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * Soft-delete a session that is not needed (accidental start, duplicate, empty
 * entry). The row is kept — `deletedAt` is stamped on the session AND on each of
 * its trials, so every list, graph, report, and analytics query that already
 * filters `deletedAt: null` excludes it automatically. Nothing is destroyed, so
 * an admin can un-stamp the rows in the DB if a delete was a mistake.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.sessions.delete");
  if (denied) return denied;

  const { sessionId } = await params;

  // Offline/local ids were never persisted — nothing to delete server-side.
  if (sessionId.startsWith("local-")) {
    return NextResponse.json({ ok: true, offline: true });
  }

  const existing = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true, deletedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const accessDenied = await requireClientAccessResponse(user.id, existing.clientId, "smartsteps.sessions.view");
  if (accessDenied) return accessDenied;
  if (existing.deletedAt) return NextResponse.json({ ok: true, alreadyDeleted: true });

  try {
    const now = new Date();
    const [, trials] = await prisma.$transaction([
      prisma.session.update({ where: { id: sessionId }, data: { deletedAt: now } }),
      prisma.trial.updateMany({
        where: { sessionId, deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);
    return NextResponse.json({ ok: true, trialsRemoved: trials.count });
  } catch (e) {
    console.error("DELETE /sessions/[sessionId] error:", e);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
