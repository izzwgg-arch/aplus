import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, hasAllScope } from "@/lib/permissions";
import { targetPhaseWhere } from "@/lib/targetVisibility";
import { prisma } from "@/lib/db";

// Returns ALL active targets for a client, grouped by goal/program
export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.targets.view");
  if (denied) return denied;

  // BT visibility: assigned-only viewers see every active phase except
  // MASTERED. BCBAs/Admins (holding the `.all` scope) see every phase, unless
  // the caller is a session data-entry picker (`excludeMastered=1`) — a
  // finished goal is not something anyone records trials against, so it is
  // kept out of those lists for every role. Callers that need the full
  // hierarchy (e.g. the Goals & Targets hydration in ProgramsTab) omit the
  // flag and still receive mastered goals.
  const restricted = !(await hasAllScope(user.id, "smartsteps.targets.view"));
  const excludeMastered =
    new URL(req.url).searchParams.get("excludeMastered") === "1";
  const phaseWhere = targetPhaseWhere({ restricted, excludeMastered });

  try {
    // Get all active targets that belong to this client, through any relationship.
    // Explicitly apply phase filtering to each relationship branch to avoid Prisma
    // interpretation issues with mixed AND/OR conditions.
    const allTargets = await prisma.target.findMany({
      where: {
        isActive: true,
        AND: [
          { ...phaseWhere },
          {
            OR: [
              // Via parentGoal hierarchy
              { parentGoal: { clientId } },
              // Via subGoal hierarchy
              { subGoal: { parentGoal: { clientId } } },
              // Via program directly
              { program: { clientId } },
            ],
          },
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

    const byGroup = new Map<string, typeof groups[0]>();

    for (const t of allTargets) {
      let groupId: string;
      let groupLabel: string;
      let groupType: "goal" | "program";
      let domain: string | null | undefined;

      // Determine primary grouping: goal hierarchy takes precedence over program
      if (t.parentGoal) {
        groupId = t.parentGoal.id;
        groupLabel = t.parentGoal.title;
        groupType = "goal";
        domain = t.parentGoal.domain;
      } else if (t.subGoal) {
        groupId = t.subGoal.parentGoal?.id ?? "unknown";
        groupLabel = t.subGoal.parentGoal?.title ?? "Unknown goal";
        groupType = "goal";
        domain = t.subGoal.parentGoal?.domain;
      } else if (t.program) {
        groupId = t.program.id;
        groupLabel = t.program.name;
        groupType = "program";
        domain = t.program.domain;
      } else {
        // Orphan target with no parent or program — skip
        continue;
      }

      if (!byGroup.has(groupId)) {
        byGroup.set(groupId, {
          groupId,
          groupLabel,
          groupType,
          domain,
          targets: [],
        });
      }

      byGroup.get(groupId)!.targets.push({
        id: t.id,
        definition: t.definition,
        targetType: t.targetType,
        phase: t.phase,
        masteryRule: t.masteryRule,
        subGoalTitle: t.subGoal?.title ?? null,
      });
    }

    groups.push(...byGroup.values());

    return NextResponse.json({
      groups,
      totalTargets: allTargets.length,
    });
  } catch (err) {
    console.error("GET /api/clients/[clientId]/targets error:", err);
    return NextResponse.json({ error: "Failed to load targets" }, { status: 500 });
  }
}
