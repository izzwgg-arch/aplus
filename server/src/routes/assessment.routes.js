import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { requireString } from "../utils/validation.js";
import { writeAuditLog } from "../services/auditLogService.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", requirePermission("aplus.assessments.view"), async (req, res) => {
  const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
  const assessments = await prisma.assessment.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" }
  });
  return res.json(assessments);
});

router.post("/", requirePermission("aplus.assessments.create"), async (req, res) => {
  const body = req.body || {};
  const created = await prisma.assessment.create({
    data: {
      clientId: requireString(body.clientId, "clientId"),
      title: requireString(body.title, "title"),
      status: body.status || "DRAFT",
      contentJson: body.contentJson || null
    }
  });
  await writeAuditLog(req, {
    action: "ASSESSMENT_CREATED",
    entityType: "Assessment",
    entityId: created.id
  });
  return res.status(201).json(created);
});

router.put("/:id", requirePermission("aplus.assessments.edit"), async (req, res) => {
  const body = req.body || {};
  const updated = await prisma.assessment.update({
    where: { id: req.params.id },
    data: {
      title: body.title || undefined,
      status: body.status || undefined,
      contentJson: body.contentJson || undefined
    }
  });
  await writeAuditLog(req, {
    action: "ASSESSMENT_UPDATED",
    entityType: "Assessment",
    entityId: updated.id
  });
  return res.json(updated);
});

export default router;
