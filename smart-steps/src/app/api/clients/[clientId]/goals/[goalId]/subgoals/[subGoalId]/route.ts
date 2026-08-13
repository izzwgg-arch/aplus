import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ subGoalId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.goals.edit");
  if (denied) return denied;

  const { subGoalId } = await params;

  try {
    const body = await req.json();
    const { title, description, notes, status, sortOrder } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (status !== undefined) data.status = status;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const updated = await prisma.subGoal.update({ where: { id: subGoalId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ subGoalId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.goals.delete");
  if (denied) return denied;

  const { subGoalId } = await params;

  try {
    await prisma.subGoal.update({
      where: { id: subGoalId },
      data: { status: "ARCHIVED" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
