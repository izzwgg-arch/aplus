import express from "express";
import path from "path";
import fs from "fs";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { prisma } from "../config/prisma.js";
import { getOrCreateClinicSettings } from "../services/settingsService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { upload } from "../middleware/upload.js";
import { env } from "../config/env.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", requirePermission("aplus.settings.view"), async (_req, res) => {
  const settings = await getOrCreateClinicSettings();
  return res.json(settings);
});

router.put("/", requirePermission("aplus.settings.edit"), async (req, res) => {
  const current = await getOrCreateClinicSettings();
  const updated = await prisma.clinicSetting.update({
    where: { id: current.id },
    data: {
      defaultHourlyRate: req.body.defaultHourlyRate !== undefined ? Number(req.body.defaultHourlyRate) : undefined,
      defaultCancellationFeeEnabled: typeof req.body.defaultCancellationFeeEnabled === "boolean"
        ? req.body.defaultCancellationFeeEnabled
        : undefined,
      companyName: req.body.companyName !== undefined ? (req.body.companyName || null) : undefined,
      companyAddress: req.body.companyAddress !== undefined ? (req.body.companyAddress || null) : undefined,
      companyEmail: req.body.companyEmail !== undefined ? (req.body.companyEmail || null) : undefined,
      companyPhone: req.body.companyPhone !== undefined ? (req.body.companyPhone || null) : undefined,
      invoiceFooterText: req.body.invoiceFooterText !== undefined ? (req.body.invoiceFooterText || null) : undefined,
      invoiceAccentColor: req.body.invoiceAccentColor !== undefined ? (req.body.invoiceAccentColor || "#2563EB") : undefined
    }
  });
  await writeAuditLog(req, {
    action: "SETTINGS_UPDATED",
    targetType: "ClinicSetting",
    targetId: String(updated.id),
    metadata: {
      defaultHourlyRate: updated.defaultHourlyRate,
      defaultCancellationFeeEnabled: updated.defaultCancellationFeeEnabled,
      companyName: updated.companyName
    }
  });
  return res.json(updated);
});

// Logo upload endpoint
router.post("/logo", requirePermission("aplus.settings.edit"), upload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const current = await getOrCreateClinicSettings();

  // Remove old logo file if it exists
  if (current.invoiceLogoUrl) {
    const oldPath = path.resolve(env.uploadDir, path.basename(current.invoiceLogoUrl));
    fs.unlink(oldPath, () => {});
  }

  // Store the URL path relative to /uploads/
  const logoUrl = `/uploads/${req.file.filename}`;

  const updated = await prisma.clinicSetting.update({
    where: { id: current.id },
    data: { invoiceLogoUrl: logoUrl }
  });

  await writeAuditLog(req, {
    action: "SETTINGS_LOGO_UPLOADED",
    targetType: "ClinicSetting",
    targetId: String(updated.id),
    metadata: { logoUrl }
  });

  return res.json(updated);
});

export default router;
