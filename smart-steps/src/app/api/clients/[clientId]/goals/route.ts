import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse, hasAllScope } from "@/lib/permissions";
import { restrictedPhaseWhere } from "@/lib/targetVisibility";
import { prisma } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.goals.view");
  if (denied) return denied;

  // BT visibility: users without the `.all` scope (e.g. Behavior Technicians,
  // Parent Viewers) see every active goal except MASTERED ones. BCBAs/Admins
  // (holding `.all`) see everything. See @/lib/targetVisibility for why this is
  // not restricted to ACQUISITION.
  const restricted = !(await hasAllScope(user.id, "smartsteps.goals.view"));
  const targetPhaseWhere = restrictedPhaseWhere(restricted);

  try {
    const goals = await prisma.parentGoal.findMany({
      where: {
        clientId,
        status: { not: "ARCHIVED" },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      include: {
        subGoals: {
          where: { status: { not: "ARCHIVED" } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          include: {
            targets: {
              where: { isActive: true, ...targetPhaseWhere },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            },
          },
        },
        targets: {
          where: { isActive: true, subGoalId: null, ...targetPhaseWhere },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        program: { select: { id: true, name: true } },
      },
    });

    // For restricted viewers, drop parent goals left with no visible targets
    // (directly or via sub-goals) so fully-mastered goals stay hidden.
    const result = restricted
      ? goals.filter((g) => g.targets.length > 0 || g.subGoals.some((sg) => sg.targets.length > 0))
      : goals;

    return NextResponse.json(result);
  } catch (err) {
    console.error("GET /api/clients/[clientId]/goals error:", err);
    return NextResponse.json({ error: "Failed to load goals" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.goals.create");
  if (denied) return denied;

  const { clientId } = await params;

  try {
    const body = await req.json();
    const { title, description, domain, programId, priority, targetDate, notes } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    const goal = await prisma.parentGoal.create({
      data: {
        clientId,
        title: title.trim(),
        description: description?.trim() || null,
        domain: domain?.trim() || null,
        programId: programId || null,
        priority: priority ?? 0,
        targetDate: targetDate ? new Date(targetDate) : null,
        notes: notes?.trim() || null,
        status: "ACTIVE",
      },
      include: {
        subGoals: true,
        targets: true,
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    console.error("POST /api/clients/[clientId]/goals error:", err);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}
