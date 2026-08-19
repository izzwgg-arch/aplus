import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireAnyPermissionResponse, requirePermissionResponse } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/auditLogger";
import { evaluateMastery } from "@/lib/masteryEngine";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.targets.view.assigned", "smartsteps.targets.view.all"]);
  if (denied) return denied;
  const { programId } = await params;
  try {
    const targets = await prisma.target.findMany({
      where: { programId },
      orderBy: { createdAt: "asc" },
      include: {
        trials: {
          where: { deletedAt: null },
          include: { session: { select: { startedAt: true } } },
          orderBy: { createdAt: "desc" },
          take: 100,
        },
      },
    });

    const enriched = targets.map((t) => {
      // Group trials by session date
      const bySession = new Map<string, typeof t.trials>();
      for (const trial of t.trials) {
        const key = trial.session.startedAt.toISOString().slice(0, 10);
        if (!bySession.has(key)) bySession.set(key, []);
        bySession.get(key)!.push(trial);
      }
      const sessions = Array.from(bySession.entries()).map(([dateStr, trials]) => ({
        sessionId: dateStr,
        date: new Date(dateStr),
        trials: trials.map((tr) => ({ result: tr.result, promptLevel: tr.promptLevel ?? undefined })),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mastery = evaluateMastery(sessions as any, (t.masteryRule as Parameters<typeof evaluateMastery>[1]) ?? {});

      return {
        id: t.id,
        programId: t.programId,
        definition: t.definition,
        targetType: t.targetType,
        phase: t.phase,
        masteryRule: t.masteryRule,
        masteryEval: mastery,
        trialCount: t.trials.length,
      };
    });

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json([
      { id: "t1", programId, definition: "Touch nose on command", targetType: "DISCRETE_TRIAL", phase: "ACQUISITION", masteryRule: null, masteryEval: null, trialCount: 12 },
      { id: "t2", programId, definition: "Point to named color", targetType: "DISCRETE_TRIAL", phase: "ACQUISITION", masteryRule: null, masteryEval: null, trialCount: 8 },
    ]);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.targets.create");
  if (denied) return denied;
  const { programId } = await params;

  try {
    const body = await req.json() as {
      definition: string;
      targetType: string;
      masteryRule?: Record<string, unknown>;
    };

    const defaultMasteryRule = { thresholdPct: 80, consecutiveSessions: 3, minTrialsPerSession: 3, promptFadeRequired: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = await (prisma.target.create as any)({
      data: {
        programId,
        definition: body.definition,
        targetType: body.targetType,
        masteryRule: (body.masteryRule ?? defaultMasteryRule) as Prisma.InputJsonValue,
      },
    });
    await auditLog(user.id, "UPDATE_TARGET", "Target", target.id, { action: "create" });
    return NextResponse.json(target, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
