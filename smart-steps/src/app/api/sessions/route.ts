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

  if (clientId) {
    const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.sessions.view");
    if (denied) return denied;
  }
  const clientIds = clientId ? null : await accessibleClientIds(user.id, "smartsteps.sessions.view");

  try {
    const sessions = await prisma.session.findMany({
      where: clientId ? { clientId } : (clientIds === "ALL" ? {} : { clientId: { in: clientIds as string[] } }),
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
        user: { select: { name: true } },
        _count: { select: { trials: true } },
        trials: {
          where: { deletedAt: null },
          select: { result: true },
        },
      },
    });

    const result = sessions.map((s) => {
      const correct = s.trials.filter((t) => t.result === "CORRECT" || t.result === "INDEPENDENT").length;
      const total = s.trials.length;
      return {
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        createdAt: s.createdAt,
        mode: s.mode,
        clientId: s.clientId,
        trialCount: total,
        pctCorrect: total > 0 ? (correct / total) * 100 : null,
        therapistName: s.user?.name ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
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
