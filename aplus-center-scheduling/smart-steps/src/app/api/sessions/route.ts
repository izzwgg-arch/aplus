import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ensureUser } from "@/lib/ensureUser";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

  try {
    const sessions = await prisma.session.findMany({
      where: clientId ? { clientId } : {},
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        clientId: true,
        user: { select: { name: true } },
        _count: { select: { trials: true } },
        trials: {
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
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guarantee the SSO user exists in the smart_steps.User table
  await ensureUser({
    id: userId,
    email: session.user?.email,
    name: session.user?.name,
    role: (session.user as { role?: string })?.role,
  });

  try {
    const body = await req.json();
    const { clientId } = body as { clientId?: string };
    if (!clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }
    const sessionRecord = await prisma.session.create({
      data: { clientId, userId },
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
