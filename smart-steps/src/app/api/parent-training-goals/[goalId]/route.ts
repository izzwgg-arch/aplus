import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { goalId: string } }
) {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { goalId } = params;
    const body = await request.json();
    const { goal, skillArea, status, startDate, notes } = body;

    // Fetch the goal to verify client access
    const existing = await prisma.parentTrainingGoal.findUnique({
      where: { id: goalId },
      include: { client: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const hasAccess = await prisma.clientAssignment.findFirst({
      where: {
        clientId: existing.clientId,
        userId: session.user.id,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const updated = await prisma.parentTrainingGoal.update({
      where: { id: goalId },
      data: {
        ...(goal && { goal: goal.trim() }),
        ...(skillArea !== undefined && { skillArea }),
        ...(status && { status }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(notes !== undefined && { notes }),
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "ParentTrainingGoal",
      entityId: goalId,
      details: { clientId: existing.clientId },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating parent training goal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { goalId: string } }
) {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { goalId } = params;

    // Fetch the goal to verify client access
    const existing = await prisma.parentTrainingGoal.findUnique({
      where: { id: goalId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const hasAccess = await prisma.clientAssignment.findFirst({
      where: {
        clientId: existing.clientId,
        userId: session.user.id,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    await prisma.parentTrainingGoal.delete({
      where: { id: goalId },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: "DELETE",
      entityType: "ParentTrainingGoal",
      entityId: goalId,
      details: { clientId: existing.clientId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting parent training goal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
