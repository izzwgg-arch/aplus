import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.report_templates.view");
  if (denied) return denied;
  const { templateId } = await params;

  const template = await prisma.reportTemplate.findUnique({
    where: { id: templateId },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.report_templates.manage");
  if (denied) return denied;
  const { templateId } = await params;

  const body = await req.json();
  const updated = await prisma.reportTemplate.update({
    where: { id: templateId },
    data: {
      name:        body.name        !== undefined ? String(body.name)        : undefined,
      description: body.description !== undefined ? (body.description || null) : undefined,
      type:        body.type        !== undefined ? String(body.type)        : undefined,
      isActive:    body.isActive    !== undefined ? Boolean(body.isActive)   : undefined,
    },
    include: { sections: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.report_templates.manage");
  if (denied) return denied;
  const { templateId } = await params;

  await prisma.reportTemplate.delete({ where: { id: templateId } });
  return new NextResponse(null, { status: 204 });
}
