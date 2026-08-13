import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireAnyPermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// GET  — fetch recently used goal library items for this user (last 10)
export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.goal_library.view", "smartsteps.parent_goal_library.view"]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") ?? "GOAL") as "GOAL" | "PARENT_GOAL";

  try {
    const logs = await prisma.goalLibraryUsage.findMany({
      where:   { userId: user.id, itemType: type },
      orderBy: { usedAt: "desc" },
      take:    10,
      include: {
        goalItem:   type === "GOAL"        ? true : false,
        parentItem: type === "PARENT_GOAL" ? true : false,
      },
    });

    // Deduplicate by itemId (keep most recent only)
    const seen = new Set<string>();
    const unique = logs.filter((log) => {
      const id = log.goalItemId ?? log.parentItemId;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return NextResponse.json(unique);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load recently used" }, { status: 500 });
  }
}

// POST — record usage AFTER a goal has been confirmed saved to a client
export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      itemId: string;
      itemType: "GOAL" | "PARENT_GOAL";
    };

    if (!body.itemId || !body.itemType) {
      return NextResponse.json({ error: "itemId and itemType required" }, { status: 400 });
    }

    // Insert usage log — Prisma generates the id via @default(cuid())
    await prisma.goalLibraryUsage.create({
      data: {
        userId:       user.id,
        itemType:     body.itemType,
        goalItemId:   body.itemType === "GOAL"        ? body.itemId : null,
        parentItemId: body.itemType === "PARENT_GOAL" ? body.itemId : null,
        usedAt:       new Date(),
      },
    });

    // Increment usage count on the library item
    if (body.itemType === "GOAL") {
      await prisma.targetLibraryItem.update({
        where: { id: body.itemId },
        data:  { usageCount: { increment: 1 } },
      });
    } else {
      await prisma.parentGoalLibraryItem.update({
        where: { id: body.itemId },
        data:  { usageCount: { increment: 1 } },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to record usage" }, { status: 500 });
  }
}
