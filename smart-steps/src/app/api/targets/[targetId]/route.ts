import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { canForClient, requirePermissionResponse, hasAllScope } from "@/lib/permissions";
import { prisma } from "@/lib/db";

function asBool(value: string | null) {
  return value === "1" || value === "true";
}

function parseIoaPercentage(notes: string | null | undefined) {
  if (!notes) return null;
  const match = notes.match(/\bIOA[:\s-]*([0-9]{1,3})(?:\s*%?)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function percentageForResult(result: string) {
  if (result === "CORRECT" || result === "INDEPENDENT") return 100;
  if (result === "PROMPTED") return 50;
  return 0;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ targetId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { targetId } = await params;
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const providerId = searchParams.get("providerId");
  const sessionKind = searchParams.get("sessionKind");
  const promptCode = searchParams.get("promptCode");
  const excludeMaintenance = asBool(searchParams.get("excludeMaintenance"));

  try {
    const target = await prisma.target.findUnique({
      where: { id: targetId },
      include: {
        program: { select: { id: true, name: true, clientId: true, domain: true } },
        parentGoal: { select: { id: true, title: true, clientId: true, domain: true, status: true } },
        subGoal: {
          select: {
            id: true,
            title: true,
            status: true,
            parentGoal: { select: { id: true, title: true, clientId: true, domain: true, status: true } },
          },
        },
        trials: {
          where: {
            deletedAt: null,
            promptLevel: promptCode && promptCode !== "all" ? promptCode : undefined,
            session: {
              // Filter by service date (startedAt), not record creation date
              startedAt: (startDate || endDate) ? {
                gte: startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined,
                lte: endDate ? new Date(`${endDate}T23:59:59.999Z`) : undefined,
              } : undefined,
              userId: providerId && providerId !== "all" ? providerId : undefined,
              mode: sessionKind && sessionKind !== "all" ? sessionKind : undefined,
            },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            targetId: true,
            result: true,
            promptLevel: true,
            latencyMs: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
            session: {
              select: {
                id: true,
                mode: true,
                startedAt: true,
                endedAt: true,
                notes: true,
                voiceNotes: true,
                clientId: true,
                userId: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        annotations: {
          orderBy: { annotatedAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const resolvedParentGoal = target.parentGoal ?? target.subGoal?.parentGoal ?? null;
    const resolvedClientId = resolvedParentGoal?.clientId ?? target.program?.clientId ?? null;

    if (clientId && resolvedClientId && clientId !== resolvedClientId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (resolvedClientId) {
      const allowed = await canForClient(user.id, resolvedClientId, "smartsteps.targets.view");
      if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // BT visibility: assigned-only viewers may only open In-Treatment targets.
    // Anything not in the ACQUISITION phase is hidden (treated as not found).
    const restrictToInTreatment = !(await hasAllScope(user.id, "smartsteps.targets.view"));
    if (restrictToInTreatment && target.phase !== "ACQUISITION") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const trials = target.trials
      .filter((trial) => {
        const maintenance = Boolean(target.inMaintenance || trial.session?.mode === "MAINTENANCE");
        return excludeMaintenance ? !maintenance : true;
      })
      .map((trial) => {
        const timestamp = trial.createdAt.toISOString();
        // Use session service date (startedAt) for all reporting — not the DB creation date
        const serviceDate = trial.session?.startedAt?.toISOString() ?? timestamp;
        return {
          id: trial.id,
          targetId: target.id,
          goalId: resolvedParentGoal?.id ?? null,
          parentGoalId: resolvedParentGoal?.id ?? null,
          subGoalId: target.subGoal?.id ?? null,
          clientId: trial.session?.clientId ?? resolvedClientId,
          sessionId: trial.session?.id ?? null,
          providerId: trial.session?.userId ?? trial.session?.user?.id ?? null,
          timestamp: serviceDate,
          date: serviceDate.slice(0, 10),
          sessionKind: trial.session?.mode ?? "DTT",
          promptCode: trial.promptLevel ?? null,
          promptLevel: trial.promptLevel ?? null,
          result: trial.result,
          percentage: percentageForResult(trial.result),
          notes: trial.notes,
          ioaPercentage: parseIoaPercentage(trial.notes),
          isMaintenance: Boolean(target.inMaintenance || trial.session?.mode === "MAINTENANCE"),
          createdAt: timestamp,
          updatedAt: trial.updatedAt?.toISOString() ?? timestamp,
          latencyMs: trial.latencyMs ?? null,
          session: {
            id: trial.session?.id ?? null,
            mode: trial.session?.mode ?? "DTT",
            startedAt: trial.session?.startedAt?.toISOString() ?? null,
            endedAt: trial.session?.endedAt?.toISOString() ?? null,
            notes: trial.session?.notes ?? null,
            voiceNotes: trial.session?.voiceNotes ?? null,
            user: trial.session?.user ?? null,
          },
          provider: trial.session?.user ?? null,
        };
      });

    return NextResponse.json({
      id: target.id,
      definition: target.definition,
      targetType: target.targetType,
      phase: target.phase,
      isActive: target.isActive,
      inMaintenance: target.inMaintenance,
      inGeneralization: target.inGeneralization,
      dateMastered: target.dateMastered?.toISOString() ?? null,
      createdAt: target.createdAt.toISOString(),
      updatedAt: target.updatedAt.toISOString(),
      clientId: resolvedClientId,
      parentGoal: resolvedParentGoal,
      subGoal: target.subGoal
        ? {
            id: target.subGoal.id,
            title: target.subGoal.title,
            status: target.subGoal.status,
          }
        : null,
      program: target.program,
      trials,
      annotations: target.annotations.map((annotation) => ({
        ...annotation,
        clientId: resolvedClientId,
        annotatedAt: annotation.annotatedAt.toISOString(),
        createdAt: annotation.createdAt.toISOString(),
        updatedAt: annotation.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ targetId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.targets.edit");
  if (denied) return denied;

  const { targetId } = await params;

  try {
    const body = await req.json();
    const {
      definition,
      targetType,
      phase,
      masteryRule,
      promptHierarchy,
      baseline,
      notes,
      dateMastered,
      programId,
      parentGoalId,
      subGoalId,
      isActive,
      inMaintenance,
      inGeneralization,
    } = body;

    const data: Record<string, unknown> = {};
    if (definition !== undefined) data.definition = definition.trim();
    if (targetType !== undefined) data.targetType = targetType;
    if (phase !== undefined) data.phase = phase;
    if (masteryRule !== undefined) data.masteryRule = masteryRule;
    if (promptHierarchy !== undefined) data.promptHierarchy = promptHierarchy;
    if (baseline !== undefined) data.baseline = baseline?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (dateMastered !== undefined) data.dateMastered = dateMastered ? new Date(dateMastered) : null;
    if (programId !== undefined) data.programId = programId || null;
    if (parentGoalId !== undefined) data.parentGoalId = parentGoalId || null;
    if (subGoalId !== undefined) data.subGoalId = subGoalId || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (inMaintenance !== undefined) data.inMaintenance = Boolean(inMaintenance);
    if (inGeneralization !== undefined) data.inGeneralization = Boolean(inGeneralization);

    const updated = await prisma.target.update({ where: { id: targetId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update target" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ targetId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.targets.delete");
  if (denied) return denied;

  const { targetId } = await params;

  try {
    await prisma.target.update({
      where: { id: targetId },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
