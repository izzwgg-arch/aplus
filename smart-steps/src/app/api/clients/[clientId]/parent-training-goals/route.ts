import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { auditLog } from "@/lib/auditLogger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const user = await requireSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = await params;

    // Check client access
    const hasAccess = await prisma.clientAssignment.findFirst({
      where: {
        clientId,
        userId: user.id,
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
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const user = await requireSession();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = await params;
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
        userId: user.id,
      },
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    console.log("Creating parent training goal with data:", { clientId, goal: goal?.substring(0, 50), skillArea, status, startDate, notes: notes?.substring(0, 50) });

    const created = await prisma.parentTrainingGoal.create({
      data: {
        clientId,
        goal: goal.trim(),
        skillArea: skillArea || null,
        status,
        startDate: startDate ? new Date(startDate) : null,
        notes: notes || null,
      },
    });

    console.log("Successfully created parent training goal:", created.id);

    await auditLog(user.id, "CREATE_PARENT_TRAINING_GOAL", "ParentTrainingGoal", created.id, {
      clientId,
      goal: created.goal,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating parent training goal:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
