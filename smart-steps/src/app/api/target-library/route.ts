import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.target_library.view");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const q          = searchParams.get("q")?.trim() ?? "";
  const activeOnly = searchParams.get("isActive") !== "false";

  try {
    const where: Prisma.TargetLibraryItemWhereInput = {
      ...(activeOnly ? { isActive: true } : {}),
      ...(q ? {
        OR: [
          { title:                 { contains: q, mode: "insensitive" } },
          { operationalDefinition: { contains: q, mode: "insensitive" } },
          { category:              { contains: q, mode: "insensitive" } },
          { skillArea:             { contains: q, mode: "insensitive" } },
          { domain:                { contains: q, mode: "insensitive" } },
          { notes:                 { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    };

    const items = await prisma.targetLibraryItem.findMany({
      where,
      orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json(items);
  } catch (err) {
    console.error("GET /api/target-library error:", err);
    return NextResponse.json({ error: "Failed to load library" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.target_library.manage");
  if (denied) return denied;

  try {
    const body = await req.json() as {
      title?: string;
      operationalDefinition?: string | null;
      targetType?: string;
      masteryRule?: unknown;
      promptHierarchy?: string[];
      baseline?: string | null;
      notes?: string | null;
      category?: string | null;
      skillArea?: string | null;
      domain?: string | null;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const item = await prisma.targetLibraryItem.create({
      data: {
        title:                 body.title.trim(),
        operationalDefinition: body.operationalDefinition?.trim() || null,
        targetType:            body.targetType || "DISCRETE_TRIAL",
        masteryRule:           body.masteryRule ?? Prisma.JsonNull,
        promptHierarchy:       Array.isArray(body.promptHierarchy) ? body.promptHierarchy : [],
        baseline:              body.baseline?.trim() || null,
        notes:                 body.notes?.trim() || null,
        category:              body.category?.trim() || null,
        skillArea:             body.skillArea?.trim() || null,
        domain:                body.domain?.trim() || null,
        createdById:           user.id,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/target-library error:", err);
    return NextResponse.json({ error: "Failed to save library item" }, { status: 500 });
  }
}
