import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyParentToken } from "@/app/api/parent/generate-token/route";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) return NextResponse.json({ error: "Token required" }, { status: 401 });

  const payload = verifyParentToken(token);
  if (!payload || payload.clientId !== clientId) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      dob: true,
      diagnosis: true,
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 10,
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          _count: { select: { trials: true } },
        },
      },
      programs: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          domain: true,
          targets: {
            where: { isActive: true },
            select: {
              id: true,
              definition: true,
              phase: true,
              trials: {
                orderBy: { createdAt: "desc" },
                take: 20,
                select: { result: true, createdAt: true },
              },
            },
          },
        },
      },
    },
  });

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Compute age
  const age = client.dob
    ? Math.floor((Date.now() - new Date(client.dob).getTime()) / (365.25 * 86400000))
    : null;

  // Aggregate trial progress
  const allTargets = client.programs.flatMap((p) => p.targets);
  const totalTargets = allTargets.length;
  const masteredTargets = allTargets.filter((t) => {
    const recent = t.trials.slice(0, 10);
    if (recent.length < 3) return false;
    const correctPct = recent.filter((r) => r.result === "CORRECT").length / recent.length;
    return correctPct >= 0.8;
  }).length;

  // Build weekly progress data
  const weeklyMap = new Map<string, { correct: number; total: number }>();
  for (const target of allTargets) {
    for (const trial of target.trials) {
      const week = new Date(trial.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const entry = weeklyMap.get(week) ?? { correct: 0, total: 0 };
      entry.total++;
      if (trial.result === "CORRECT") entry.correct++;
      weeklyMap.set(week, entry);
    }
  }
  const progressData = Array.from(weeklyMap.entries())
    .slice(-8)
    .map(([date, { correct, total }]) => ({
      date,
      pct: total > 0 ? Math.round((correct / total) * 100) : 0,
    }));

  const recentSessions = client.sessions.map((s) => ({
    date: s.startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    duration: s.endedAt
      ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)
      : null,
    trialCount: s._count.trials,
  }));

  return NextResponse.json({
    id: client.id,
    name: client.name,
    age,
    diagnosis: client.diagnosis,
    totalTargets,
    masteredTargets,
    progressData,
    recentSessions,
  });
}
