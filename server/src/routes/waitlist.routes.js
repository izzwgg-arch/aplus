import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { writeAuditLog } from "../services/auditLogService.js";

const router = express.Router();
router.use(requireAuth);

const INCLUDE = {
  client:   { select: { id: true, fullName: true, phone: true, email: true } },
  service:  { select: { id: true, name: true, colorTag: true } },
  provider: { select: { id: true, fullName: true, colorTag: true } },
};

// ── GET / — list with filters ─────────────────────────────────────────────────
router.get("/", requirePermission("aplus.waitlist.view"), async (req, res) => {
  const { status, serviceId, providerId, priority, search, page = 1, limit = 100 } = req.query;

  const where = {};

  // Default: hide Scheduled/Removed/Declined unless explicitly requested
  if (status === "ALL") {
    // no filter
  } else if (status) {
    where.status = status;
  } else {
    where.status = { in: ["WAITING", "CONTACTED", "NO_RESPONSE"] };
  }

  if (serviceId)  where.serviceId  = serviceId;
  if (providerId) where.providerId = providerId;
  if (priority)   where.priority   = priority;

  if (search) {
    where.client = { fullName: { contains: search, mode: "insensitive" } };
  }

  const [entries, total] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where,
      include: INCLUDE,
      orderBy: { queuePosition: "asc" },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    }),
    prisma.waitlistEntry.count({ where }),
  ]);

  return res.json({ entries, total });
});

// ── POST / — add to bottom of queue ──────────────────────────────────────────
router.post("/", requirePermission("aplus.waitlist.create"), async (req, res) => {
  const { clientId, serviceId, providerId, priority, notes } = req.body;
  if (!clientId) return res.status(400).json({ error: "clientId is required" });

  // Get next queue position
  const maxPos = await prisma.waitlistEntry.aggregate({
    _max: { queuePosition: true },
    where: { status: { in: ["WAITING", "CONTACTED", "NO_RESPONSE"] } },
  });
  const queuePosition = (maxPos._max.queuePosition ?? 0) + 1;

  const entry = await prisma.waitlistEntry.create({
    data: {
      clientId,
      serviceId:     serviceId  || null,
      providerId:    providerId || null,
      priority:      priority   || "NORMAL",
      notes:         notes      || null,
      queuePosition,
      status: "WAITING",
    },
    include: INCLUDE,
  });

  await writeAuditLog(req, {
    action: "WAITLIST_ENTRY_CREATED",
    entityType: "WaitlistEntry",
    entityId: entry.id,
    detailsJson: { clientId, priority: entry.priority },
  });

  return res.status(201).json(entry);
});

// ── PATCH /:id — edit notes, status, priority, service, provider ──────────────
router.patch("/:id", requirePermission("aplus.waitlist.edit"), async (req, res) => {
  const { notes, status, priority, serviceId, providerId } = req.body;

  const data = {};
  if (notes     !== undefined) data.notes      = notes || null;
  if (status    !== undefined) data.status      = status;
  if (priority  !== undefined) data.priority    = priority;
  if (serviceId !== undefined) data.serviceId   = serviceId || null;
  if (providerId !== undefined) data.providerId = providerId || null;

  const entry = await prisma.waitlistEntry.update({
    where: { id: req.params.id },
    data,
    include: INCLUDE,
  });

  return res.json(entry);
});

// ── DELETE /:id — hard delete ─────────────────────────────────────────────────
router.delete("/:id", requirePermission("aplus.waitlist.delete"), async (req, res) => {
  await prisma.waitlistEntry.delete({ where: { id: req.params.id } });
  return res.json({ success: true });
});

// ── POST /reorder — bulk-update queue positions after drag-and-drop ───────────
router.post("/reorder", requirePermission("aplus.waitlist.edit"), async (req, res) => {
  const { positions } = req.body; // [{ id, queuePosition }]
  if (!Array.isArray(positions)) return res.status(400).json({ error: "positions array required" });

  await prisma.$transaction(
    positions.map(({ id, queuePosition }) =>
      prisma.waitlistEntry.update({ where: { id }, data: { queuePosition } })
    )
  );

  return res.json({ success: true });
});

// ── POST /:id/schedule — create appointment and mark entry as scheduled ────────
router.post("/:id/schedule", requirePermission("aplus.appointments.create"), async (req, res) => {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: req.params.id },
    include: INCLUDE,
  });
  if (!entry) return res.status(404).json({ error: "Waitlist entry not found" });

  const { title, startsAt, endsAt, durationMinutes, notes, serviceId, providerId, bcbaId } = req.body;

  if (!startsAt || !endsAt) {
    return res.status(400).json({ error: "startsAt and endsAt are required" });
  }

  const [appt] = await prisma.$transaction([
    prisma.appointment.create({
      data: {
        clientId:       entry.clientId,
        serviceId:      serviceId  || entry.serviceId  || null,
        providerId:     providerId || entry.providerId || null,
        bcbaId:         bcbaId     || null,
        title:          title      || entry.client.fullName,
        startsAt:       new Date(startsAt),
        endsAt:         new Date(endsAt),
        durationMinutes: Number(durationMinutes || 60),
        notes:          notes || null,
        status:         "SCHEDULED",
      },
    }),
    prisma.waitlistEntry.update({
      where: { id: req.params.id },
      data:  { status: "SCHEDULED", scheduledApptId: undefined }, // appt.id set below
    }),
  ]);

  // Update scheduledApptId now that we have the appointment ID
  await prisma.waitlistEntry.update({
    where: { id: req.params.id },
    data:  { scheduledApptId: appt.id },
  });

  await writeAuditLog(req, {
    action: "WAITLIST_SCHEDULED",
    entityType: "WaitlistEntry",
    entityId: req.params.id,
    detailsJson: { appointmentId: appt.id, clientId: entry.clientId },
  });

  return res.json({ appointment: appt });
});

export default router;
