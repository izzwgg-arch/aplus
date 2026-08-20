import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ sessionId: string }> };

/**
 * Goals attached to a session by hand — a program that was run without trial
 * data, or a goal a BCBA adds to the session after the fact. Trial-backed goals
 * still come from `Trial`; these are the extra ones. Everything attached here
 * shows up in the Session Snapshot and in the generated BT session note.
 */

/** A target may only be attached to a session belonging to the SAME client. */
async function targetIsForClient(targetId: string, clientId: string): Promise<boolean> {
  const owned = await prisma.target.findFirst({
    where: {
      id: targetId,
      OR: [
        { parentGoal: { clientId } },
        { subGoal: { parentGoal: { clientId } } },
        { program: { clientId } },
      ],
    },
    select: { id: true },
  });
  return Boolean(owned);
}

/** Loads the session and runs the permission + client-access checks. */
async function loadEditableSession(userId: string, sessionId: string) {
  const denied = await requirePermissionResponse(userId, "smartsteps.sessions.edit");
  if (denied) return { denied };

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, clientId: true, deletedAt: true },
  });
  if (!session || session.deletedAt) {
    return { denied: NextResponse.json({ error: "Session not found" }, { status: 404 }) };
  }

  const accessDenied = await requireClientAccessResponse(userId, session.clientId, "smartsteps.sessions.view");
  if (accessDenied) return { denied: accessDenied };

  return { session };
}

export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true, deletedAt: true },
  });
  if (!session || session.deletedAt) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const denied = await requireClientAccessResponse(user.id, session.clientId, "smartsteps.sessions.view");
  if (denied) return denied;

  const links = await prisma.sessionTarget.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      targetId: true,
      note: true,
      createdAt: true,
      addedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(links);
}

export async function POST(req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  if (sessionId.startsWith("local-")) {
    return NextResponse.json({ error: "Sync this session before adding goals to it" }, { status: 400 });
  }

  const { denied, session } = await loadEditableSession(user.id, sessionId);
  if (denied) return denied;

  try {
    const body = await req.json() as { targetId?: string; targetIds?: string[]; note?: string };
    const targetIds = (body.targetIds ?? (body.targetId ? [body.targetId] : []))
      .map((id) => String(id).trim())
      .filter(Boolean);
    if (targetIds.length === 0) {
      return NextResponse.json({ error: "targetId required" }, { status: 400 });
    }

    const note = body.note?.trim() || null;

    for (const targetId of targetIds) {
      if (!(await targetIsForClient(targetId, session!.clientId))) {
        return NextResponse.json({ error: "Goal does not belong to this client" }, { status: 400 });
      }
    }

    // Re-adding an existing goal just refreshes its note rather than erroring.
    await prisma.$transaction(
      targetIds.map((targetId) =>
        prisma.sessionTarget.upsert({
          where: { sessionId_targetId: { sessionId, targetId } },
          create: { sessionId, targetId, note, addedById: user.id },
          update: { note },
        })
      )
    );

    return NextResponse.json({ ok: true, added: targetIds.length }, { status: 201 });
  } catch (e) {
    console.error("POST /sessions/[sessionId]/targets error:", e);
    return NextResponse.json({ error: "Failed to add goal to session" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  const { denied } = await loadEditableSession(user.id, sessionId);
  if (denied) return denied;

  const targetId = new URL(req.url).searchParams.get("targetId");
  if (!targetId) return NextResponse.json({ error: "targetId required" }, { status: 400 });

  try {
    // Only the hand-attached link is removed; trials (and therefore trial-backed
    // goals) are untouched — those are removed by deleting the trials.
    const removed = await prisma.sessionTarget.deleteMany({ where: { sessionId, targetId } });
    return NextResponse.json({ ok: true, removed: removed.count });
  } catch (e) {
    console.error("DELETE /sessions/[sessionId]/targets error:", e);
    return NextResponse.json({ error: "Failed to remove goal from session" }, { status: 500 });
  }
}
