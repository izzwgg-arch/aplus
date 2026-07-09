import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.view");
  if (denied) return denied;
  const { itemId } = await params;

  try {
    const item = await prisma.parentGoalLibraryItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.manage");
  if (denied) return denied;

  const { itemId } = await params;

  try {
    const body = await req.json() as {
      title?: string;
      description?: string | null;
      domain?: string | null;
      category?: string | null;
      skillArea?: string | null;
      notes?: string | null;
      isActive?: boolean;
    };

    const data: Prisma.ParentGoalLibraryItemUpdateInput = {};
    if (body.title       !== undefined) data.title       = body.title.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.domain      !== undefined) data.domain      = body.domain?.trim() || null;
    if (body.category    !== undefined) data.category    = body.category?.trim() || null;
    if (body.skillArea   !== undefined) data.skillArea   = body.skillArea?.trim() || null;
    if (body.notes       !== undefined) data.notes       = body.notes?.trim() || null;
    if (body.isActive    !== undefined) data.isActive    = body.isActive;

    const updated = await prisma.parentGoalLibraryItem.update({ where: { id: itemId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.manage");
  if (denied) return denied;

  const { itemId } = await params;

  try {
    const item = await prisma.parentGoalLibraryItem.findUnique({
      where: { id: itemId },
      select: { usageCount: true },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Templates with usage history are never hard-deleted — deactivate instead
    if (item.usageCount > 0) {
      const updated = await prisma.parentGoalLibraryItem.update({
        where: { id: itemId },
        data:  { isActive: false },
      });
      return NextResponse.json({ ok: true, action: "deactivated", item: updated });
    }

    await prisma.parentGoalLibraryItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true, action: "deleted" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
