import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { auditLog } from "@/lib/auditLogger";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.clients.view");
  if (denied) return denied;

  try {
    const assignments = await prisma.clientAssignment.findMany({
      where: { clientId },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    return NextResponse.json(assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      role: a.role,
      name: a.user.name,
      email: a.user.email,
    })));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.assignments.manage");
  if (denied) return denied;

  const { clientId } = await params;

  try {
    const body = await req.json();
    const { userId, assignmentRole } = body;

    if (!userId || !assignmentRole) {
      return NextResponse.json({ error: "userId and assignmentRole required" }, { status: 400 });
    }

    const assignment = await prisma.clientAssignment.upsert({
      where: { clientId_userId: { clientId, userId } },
      update: { role: assignmentRole },
      create: { clientId, userId, role: assignmentRole },
    });

    await auditLog(user.id, "CLIENT_ASSIGNMENT_CREATED", "ClientAssignment", assignment.id, {
      clientId, userId, role: assignmentRole,
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to assign" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.assignments.manage");
  if (denied) return denied;

  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  try {
    await prisma.clientAssignment.delete({
      where: { clientId_userId: { clientId, userId } },
    });
    await auditLog(user.id, "CLIENT_ASSIGNMENT_REMOVED", "ClientAssignment", null, { clientId, userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}
