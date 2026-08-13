import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ templateId: string; sectionId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.assessment_templates.manage");
  if (denied) return denied;

  const { sectionId } = await params;

  try {
    const body = await req.json();
    const { text, description, responseType, options, scoreValue, isRequired } = body;

    if (!text?.trim()) return NextResponse.json({ error: "Item text required" }, { status: 400 });
    if (!responseType) return NextResponse.json({ error: "Response type required" }, { status: 400 });

    const existing = await prisma.assessmentItem.count({ where: { sectionId } });

    const item = await prisma.assessmentItem.create({
      data: {
        sectionId,
        text: text.trim(),
        description: description?.trim() || null,
        responseType,
        options: options ?? null,
        scoreValue: scoreValue ?? null,
        isRequired: isRequired ?? false,
        sortOrder: existing,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sectionId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.assessment_templates.manage");
  if (denied) return denied;

  const { sectionId } = await params;
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId");

  if (itemId) {
    await prisma.assessmentItem.delete({ where: { id: itemId } });
  } else {
    await prisma.assessmentSection.delete({ where: { id: sectionId } });
  }

  return NextResponse.json({ ok: true });
}
