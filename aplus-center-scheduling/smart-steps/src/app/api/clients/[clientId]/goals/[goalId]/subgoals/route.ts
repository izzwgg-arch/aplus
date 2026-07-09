import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string; goalId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.goals.create");
  if (denied) return denied;

  const { goalId } = await params;

  try {
    const body = await req.json();
    const { title, description, notes, sortOrder } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

    const existing = await prisma.subGoal.count({ where: { parentGoalId: goalId } });

    const subGoal = await prisma.subGoal.create({
      data: {
        parentGoalId: goalId,
        title: title.trim(),
        description: description?.trim() || null,
        notes: notes?.trim() || null,
        sortOrder: sortOrder ?? existing,
        status: "ACTIVE",
      },
    });

    return NextResponse.json(subGoal, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create sub-goal" }, { status: 500 });
  }
}
