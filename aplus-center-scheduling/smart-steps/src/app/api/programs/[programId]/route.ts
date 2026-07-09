import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse, requireAnyPermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/auditLogger";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.programs.view.assigned", "smartsteps.programs.view.all"]);
  if (denied) return denied;
  const { programId } = await params;
  try {
    const program = await prisma.program.findUnique({
      where: { id: programId },
      include: { targets: { orderBy: { createdAt: "asc" } } },
    });
    if (!program) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(program);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.programs.edit");
  if (denied) return denied;
  const { programId } = await params;
  try {
    const body = await req.json() as { name?: string; domain?: string; isActive?: boolean };
    const updated = await prisma.program.update({ where: { id: programId }, data: body });
    await auditLog(user.id, "UPDATE_PROGRAM", "Program", programId, { changes: body });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ programId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.programs.delete");
  if (denied) return denied;
  const { programId } = await params;
  try {
    await prisma.program.update({ where: { id: programId }, data: { isActive: false } });
    await auditLog(user.id, "UPDATE_PROGRAM", "Program", programId, { action: "archive" });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
