import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.view");
  if (denied) return denied;
  const { itemId } = await params;

  try {
    await prisma.userGoalFavorite.deleteMany({
      where: { userId: user.id, parentItemId: itemId, itemType: "PARENT_GOAL" },
    });
    await prisma.userGoalFavorite.create({
      data: {
        userId:       user.id,
        itemType:     "PARENT_GOAL",
        parentItemId: itemId,
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
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.view");
  if (denied) return denied;
  const { itemId } = await params;

  try {
    await prisma.userGoalFavorite.deleteMany({
      where: { userId: user.id, parentItemId: itemId, itemType: "PARENT_GOAL" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  }
}
