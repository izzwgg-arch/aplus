import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function POST(
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
    const { title, description } = body;

    if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

    const existing = await prisma.assessmentSection.count({ where: { templateId } });

    const section = await prisma.assessmentSection.create({
      data: {
        templateId,
        title: title.trim(),
        description: description?.trim() || null,
        sortOrder: existing,
      },
      include: { items: true },
    });

    return NextResponse.json(section, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
