import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

export async function PATCH(req: Request, { params }: { params: Promise<{ templateId: string; sectionId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sectionId } = await params;

  const body = await req.json();
  const updated = await prisma.reportTemplateSection.update({
    where: { id: sectionId },
    data: {
      title:   body.title   !== undefined ? String(body.title)                    : undefined,
      content: body.content !== undefined ? sanitizeHtml(String(body.content))   : undefined,
      order:   body.order   !== undefined ? Number(body.order)                   : undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ templateId: string; sectionId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sectionId } = await params;

  await prisma.reportTemplateSection.delete({ where: { id: sectionId } });
  return new NextResponse(null, { status: 204 });
}
