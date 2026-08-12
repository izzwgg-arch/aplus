import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, hasAllScope } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// Returns ALL active targets for a client, grouped by goal/program
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.targets.view");
  if (denied) return denied;

  // BT visibility: restrict assigned-only viewers to In-Treatment (ACQUISITION)
  // targets. BCBAs/Admins (holding the `.all` scope) see every phase.
  const restrictToInTreatment = !(await hasAllScope(user.id, "smartsteps.targets.view"));
  const phaseWhere = restrictToInTreatment ? { phase: "ACQUISITION" as const } : {};

  try {
    // Targets via goal hierarchy
    const goalTargets = await prisma.target.findMany({
      where: {
        isActive: true,
        ...phaseWhere,
        OR: [
          { parentGoal: { clientId } },
          { subGoal: { parentGoal: { clientId } } },
        ],
      },
      include: {
        parentGoal: { select: { id: true, title: true, domain: true } },
        subGoal: {
          select: {
            id: true,
            title: true,
            parentGoal: { select: { id: true, title: true, domain: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    // Targets via programs
    const programTargets = await prisma.target.findMany({
      where: {
        isActive: true,
        ...phaseWhere,
        programId: { not: null },
        program: { clientId },
        parentGoalId: null,
        subGoalId: null,
      },
      include: {
        program: { select: { id: true, name: true, domain: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    // Build grouped structure for the session picker
    const groups: Array<{
      groupId: string;
      groupLabel: string;
      groupType: "goal" | "program";
      domain?: string | null;
      targets: Array<{
        id: string;
        definition: string;
        targetType: string;
        phase: string;
        masteryRule: unknown;
        subGoalTitle?: string | null;
      }>;
    }> = [];

    // Group goal targets by parentGoal
    const byGoal = new Map<string, typeof groups[0]>();
    for (const t of goalTargets) {
      const goalId = t.parentGoal?.id ?? t.subGoal?.parentGoal?.id ?? "unknown";
      const goalTitle = t.parentGoal?.title ?? t.subGoal?.parentGoal?.title ?? "Unknown goal";
      const domain = t.parentGoal?.domain ?? t.subGoal?.parentGoal?.domain;

      if (!byGoal.has(goalId)) {
        byGoal.set(goalId, {
          groupId: goalId,
          groupLabel: goalTitle,
          groupType: "goal",
          domain,
          targets: [],
        });
      }

      byGoal.get(goalId)!.targets.push({
        id: t.id,
        definition: t.definition,
        targetType: t.targetType,
        phase: t.phase,
        masteryRule: t.masteryRule,
        subGoalTitle: t.subGoal?.title ?? null,
      });
    }
    groups.push(...byGoal.values());

    // Group program targets by program
    const byProgram = new Map<string, typeof groups[0]>();
    for (const t of programTargets) {
      const progId = t.program!.id;
      const progName = t.program!.name;
      const domain = t.program!.domain;

      if (!byProgram.has(progId)) {
        byProgram.set(progId, {
          groupId: progId,
          groupLabel: progName,
          groupType: "program",
          domain,
          targets: [],
        });
      }

      byProgram.get(progId)!.targets.push({
        id: t.id,
        definition: t.definition,
        targetType: t.targetType,
        phase: t.phase,
        masteryRule: t.masteryRule,
        subGoalTitle: null,
      });
    }
    groups.push(...byProgram.values());

    return NextResponse.json({
      groups,
      totalTargets: goalTargets.length + programTargets.length,
    });
  } catch (err) {
    console.error("GET /api/clients/[clientId]/targets error:", err);
    return NextResponse.json({ error: "Failed to load targets" }, { status: 500 });
  }
}
