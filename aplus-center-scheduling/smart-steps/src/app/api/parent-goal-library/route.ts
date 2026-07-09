import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.view");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const q          = searchParams.get("q")?.trim() ?? "";
  const activeOnly = searchParams.get("isActive") !== "false";

  try {
    const where: Prisma.ParentGoalLibraryItemWhereInput = {
      ...(activeOnly ? { isActive: true } : {}),
      ...(q ? {
        OR: [
          { title:       { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { category:    { contains: q, mode: "insensitive" } },
          { skillArea:   { contains: q, mode: "insensitive" } },
          { domain:      { contains: q, mode: "insensitive" } },
          { notes:       { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    };

    const [items, favorites] = await Promise.all([
      prisma.parentGoalLibraryItem.findMany({
        where,
        orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
      }),
      prisma.userGoalFavorite.findMany({
        where: { userId: user.id, itemType: "PARENT_GOAL", parentItemId: { not: null } },
        select: { parentItemId: true },
      }),
    ]);

    const favSet = new Set(favorites.map((f) => f.parentItemId));

    const ranked = [...items]
      .sort((a, b) => {
        const fa = favSet.has(a.id) ? 1000 : 0;
        const fb = favSet.has(b.id) ? 1000 : 0;
        if (fb !== fa) return (fb + b.usageCount) - (fa + a.usageCount);
        return b.usageCount - a.usageCount;
      })
      .map((item) => ({ ...item, isFavoriteForUser: favSet.has(item.id) }));

    return NextResponse.json(ranked);
  } catch (err) {
    console.error("GET /api/parent-goal-library error:", err);
    return NextResponse.json({ error: "Failed to load library" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_goal_library.manage");
  if (denied) return denied;

  try {
    const body = await req.json() as {
      title?: string;
      description?: string | null;
      domain?: string | null;
      category?: string | null;
      skillArea?: string | null;
      notes?: string | null;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const item = await prisma.parentGoalLibraryItem.create({
      data: {
        title:       body.title.trim(),
        description: body.description?.trim() || null,
        domain:      body.domain?.trim() || null,
        category:    body.category?.trim() || null,
        skillArea:   body.skillArea?.trim() || null,
        notes:       body.notes?.trim() || null,
        createdById: user.id,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/parent-goal-library error:", err);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
