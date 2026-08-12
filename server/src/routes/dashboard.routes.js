import express from "express";
import { addDays, endOfDay, endOfWeek, startOfDay, startOfWeek } from "date-fns";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";

const router = express.Router();
router.use(requireAuth);
router.use(requirePermission("aplus.dashboard.view"));

function resolveRange(query, now) {
  const preset = query.rangePreset ? String(query.rangePreset) : "this_week";
  const customStart = query.startDate ? new Date(String(query.startDate)) : null;
  const customEnd = query.endDate ? new Date(String(query.endDate)) : null;
  const hasCustom = customStart && customEnd
    && !Number.isNaN(customStart.getTime())
    && !Number.isNaN(customEnd.getTime());

  if (hasCustom) {
    return {
      rangePreset: "custom",
      rangeStart: customStart,
      rangeEnd: customEnd
    };
  }

  if (preset === "last_week") {
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
    const lastWeekStart = startOfWeek(lastWeekEnd, { weekStartsOn: 1 });
    return {
      rangePreset: "last_week",
      rangeStart: lastWeekStart,
      rangeEnd: endOfWeek(lastWeekStart, { weekStartsOn: 1 })
    };
  }

  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  return {
    rangePreset: "this_week",
    rangeStart: thisWeekStart,
    rangeEnd: endOfWeek(thisWeekStart, { weekStartsOn: 1 })
  };
}

router.get("/stats", async (req, res) => {
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const { rangePreset, rangeStart, rangeEnd } = resolveRange(req.query, now);

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [
    upcomingAppointmentsCount,
    overdueReportsAppointments,
    todaysAppointmentsCount,
    cancellationsThisWeekCount,
    pendingInvoicesCount,
    weeklyAppointments
  ] = await Promise.all([
    prisma.appointment.count({
      where: { startsAt: { gte: now }, status: "SCHEDULED" }
    }),
    prisma.appointment.findMany({
      where: {
        status: "COMPLETED",
        endsAt: { lte: oneHourAgo },
        report: null
      },
      include: {
        client: { select: { id: true, fullName: true } },
        service: { select: { id: true, name: true } },
        provider: { select: { id: true, fullName: true } }
      },
      orderBy: { endsAt: "asc" }
    }),
    prisma.appointment.count({
      where: {
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { not: "CANCELLED" }
      }
    }),
    prisma.appointment.count({
      where: {
        status: "CANCELLED",
        updatedAt: { gte: rangeStart, lte: rangeEnd }
      }
    }),
    prisma.invoice.count({
      where: { status: { in: ["DRAFT", "SENT"] } }
    }),
    prisma.appointment.findMany({
      where: {
        startsAt: { gte: rangeStart, lte: rangeEnd }
      },
      include: {
        bcba: { select: { id: true, fullName: true } }
      }
    })
  ]);

  const weeklyScheduledHours = weeklyAppointments
    .filter((appt) => appt.status !== "CANCELLED")
    .reduce((sum, appt) => sum + (appt.durationMinutes / 60), 0);

  const completedThisWeekCount = weeklyAppointments.filter((appt) => appt.status === "COMPLETED").length;
  const cancelledThisWeekCount = weeklyAppointments.filter((appt) => appt.status === "CANCELLED").length;
  const resolvedCount = completedThisWeekCount + cancelledThisWeekCount;
  const completionRatePct = resolvedCount ? Math.round((completedThisWeekCount / resolvedCount) * 100) : 0;
  const cancellationRatePct = resolvedCount ? Math.round((cancelledThisWeekCount / resolvedCount) * 100) : 0;

  const workloadMap = new Map();
  for (const appt of weeklyAppointments) {
    if (appt.status === "CANCELLED") continue;
    const key = appt.bcbaId;
    const current = workloadMap.get(key) || {
      bcbaId: appt.bcbaId,
      bcbaName: appt.bcba?.fullName || "Unassigned",
      scheduledCount: 0,
      scheduledHours: 0
    };
    current.scheduledCount += 1;
    current.scheduledHours += appt.durationMinutes / 60;
    workloadMap.set(key, current);
  }
  const bcbaWorkload = Array.from(workloadMap.values())
    .sort((a, b) => b.scheduledHours - a.scheduledHours)
    .slice(0, 10)
    .map((item) => ({
      ...item,
      scheduledHours: Number(item.scheduledHours.toFixed(2))
    }));

  const statusBreakdown = {
    SCHEDULED: weeklyAppointments.filter((appt) => appt.status === "SCHEDULED").length,
    COMPLETED: weeklyAppointments.filter((appt) => appt.status === "COMPLETED").length,
    CANCELLED: weeklyAppointments.filter((appt) => appt.status === "CANCELLED").length,
    RESCHEDULED: weeklyAppointments.filter((appt) => appt.status === "RESCHEDULED").length
  };

  const hoursByDayMap = new Map();
  for (const appt of weeklyAppointments) {
    if (appt.status === "CANCELLED") continue;
    const dateKey = appt.startsAt.toISOString().slice(0, 10);
    const current = hoursByDayMap.get(dateKey) || 0;
    hoursByDayMap.set(dateKey, current + (appt.durationMinutes / 60));
  }
  const dailyScheduledHoursTrend = [];
  for (let cursor = startOfDay(rangeStart); cursor <= endOfDay(rangeEnd); cursor = addDays(cursor, 1)) {
    const key = cursor.toISOString().slice(0, 10);
    const hours = Number((hoursByDayMap.get(key) || 0).toFixed(2));
    dailyScheduledHoursTrend.push({ date: key, hours });
  }

  const overdueReportsCount = overdueReportsAppointments.length;
  const overdueReports = overdueReportsAppointments.map((a) => ({
    id: a.id,
    startsAt: a.startsAt?.toISOString?.(),
    endsAt: a.endsAt?.toISOString?.(),
    clientName: a.client?.fullName ?? null,
    serviceName: a.service?.name ?? a.serviceNameSnapshot ?? null,
    providerName: a.provider?.fullName ?? a.providerNameSnapshot ?? null
  }));

  return res.json({
    upcomingAppointmentsCount,
    overdueReportsCount,
    overdueReports,
    todaysAppointmentsCount,
    cancellationsThisWeekCount,
    pendingInvoicesCount,
    weeklyScheduledHours: Number(weeklyScheduledHours.toFixed(2)),
    completedThisWeekCount,
    completionRatePct,
    cancellationRatePct,
    statusBreakdown,
    dailyScheduledHoursTrend,
    bcbaWorkload,
    rangePreset,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString()
  });
});

export default router;
