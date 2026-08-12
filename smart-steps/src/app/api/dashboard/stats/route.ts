import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sessions today (all therapists)
    const sessionsToday = await prisma.session.count({
      where: { startedAt: { gte: today } },
    });

    // Total active clients
    const totalClients = await prisma.client.count({
      where: { isArchived: false },
    });

    // Active targets
    const activeTargets = await prisma.target.count({
      where: {
        isActive: true,
        phase: { not: "MASTERED" },
      },
    });

    // Pending sync items (from offline queue — just return 0, client handles this)
    const pendingSync = 0;

    // Recent sessions (last 5)
    const recentSessions = await prisma.session.findMany({
      where: {},
      take: 5,
      orderBy: { startedAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        user: { select: { name: true } },
        _count: { select: { trials: true } },
      },
    });

    // Assessments in progress
    const assessmentsInProgress = await prisma.clientAssessment.count({
      where: { status: "IN_PROGRESS" },
    });

    return NextResponse.json({
      sessionsToday,
      totalClients,
      activeTargets,
      pendingSync,
      assessmentsInProgress,
      recentSessions: recentSessions.map((s) => ({
        id: s.id,
        clientId: s.client.id,
        clientName: s.client.name,
        therapistName: s.user.name,
        startedAt: s.startedAt.toISOString(),
        trialCount: s._count.trials,
      })),
    });
  } catch (err) {
    console.error("GET /api/dashboard/stats error:", err);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
