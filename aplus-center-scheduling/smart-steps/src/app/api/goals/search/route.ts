import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireAnyPermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.goal_library.view", "smartsteps.parent_goal_library.view"]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const clientId = searchParams.get("clientId")?.trim() ?? "";
  const type     = searchParams.get("type") ?? "GOAL"; // GOAL | PARENT_GOAL

  if (!q && !clientId) return NextResponse.json({ goalItems: [], parentItems: [], clientGoals: [] });

  try {
    const textFilter = q
      ? {
          OR: [
            { title:                 { contains: q, mode: "insensitive" as const } },
            { operationalDefinition: { contains: q, mode: "insensitive" as const } },
            { category:              { contains: q, mode: "insensitive" as const } },
            { skillArea:             { contains: q, mode: "insensitive" as const } },
            { domain:                { contains: q, mode: "insensitive" as const } },
            { notes:                 { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    // Parallel fetch
    const [goalItems, parentItems, favs, recentLogs, clientTargets] = await Promise.all([
      type === "GOAL" ? prisma.targetLibraryItem.findMany({
        where:   { isActive: true, ...textFilter },
        orderBy: { usageCount: "desc" },
        take:    30,
      }) : Promise.resolve([]),

      type === "PARENT_GOAL" ? prisma.parentGoalLibraryItem.findMany({
        where:   { isActive: true, ...textFilter },
        orderBy: { usageCount: "desc" },
        take:    30,
      }) : Promise.resolve([]),

      prisma.userGoalFavorite.findMany({
        where:  { userId: user.id, itemType: type },
        select: { goalItemId: true, parentItemId: true },
      }),

      prisma.goalLibraryUsage.findMany({
        where:   { userId: user.id, itemType: type },
        orderBy: { usedAt: "desc" },
        take:    20,
        select:  { goalItemId: true, parentItemId: true, usedAt: true },
      }),

      // Also search existing client goals for the given client
      clientId && type === "GOAL" ? prisma.target.findMany({
        where: {
          isActive: true,
          parentGoal: { clientId },
          ...(q ? { definition: { contains: q, mode: "insensitive" as const } } : {}),
        },
        select: { id: true, definition: true, phase: true, baseline: true },
        take: 10,
        orderBy: { createdAt: "desc" },
      }) : Promise.resolve([]),
    ]);

    const favSet = new Set([
      ...favs.map((f) => f.goalItemId),
      ...favs.map((f) => f.parentItemId),
    ].filter(Boolean));

    const recentIds = new Map<string, Date>();
    for (const log of recentLogs) {
      const id = log.goalItemId ?? log.parentItemId;
      if (id && !recentIds.has(id)) recentIds.set(id, log.usedAt);
    }

    function scoreItem(id: string, title: string): number {
      const fav    = favSet.has(id) ? 1000 : 0;
      const recent = recentIds.has(id) ? 500 : 0;
      const exact  = title.toLowerCase() === q.toLowerCase() ? 100 : 0;
      const starts = title.toLowerCase().startsWith(q.toLowerCase()) ? 50 : 0;
      return fav + recent + exact + starts;
    }

    const rankedGoals = [...goalItems]
      .sort((a, b) => (scoreItem(b.id, b.title) + b.usageCount) - (scoreItem(a.id, a.title) + a.usageCount))
      .map((item) => ({
        ...item,
        isFavoriteForUser: favSet.has(item.id),
        isRecentlyUsed:    recentIds.has(item.id),
      }));

    const rankedParents = [...parentItems]
      .sort((a, b) => (scoreItem(b.id, b.title) + b.usageCount) - (scoreItem(a.id, a.title) + a.usageCount))
      .map((item) => ({
        ...item,
        isFavoriteForUser: favSet.has(item.id),
        isRecentlyUsed:    recentIds.has(item.id),
      }));

    return NextResponse.json({
      goalItems:   rankedGoals,
      parentItems: rankedParents,
      clientGoals: clientTargets,
    });
  } catch (err) {
    console.error("GET /api/goals/search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
