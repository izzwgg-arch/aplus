import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { asNumber, asOptionalString, requireString } from "../utils/validation.js";
import { normalizeColorTag } from "../utils/colorTags.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { prisma } from "../config/prisma.js";
import {
  createProvider,
  getProviderById,
  listProviders,
  replaceProviderServices,
  setProviderActive,
  updateProvider
} from "../services/clinic/providers/providerService.js";

const router = express.Router();
router.use(requireAuth);

function parseProviderPayload(body, { partial = false } = {}) {
  const firstName = !partial || body.firstName !== undefined ? requireString(body.firstName, "First name") : undefined;
  const lastName = !partial || body.lastName !== undefined ? requireString(body.lastName, "Last name") : undefined;
  const payload = {
    firstName,
    lastName,
    fullName: firstName && lastName ? `${firstName} ${lastName}` : undefined,
    email: body.email !== undefined ? asOptionalString(body.email) : undefined,
    phone: body.phone !== undefined ? asOptionalString(body.phone) : undefined,
    title: body.title !== undefined ? asOptionalString(body.title) : undefined,
    credential: body.credential !== undefined ? asOptionalString(body.credential) : undefined,
    licenseNumber: body.licenseNumber !== undefined ? asOptionalString(body.licenseNumber) : undefined,
    npi: body.npi !== undefined ? asOptionalString(body.npi) : undefined,
    colorTag: body.colorTag !== undefined ? normalizeColorTag(body.colorTag) : undefined,
    defaultHourlyRate: body.defaultHourlyRate !== undefined && body.defaultHourlyRate !== ""
      ? asNumber(body.defaultHourlyRate, "Default hourly rate")
      : body.defaultHourlyRate === "" ? null : undefined,
    overtimeHourlyRate: body.overtimeHourlyRate !== undefined && body.overtimeHourlyRate !== ""
      ? asNumber(body.overtimeHourlyRate, "Overtime hourly rate")
      : body.overtimeHourlyRate === "" ? null : undefined,
    address: body.address !== undefined ? asOptionalString(body.address) : undefined,
    notes: body.notes !== undefined ? asOptionalString(body.notes) : undefined
  };
  if (body.colorTag !== undefined && !payload.colorTag) {
    const error = new Error("Provider color tag is invalid");
    error.status = 400;
    throw error;
  }
  if (body.isActive !== undefined) payload.isActive = body.isActive === true;
  return payload;
}

router.get("/", requirePermission("aplus.providers.view"), async (req, res) => {
  const items = await listProviders({
    search: asOptionalString(req.query.search),
    status: asOptionalString(req.query.status)
  });
  return res.json(items);
});

router.get("/:id", requirePermission("aplus.providers.view"), async (req, res) => {
  const provider = await getProviderById(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  return res.json(provider);
});

router.post("/", requirePermission("aplus.providers.create"), async (req, res) => {
  try {
    const created = await createProvider(parseProviderPayload(req.body));
    if (Array.isArray(req.body.serviceLinks)) {
      await replaceProviderServices(created.id, req.body.serviceLinks);
    }
    if (req.body.communicationPreference && typeof req.body.communicationPreference === "object") {
      const cp = req.body.communicationPreference;
      const prefChannel = String(cp.preferredChannel || "EMAIL").toUpperCase();
      const safeChannel = ["EMAIL", "SMS", "BOTH"].includes(prefChannel) ? prefChannel : "EMAIL";
      await prisma.providerCommunicationPreference.upsert({
        where: { providerId: created.id },
        create: {
          providerId: created.id,
          emailRemindersEnabled: cp.emailRemindersEnabled !== false,
          smsRemindersEnabled: cp.smsRemindersEnabled === true,
          preferredChannel: safeChannel
        },
        update: {
          emailRemindersEnabled: cp.emailRemindersEnabled !== false,
          smsRemindersEnabled: cp.smsRemindersEnabled === true,
          preferredChannel: safeChannel
        }
      });
    }
    const hydrated = await getProviderById(created.id);
    await writeAuditLog(req, {
      action: "PROVIDER_CREATED",
      entityType: "Provider",
      entityId: created.id,
      detailsJson: { fullName: created.fullName }
    });
    return res.status(201).json(hydrated);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not create provider" });
  }
});

router.put("/:id", requirePermission("aplus.providers.edit"), async (req, res) => {
  try {
    const before = await getProviderById(req.params.id);
    if (!before) return res.status(404).json({ error: "Provider not found" });
    await updateProvider(req.params.id, parseProviderPayload(req.body, { partial: true }));
    if (Array.isArray(req.body.serviceLinks)) {
      await replaceProviderServices(req.params.id, req.body.serviceLinks);
    }
    if (req.body.communicationPreference && typeof req.body.communicationPreference === "object") {
      const cp = req.body.communicationPreference;
      const prefChannel = String(cp.preferredChannel || "EMAIL").toUpperCase();
      const safeChannel = ["EMAIL", "SMS", "BOTH"].includes(prefChannel) ? prefChannel : "EMAIL";
      await prisma.providerCommunicationPreference.upsert({
        where: { providerId: req.params.id },
        create: {
          providerId: req.params.id,
          emailRemindersEnabled: cp.emailRemindersEnabled !== false,
          smsRemindersEnabled: cp.smsRemindersEnabled === true,
          preferredChannel: safeChannel
        },
        update: {
          ...(typeof cp.emailRemindersEnabled === "boolean" ? { emailRemindersEnabled: cp.emailRemindersEnabled } : {}),
          ...(typeof cp.smsRemindersEnabled === "boolean" ? { smsRemindersEnabled: cp.smsRemindersEnabled } : {}),
          ...(cp.preferredChannel ? { preferredChannel: safeChannel } : {})
        }
      });
    }
    const updated = await getProviderById(req.params.id);
    await writeAuditLog(req, {
      action: "PROVIDER_UPDATED",
      entityType: "Provider",
      entityId: req.params.id,
      detailsJson: {
        previous: { fullName: before.fullName, isActive: before.isActive },
        next: { fullName: updated.fullName, isActive: updated.isActive }
      }
    });
    return res.json(updated);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not update provider" });
  }
});

router.delete("/:id", requirePermission("aplus.providers.deactivate"), async (req, res) => {
  try {
    const provider = await getProviderById(req.params.id);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const apptCount = await prisma.appointment.count({ where: { providerId: req.params.id } });
    if (apptCount > 0) {
      return res.status(409).json({
        error: `Cannot delete: this provider has ${apptCount} appointment${apptCount === 1 ? "" : "s"} on record. Archive them instead.`
      });
    }

    await prisma.providerServiceLink.deleteMany({ where: { providerId: req.params.id } });
    await prisma.provider.delete({ where: { id: req.params.id } });

    await writeAuditLog(req, {
      action: "PROVIDER_DELETED",
      entityType: "Provider",
      entityId: req.params.id,
      detailsJson: { fullName: provider.fullName }
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Could not delete provider" });
  }
});

router.post("/:id/archive", requirePermission("aplus.providers.deactivate"), async (req, res) => {
  const updated = await setProviderActive(req.params.id, false);
  await writeAuditLog(req, {
    action: "PROVIDER_ARCHIVED",
    entityType: "Provider",
    entityId: updated.id
  });
  return res.json(updated);
});

router.post("/:id/restore", requirePermission("aplus.providers.edit"), async (req, res) => {
  const updated = await setProviderActive(req.params.id, true);
  await writeAuditLog(req, {
    action: "PROVIDER_RESTORED",
    entityType: "Provider",
    entityId: updated.id
  });
  return res.json(updated);
});

export default router;
