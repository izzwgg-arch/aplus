import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// Full rebuild: replace all sections and items for a template
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.assessment_templates.manage");
  if (denied) return denied;

  const { templateId } = await params;

  try {
    const body = await req.json();
    const { name, description, category, version, scoringMethod, sections } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

    // Update template metadata
    await prisma.assessmentTemplate.update({
      where: { id: templateId },
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        version: version ?? "1.0",
        scoringMethod: scoringMethod || null,
      },
    });

    // Delete all existing sections (cascades to items)
    await prisma.assessmentSection.deleteMany({ where: { templateId } });

    // Recreate sections and items
    if (sections?.length) {
      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        const newSection = await prisma.assessmentSection.create({
          data: {
            templateId,
            title: s.title,
            description: s.description || null,
            sortOrder: si,
          },
        });

        if (s.items?.length) {
          for (let ii = 0; ii < s.items.length; ii++) {
            const item = s.items[ii];
            await prisma.assessmentItem.create({
              data: {
                sectionId: newSection.id,
                text: item.text,
                description: item.description || null,
                responseType: item.responseType,
                options: item.options ?? null,
                scoreValue: item.scoreValue ?? null,
                isRequired: item.isRequired ?? false,
                sortOrder: ii,
              },
            });
          }
        }
      }
    }

    const updated = await prisma.assessmentTemplate.findUnique({
      where: { id: templateId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 });
  }
}
