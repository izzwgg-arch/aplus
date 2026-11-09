import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ sessionId: string; targetId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId, targetId } = await params;

  // Check permission: must have either trials.delete or sessions.edit
  const hasPerm = await requirePermissionResponse(user.id, "smartsteps.trials.delete");
  if (!hasPerm) {
    const hasSessEdit = await requirePermissionResponse(user.id, "smartsteps.sessions.edit");
    if (hasSessEdit) return hasSessEdit;
  }

  // Load session and check client access
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, clientId: true, deletedAt: true },
  });
  if (!session || session.deletedAt) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const accessDenied = await requireClientAccessResponse(user.id, session.clientId, "smartsteps.sessions.view");
  if (accessDenied) return accessDenied;

  // Verify target belongs to this session's client
  const target = await prisma.target.findFirst({
    where: {
      id: targetId,
      OR: [
        { parentGoal: { clientId: session.clientId } },
        { subGoal: { parentGoal: { clientId: session.clientId } } },
        { program: { clientId: session.clientId } },
      ],
    },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Goal not found or does not belong to this client" }, { status: 404 });
  }

  try {
    // Delete all trials for this target in this session
    const result = await prisma.trial.deleteMany({
      where: {
        sessionId,
        targetId,
      },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (e) {
    console.error(`DELETE /sessions/[${sessionId}]/targets/[${targetId}]/trials error:`, e);
    return NextResponse.json({ error: "Failed to delete trials" }, { status: 500 });
  }
}
