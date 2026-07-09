import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.assessment_templates.view");
  if (denied) return denied;
  const { templateId } = await params;

  try {
    const template = await prisma.assessmentTemplate.findUnique({
      where: { id: templateId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    });

    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(template);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
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
    const { name, description, category, version, scoringMethod, isActive } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (category !== undefined) data.category = category?.trim() || null;
    if (version !== undefined) data.version = version;
    if (scoringMethod !== undefined) data.scoringMethod = scoringMethod || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await prisma.assessmentTemplate.update({ where: { id: templateId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.assessment_templates.manage");
  if (denied) return denied;

  const { templateId } = await params;

  try {
    await prisma.assessmentTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
