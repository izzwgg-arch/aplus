import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// POST  → add to favorites
// DELETE → remove from favorites
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.goal_library.view");
  if (denied) return denied;
  const { itemId } = await params;

  try {
    // deleteMany + create acts as upsert for unique-constrained rows
    await prisma.userGoalFavorite.deleteMany({
      where: { userId: user.id, goalItemId: itemId, itemType: "GOAL" },
    });
    await prisma.userGoalFavorite.create({
      data: {
        userId:     user.id,
        itemType:   "GOAL",
        goalItemId: itemId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.goal_library.view");
  if (denied) return denied;
  const { itemId } = await params;

  try {
    await prisma.userGoalFavorite.deleteMany({
      where: { userId: user.id, goalItemId: itemId, itemType: "GOAL" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  }
}
