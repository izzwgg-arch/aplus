import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { accessibleClientIds, requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  // Pagination: default page size 50, capped at 200 per request to protect the
  // DB, with `offset` for navigating the COMPLETE history (no arbitrary ceiling
  // on how far back you can page — today, recent, older, and backdated).
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  // Filters. These MUST be applied server-side: the list is paginated, so
  // filtering only the loaded page would silently hide matches that live on a
  // page the user has not scrolled to yet.
  const from = searchParams.get("from");        // yyyy-mm-dd, inclusive (service date)
  const to = searchParams.get("to");            // yyyy-mm-dd, inclusive (service date)
  const providerId = searchParams.get("providerId");
  const mode = searchParams.get("mode");
  const withData = searchParams.get("withData") === "1"; // hide empty (0-trial) sessions
  // "1" = only sessions that already have a note, "0" = only sessions still
  // missing one (the daily "what do I still have to write up?" question).
  const hasNoteParam = searchParams.get("hasNote");

  if (clientId) {
    const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.sessions.view");
    if (denied) return denied;
  }
  const clientIds = clientId ? null : await accessibleClientIds(user.id, "smartsteps.sessions.view");

  const startedAt: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(d.getTime())) startedAt.gte = d;
  }
  if (to) {
    const d = new Date(`${to}T23:59:59.999`);
    if (!Number.isNaN(d.getTime())) startedAt.lte = d;
  }

  try {
    const sessions = await prisma.session.findMany({
      where: {
        // Soft-deleted sessions never appear in any list.
        deletedAt: null,
        ...(clientId ? { clientId } : (clientIds === "ALL" ? {} : { clientId: { in: clientIds as string[] } })),
        ...(startedAt.gte || startedAt.lte ? { startedAt } : {}),
        ...(providerId ? { userId: providerId } : {}),
        ...(mode ? { mode } : {}),
        ...(withData ? { trials: { some: { deletedAt: null } } } : {}),
        ...(hasNoteParam === "1" ? { sessionNotes: { some: {} } } : {}),
        ...(hasNoteParam === "0" ? { sessionNotes: { none: {} } } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        mode: true,
        clientId: true,
        userId: true,
        notes: true,
        user: { select: { id: true, name: true, displayRole: true, role: true } },
        trials: {
          where: { deletedAt: null },
          select: { result: true },
        },
        // Notes written for this session. `Note.isGenerated` distinguishes a
        // note produced by "Generate BT Note" from one typed by hand.
        sessionNotes: {
          orderBy: { createdAt: "desc" },
          select: { id: true, isGenerated: true, createdAt: true },
        },
        _count: { select: { trials: true, addedTargets: true } },
      },
    });

    const result = sessions.map((s) => {
      const correct = s.trials.filter((t) => t.result === "CORRECT" || t.result === "INDEPENDENT").length;
      const total = s.trials.length;
      const latestNote = s.sessionNotes[0] ?? null;
      return {
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        createdAt: s.createdAt,
        mode: s.mode,
        clientId: s.clientId,
        trialCount: total,
        pctCorrect: total > 0 ? (correct / total) * 100 : null,
        providerId: s.userId,
        therapistName: s.user?.name ?? null,
        therapistRole: s.user?.displayRole ?? s.user?.role ?? null,
        hasNotes: Boolean(s.notes?.trim()),
        noteCount: s.sessionNotes.length,
        noteGeneratedAt: latestNote?.createdAt ?? null,
        noteIsGenerated: latestNote ? latestNote.isGenerated : null,
        addedGoalCount: s._count.addedTargets,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /sessions error:", e);
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = await requirePermissionResponse(user.id, "smartsteps.sessions.create");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { clientId, mode, startedAt, endedAt, providerId } = body as {
      clientId?: string;
      mode?: string;
      startedAt?: string;
      endedAt?: string;
      providerId?: string;
    };
    if (!clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }
    const clientDenied = await requireClientAccessResponse(user.id, clientId, "smartsteps.sessions.view");
    if (clientDenied) return clientDenied;
    const sessionRecord = await prisma.session.create({
      data: {
        clientId,
        userId: providerId ?? user.id,
        mode: mode || "DTT",
        ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
        ...(endedAt ? { endedAt: new Date(endedAt) } : {}),
      },
    });
    return NextResponse.json({ id: sessionRecord.id });
  } catch (e) {
    console.error("POST /sessions error:", e);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
