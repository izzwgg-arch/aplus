import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireString } from "../utils/validation.js";
import { writeAuditLog } from "../services/auditLogService.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", requirePermission("aplus.data_tracking.view"), async (req, res) => {
  const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
  const items = await prisma.dataTrackingEntry.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" }
  });
  return res.json(items);
});

router.post("/", requirePermission("aplus.data_tracking.create"), async (req, res) => {
  const body = req.body || {};
  const created = await prisma.dataTrackingEntry.create({
    data: {
      clientId: requireString(body.clientId, "clientId"),
      title: requireString(body.title, "title"),
      value: requireString(body.value, "value"),
      notes: body.notes ? String(body.notes) : null
    }
  });
  await writeAuditLog(req, {
    action: "DATA_TRACKING_CREATED",
    entityType: "DataTrackingEntry",
    entityId: created.id
  });
  return res.status(201).json(created);
});

export default router;
