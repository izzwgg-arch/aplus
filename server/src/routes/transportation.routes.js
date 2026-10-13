import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireString, asNumber, asOptionalString } from "../utils/validation.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { syncTransportationToQuickbooks } from "../services/integrations/quickbooks/quickbooksService.js";

const router = express.Router();

/**
 * GET /api/transportation
 * Get transportation logs with optional filters
 * Query params: clientId, from, to, paymentStatus, limit, offset
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { clientId, from, to, paymentStatus, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (clientId) where.clientId = requireString(clientId);
    if (paymentStatus) where.paymentStatus = requireString(paymentStatus);
    if (from || to) {
      where.serviceDate = {};
      if (from) where.serviceDate.gte = new Date(requireString(from));
      if (to) where.serviceDate.lte = new Date(requireString(to));
    }

    const [logs, total] = await Promise.all([
      prisma.transportation.findMany({
        where,
        include: { client: { select: { id: true, fullName: true, firstName: true, lastName: true } } },
        orderBy: { serviceDate: "desc" },
        take: Math.min(asNumber(limit), 500),
        skip: asNumber(offset)
      }),
      prisma.transportation.count({ where })
    ]);

    res.json({ logs, total, limit: asNumber(limit), offset: asNumber(offset) });
  } catch (error) {
    console.error("[GET /api/transportation]", error?.message);
    res.status(500).json({ error: error?.message || "Failed to fetch transportation logs" });
  }
});

/**
 * GET /api/transportation/weekly-summary
 * Get weekly summary (for current week ending Sunday)
 * Returns: summary by client and payment status
 */
router.get("/weekly-summary", requireAuth, async (req, res) => {
  try {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const daysToEndOfWeek = dayOfWeek === 0 ? 0 : 7 - dayOfWeek; // Days until next Sunday

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + daysToEndOfWeek);
    weekEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const logs = await prisma.transportation.findMany({
      where: {
        serviceDate: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      include: { client: { select: { id: true, fullName: true, firstName: true, lastName: true } } },
      orderBy: { serviceDate: "asc" }
    });

    // Group by client and payment status
    const summary = {};
    let totalAmount = 0;

    logs.forEach(log => {
      if (!summary[log.clientId]) {
        summary[log.clientId] = {
          clientId: log.clientId,
          clientName: log.client.fullName,
          entries: [],
          byPaymentStatus: { PENDING: { count: 0, amount: 0 }, SUCCEEDED: { count: 0, amount: 0 }, OTHER: { count: 0, amount: 0 } }
        };
      }

      summary[log.clientId].entries.push(log);
      totalAmount += log.amount || 0;

      const status = log.paymentStatus === "SUCCEEDED" ? "SUCCEEDED" : log.paymentStatus === "PENDING" ? "PENDING" : "OTHER";
      summary[log.clientId].byPaymentStatus[status].count += 1;
      summary[log.clientId].byPaymentStatus[status].amount += log.amount || 0;
    });

    res.json({
      weekStart: weekStart.toISOString().split("T")[0],
      weekEnd: weekEnd.toISOString().split("T")[0],
      summary: Object.values(summary),
      totalEntries: logs.length,
      totalAmount,
      logs
    });
  } catch (error) {
    console.error("[GET /api/transportation/weekly-summary]", error?.message);
    res.status(500).json({ error: error?.message || "Failed to fetch weekly summary" });
  }
});

/**
 * POST /api/transportation
 * Create a new transportation log entry
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { clientId, serviceDate, description, amount, paymentStatus, paidBy, notes } = req.body;

    const clientIdStr = requireString(clientId);
    const serviceDateObj = new Date(requireString(serviceDate));

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientIdStr }
    });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const log = await prisma.transportation.create({
      data: {
        clientId: clientIdStr,
        serviceDate: serviceDateObj,
        description: asOptionalString(description),
        amount: asNumber(amount) || 0,
        paymentStatus: paymentStatus || "PENDING",
        paidBy: asOptionalString(paidBy),
        notes: asOptionalString(notes)
      },
      include: { client: { select: { id: true, fullName: true } } }
    });

    // Audit log
    await writeAuditLog({
      userId: req.user.id,
      action: "CREATE",
      resourceType: "TRANSPORTATION",
      resourceId: log.id,
      changes: JSON.stringify(log)
    });

    res.status(201).json(log);
  } catch (error) {
    console.error("[POST /api/transportation]", error?.message);
    res.status(500).json({ error: error?.message || "Failed to create transportation log" });
  }
});

/**
 * PATCH /api/transportation/:id
 * Update transportation log entry
 */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, amount, paymentStatus, paymentDate, paidBy, notes } = req.body;

    const existing = await prisma.transportation.findUnique({
      where: { id }
    });
    if (!existing) return res.status(404).json({ error: "Transportation log not found" });

    const updateData = {};
    if (description !== undefined) updateData.description = asOptionalString(description);
    if (amount !== undefined) updateData.amount = asNumber(amount);
    if (paymentStatus !== undefined) updateData.paymentStatus = requireString(paymentStatus);
    if (paymentDate !== undefined) updateData.paymentDate = paymentDate ? new Date(paymentDate) : null;
    if (paidBy !== undefined) updateData.paidBy = asOptionalString(paidBy);
    if (notes !== undefined) updateData.notes = asOptionalString(notes);

    const updated = await prisma.transportation.update({
      where: { id },
      data: updateData,
      include: { client: { select: { id: true, fullName: true } } }
    });

    // Audit log
    await writeAuditLog({
      userId: req.user.id,
      action: "UPDATE",
      resourceType: "TRANSPORTATION",
      resourceId: id,
      changes: JSON.stringify({ before: existing, after: updated })
    });

    res.json(updated);
  } catch (error) {
    console.error("[PATCH /api/transportation/:id]", error?.message);
    res.status(500).json({ error: error?.message || "Failed to update transportation log" });
  }
});

/**
 * DELETE /api/transportation/:id
 * Delete transportation log entry
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.transportation.findUnique({
      where: { id }
    });
    if (!existing) return res.status(404).json({ error: "Transportation log not found" });

    await prisma.transportation.delete({
      where: { id }
    });

    // Audit log
    await writeAuditLog({
      userId: req.user.id,
      action: "DELETE",
      resourceType: "TRANSPORTATION",
      resourceId: id,
      changes: JSON.stringify(existing)
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/transportation/:id]", error?.message);
    res.status(500).json({ error: error?.message || "Failed to delete transportation log" });
  }
});

/**
 * POST /api/transportation/:id/sync-quickbooks
 * Manually trigger QuickBooks sync for a transportation entry
 */
router.post("/:id/sync-quickbooks", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const log = await prisma.transportation.findUnique({
      where: { id },
      include: { client: true }
    });
    if (!log) return res.status(404).json({ error: "Transportation log not found" });

    const result = await syncTransportationToQuickbooks(log);

    res.json(result);
  } catch (error) {
    console.error("[POST /api/transportation/:id/sync-quickbooks]", error?.message);
    res.status(500).json({ error: error?.message || "Failed to sync to QuickBooks" });
  }
});

export default router;
