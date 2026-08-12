import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { asNumber, asOptionalString, requireString } from "../utils/validation.js";
import { normalizeColorTag } from "../utils/colorTags.js";
import { writeAuditLog } from "../services/auditLogService.js";
import {
  createService,
  getServiceById,
  listServices,
  setServiceActive,
  updateService
} from "../services/clinic/services/serviceService.js";

const router = express.Router();
router.use(requireAuth);

function parsePayload(body, { partial = false } = {}) {
  const payload = {};
  if (!partial || body.name !== undefined) payload.name = requireString(body.name, "Service name");
  if (!partial || body.colorTag !== undefined) {
    const colorTag = normalizeColorTag(body.colorTag);
    if (!colorTag) {
      const error = new Error("Service color tag is invalid");
      error.status = 400;
      throw error;
    }
    payload.colorTag = colorTag;
  }
  if (!partial || body.standardRate !== undefined) {
    const rate = asNumber(body.standardRate, "Standard rate");
    if (rate < 0) {
      const error = new Error("Standard rate must be greater than or equal to 0");
      error.status = 400;
      throw error;
    }
    payload.standardRate = rate;
  }
  if (body.overtimeRate !== undefined) {
    if (body.overtimeRate === null || body.overtimeRate === "") payload.overtimeRate = null;
    else payload.overtimeRate = asNumber(body.overtimeRate, "Overtime rate");
  }
  if (body.durationMinutes !== undefined) {
    payload.durationMinutes = body.durationMinutes === null || body.durationMinutes === ""
      ? null
      : Math.max(1, Math.floor(asNumber(body.durationMinutes, "Duration")));
  }
  payload.code = body.code !== undefined ? asOptionalString(body.code) : undefined;
  payload.description = body.description !== undefined ? asOptionalString(body.description) : undefined;
  payload.category = body.category !== undefined ? asOptionalString(body.category) : undefined;
  payload.notes = body.notes !== undefined ? asOptionalString(body.notes) : undefined;
  if (body.isActive !== undefined) payload.isActive = body.isActive === true;
  // Calendar card color fields
  for (const field of ["calendarBgColor", "calendarNameColor", "calendarServiceColor", "calendarTimeColor"]) {
    if (body[field] !== undefined) {
      payload[field] = body[field] === "" || body[field] === null ? null : String(body[field]);
    }
  }
  return payload;
}

router.get("/", requirePermission("aplus.services.view"), async (req, res) => {
  const items = await listServices({
    search: asOptionalString(req.query.search),
    status: asOptionalString(req.query.status)
  });
  return res.json(items);
});

router.get("/:id", requirePermission("aplus.services.view"), async (req, res) => {
  const item = await getServiceById(req.params.id);
  if (!item) return res.status(404).json({ error: "Service not found" });
  return res.json(item);
});

router.post("/", requirePermission("aplus.services.create"), async (req, res) => {
  try {
    const created = await createService(parsePayload(req.body));
    await writeAuditLog(req, {
      action: "SERVICE_CREATED",
      entityType: "Service",
      entityId: created.id,
      detailsJson: { name: created.name, standardRate: created.standardRate, overtimeRate: created.overtimeRate }
    });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not create service" });
  }
});

router.put("/:id", requirePermission("aplus.services.edit"), async (req, res) => {
  try {
    const current = await getServiceById(req.params.id);
    if (!current) return res.status(404).json({ error: "Service not found" });
    const updated = await updateService(req.params.id, parsePayload(req.body, { partial: true }));
    await writeAuditLog(req, {
      action: "SERVICE_UPDATED",
      entityType: "Service",
      entityId: updated.id,
      detailsJson: {
        previous: { name: current.name, standardRate: current.standardRate, overtimeRate: current.overtimeRate, isActive: current.isActive },
        next: { name: updated.name, standardRate: updated.standardRate, overtimeRate: updated.overtimeRate, isActive: updated.isActive }
      }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not update service" });
  }
});

router.post("/:id/archive", requirePermission("aplus.services.archive"), async (req, res) => {
  const updated = await setServiceActive(req.params.id, false);
  await writeAuditLog(req, {
    action: "SERVICE_ARCHIVED",
    entityType: "Service",
    entityId: updated.id
  });
  return res.json(updated);
});

router.post("/:id/restore", requirePermission("aplus.services.archive"), async (req, res) => {
  const updated = await setServiceActive(req.params.id, true);
  await writeAuditLog(req, {
    action: "SERVICE_RESTORED",
    entityType: "Service",
    entityId: updated.id
  });
  return res.json(updated);
});

export default router;
