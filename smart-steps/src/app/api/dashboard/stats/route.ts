import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse, accessibleClientIds } from "@/lib/permissions";
import { prisma } from "@/lib/db";

/**
 * GET /smart-steps/api/dashboard/stats
 *
 * Every figure here is limited to the clients the signed-in user may see.
 * Staff who only hold the `.assigned` permission variants (BT/RBT) get counts
 * and recent sessions for THEIR assigned clients only — never other clients'
 * names or activity. Roles with the `.all` variants (BCBA/Admin) see everything.
 */
export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.dashboard.view");
  if (denied) return denied;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [sessionScope, clientScope, goalScope, assessmentScope] = await Promise.all([
      accessibleClientIds(user.id, "smartsteps.sessions.view"),
      accessibleClientIds(user.id, "smartsteps.clients.view"),
      accessibleClientIds(user.id, "smartsteps.goals.view"),
      accessibleClientIds(user.id, "smartsteps.assessments.view"),
    ]);

    const sessionClientFilter = sessionScope === "ALL" ? {} : { clientId: { in: sessionScope } };

    // Sessions today (for the clients this user may see)
    const sessionsToday = await prisma.session.count({
      where: { startedAt: { gte: today }, deletedAt: null, ...sessionClientFilter },
    });

    // Total active clients
    const totalClients = await prisma.client.count({
      where: { isArchived: false, ...(clientScope === "ALL" ? {} : { id: { in: clientScope } }) },
    });

    // Active targets — a target belongs to a client through its parent goal,
    // either directly or via its sub-goal.
    const activeTargets = await prisma.target.count({
      where: {
        isActive: true,
        phase: { not: "MASTERED" },
        ...(goalScope === "ALL"
          ? {}
          : {
              OR: [
                { parentGoal: { clientId: { in: goalScope } } },
                { subGoal: { parentGoal: { clientId: { in: goalScope } } } },
              ],
            }),
      },
    });

    // Pending sync items (from offline queue — just return 0, client handles this)
    const pendingSync = 0;

    // Recent sessions (last 5)
    const recentSessions = await prisma.session.findMany({
      where: { deletedAt: null, ...sessionClientFilter },
      take: 5,
      orderBy: { startedAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        user: { select: { name: true } },
        _count: { select: { trials: { where: { deletedAt: null } } } },
      },
    });

    // Assessments in progress
    const assessmentsInProgress = await prisma.clientAssessment.count({
      where: {
        status: "IN_PROGRESS",
        ...(assessmentScope === "ALL" ? {} : { clientId: { in: assessmentScope } }),
      },
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
