import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.goal_library.manage");
  if (denied) return denied;

  const { itemId } = await params;

  try {
    const source = await prisma.targetLibraryItem.findUnique({ where: { id: itemId } });
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const clone = await prisma.targetLibraryItem.create({
      data: {
        title:                 `${source.title} (Copy)`,
        operationalDefinition: source.operationalDefinition,
        targetType:            source.targetType,
        masteryRule:           (source.masteryRule ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        promptHierarchy:       source.promptHierarchy,
        baseline:              source.baseline,
        notes:                 source.notes,
        category:              source.category,
        skillArea:             source.skillArea,
        domain:                source.domain,
        isActive:              true,
        usageCount:            0,
        createdById:           user.id,
      },
    });

    return NextResponse.json(clone, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to clone" }, { status: 500 });
  }
}
