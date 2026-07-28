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
    select: { clientId: true },
  });
  if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const accessDenied = await requireClientAccessResponse(user.id, existing.clientId, "smartsteps.sessions.view");
  if (accessDenied) return accessDenied;

  try {
    const body = await req.json() as {
      endedAt?: string;
      notes?: string;
      startedAt?: string;
      providerId?: string;
    };

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
        notes: body.notes ?? undefined,
        startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
        userId: body.providerId ?? undefined,
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
      },
    });

    if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
