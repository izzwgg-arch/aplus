import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = params;

    // Check client access
    const hasAccess = await prisma.clientAssignment.findFirst({
      where: {
        clientId,
        userId: session.user.id,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const goals = await prisma.parentTrainingGoal.findMany({
      where: { clientId },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    });

    return NextResponse.json(goals);
  } catch (error) {
    console.error("Error fetching parent training goals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await requireSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = params;
    const body = await request.json();
    const { goal, skillArea, status = "ACTIVE", startDate, notes } = body;

    if (!goal || !goal.trim()) {
      return NextResponse.json(
        { error: "Goal text is required" },
        { status: 400 }
      );
    }

    // Check client access
    const hasAccess = await prisma.clientAssignment.findFirst({
      where: {
        clientId,
        userId: session.user.id,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const created = await prisma.parentTrainingGoal.create({
      data: {
        clientId,
        goal: goal.trim(),
        skillArea,
        status,
        startDate: startDate ? new Date(startDate) : null,
        notes,
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      action: "CREATE",
      entityType: "ParentTrainingGoal",
      entityId: created.id,
      details: { clientId, goal: created.goal },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating parent training goal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
