import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { getQuickbooksAuditOverview } from "../services/integrations/quickbooks/quickbooksAuditService.js";

const router = express.Router();

router.use(requireAuth);

/**
 * Read-only QuickBooks API audit / rate-control telemetry.
 * Canonical URL: GET /api/admin/qb-audit?sinceHours=24
 */
router.get("/qb-audit", requirePermission("aplus.quickbooks.view_sync"), async (req, res) => {
  const sinceHours = Math.min(168, Math.max(1, Number(req.query.sinceHours || 24)));
  const data = await getQuickbooksAuditOverview({ sinceHours });
  return res.json(data);
});

export default router;
