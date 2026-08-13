import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; goalId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId, goalId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.goals.view");
  if (denied) return denied;

  try {
    const goal = await prisma.parentGoal.findUnique({
      where: { id: goalId },
      include: {
        subGoals: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            targets: {
              orderBy: { createdAt: "asc" },
              include: {
                trials: {
                  take: 50,
                  orderBy: { createdAt: "desc" },
                  select: { result: true, createdAt: true },
                },
              },
            },
          },
        },
        targets: {
          where: { subGoalId: null },
          orderBy: { createdAt: "asc" },
          include: {
            trials: {
              take: 50,
              orderBy: { createdAt: "desc" },
              select: { result: true, createdAt: true },
            },
          },
        },
        program: { select: { id: true, name: true } },
      },
    });

    if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(goal);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string; goalId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.goals.edit");
  if (denied) return denied;

  const { goalId } = await params;

  try {
    const body = await req.json();
    const { title, description, domain, status, priority, targetDate, notes, programId } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (domain !== undefined) data.domain = domain?.trim() || null;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (targetDate !== undefined) data.targetDate = targetDate ? new Date(targetDate) : null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (programId !== undefined) data.programId = programId || null;

    const updated = await prisma.parentGoal.update({ where: { id: goalId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; goalId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.goals.delete");
  if (denied) return denied;

  const { goalId } = await params;

  try {
    // Archive instead of hard delete to preserve data
    await prisma.parentGoal.update({
      where: { id: goalId },
      data: { status: "ARCHIVED" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to archive goal" }, { status: 500 });
  }
}
