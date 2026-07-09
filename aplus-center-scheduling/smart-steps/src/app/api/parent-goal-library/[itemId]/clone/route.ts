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
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.manage");
  if (denied) return denied;

  const { itemId } = await params;

  try {
    const source = await prisma.parentGoalLibraryItem.findUnique({ where: { id: itemId } });
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const clone = await prisma.parentGoalLibraryItem.create({
      data: {
        title:       `${source.title} (Copy)`,
        description: source.description,
        domain:      source.domain,
        category:    source.category,
        skillArea:   source.skillArea,
        notes:       source.notes,
        isActive:    true,
        usageCount:  0,
        createdById: user.id,
      },
    });

    return NextResponse.json(clone, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to clone" }, { status: 500 });
  }
}
