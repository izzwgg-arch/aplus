import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { canForClient, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const report = await prisma.clientReport.findUnique({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" } },
      client:   { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = await canForClient(user.id, report.clientId, "smartsteps.reports.view");
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(report);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.reports.edit");
  if (denied) return denied;
  const { reportId } = await params;

  const body = await req.json();
  const updated = await prisma.clientReport.update({
    where: { id: reportId },
    data: {
      title:  body.title  !== undefined ? String(body.title)  : undefined,
      status: body.status !== undefined ? String(body.status) : undefined,
    },
    include: {
      sections: { orderBy: { order: "asc" } },
      client:   { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.reports.delete");
  if (denied) return denied;
  const { reportId } = await params;

  // Same client-scope check GET applies — the delete permission alone must not
  // reach a report belonging to a client this user cannot see.
  const report = await prisma.clientReport.findUnique({
    where: { id: reportId },
    select: { clientId: true },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = await canForClient(user.id, report.clientId, "smartsteps.reports.view");
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.clientReport.delete({ where: { id: reportId } });
  return new NextResponse(null, { status: 204 });
}
