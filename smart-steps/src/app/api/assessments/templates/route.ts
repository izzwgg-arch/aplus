import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.assessment_templates.view");
  if (denied) return denied;

  try {
    const templates = await prisma.assessmentTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
        _count: {
          select: { clientAssessments: true },
        },
      },
    });

    return NextResponse.json(templates);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.assessment_templates.manage");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { name, description, category, version, scoringMethod, sections } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const template = await prisma.assessmentTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        version: version ?? "1.0",
        scoringMethod: scoringMethod || null,
        createdBy: user.id,
        isActive: true,
        sections: sections?.length
          ? {
              create: sections.map((s: { title: string; description?: string; sortOrder?: number; items?: Array<{ text: string; description?: string; responseType: string; options?: unknown; scoreValue?: number; sortOrder?: number; isRequired?: boolean }> }, si: number) => ({
                title: s.title,
                description: s.description || null,
                sortOrder: s.sortOrder ?? si,
                items: s.items?.length
                  ? {
                      create: s.items.map((item, ii) => ({
                        text: item.text,
                        description: item.description || null,
                        responseType: item.responseType,
                        options: item.options ?? null,
                        scoreValue: item.scoreValue ?? null,
                        sortOrder: item.sortOrder ?? ii,
                        isRequired: item.isRequired ?? false,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
