import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { PERMISSIONS } from "../config/permissions.js";

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// LIST PERMISSION CATALOG (grouped by category) — used to render the role
// permission checklist on the Permissions settings page.
// ---------------------------------------------------------------------------
router.get("/", requirePermission("aplus.settings.manage_permissions"), async (_req, res) => {
  const grouped = {};
  for (const p of PERMISSIONS) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push({ key: p.key, label: p.label });
  }
  return res.json({ categories: grouped, all: PERMISSIONS });
});

export default router;
