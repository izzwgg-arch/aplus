import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { writeAuditLog } from "../services/auditLogService.js";
import {
  parseRegularTimesheet,
  parseBcbaTimesheet,
  reconcileRegularTimesheet,
  reconcileBcbaTimesheet,
  applyFixes
} from "../services/timesheetReconciliation.js";

const router = express.Router();

/**
 * POST /api/timesheet-reconciliation/reconcile-regular
 * Reconcile regular (provider) timesheet entries against sessions
 */
router.post("/reconcile-regular", requireAuth, requirePermission("aplus.billing.view_invoices"), async (req, res) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries must be an array" });
    }

    // Parse the entries
    const parsed = parseRegularTimesheet(entries);

    // Reconcile against sessions
    const results = await reconcileRegularTimesheet(parsed);

    // Log audit
    await writeAuditLog({
      action: "TIMESHEET_RECONCILIATION",
      details: {
        type: "regular",
        entriesCount: entries.length,
        flagsCount: results.reduce((sum, r) => sum + r.flags.length, 0)
      },
      userId: req.user.id
    });

    res.json({
      timesheetType: "regular",
      entriesCount: entries.length,
      results: results,
      summary: {
        total: results.length,
        withFlags: results.filter(r => r.flags.length > 0).length,
        flagsByType: results.reduce((acc, r) => {
          r.flags.forEach(f => {
            acc[f.type] = (acc[f.type] || 0) + 1;
          });
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error("Timesheet reconciliation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/timesheet-reconciliation/reconcile-bcba
 * Reconcile BCBA timesheet entries against sessions and notes
 */
router.post("/reconcile-bcba", requireAuth, requirePermission("aplus.billing.view_invoices"), async (req, res) => {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries must be an array" });
    }

    // Parse the entries
    const parsed = parseBcbaTimesheet(entries);

    // Reconcile against sessions
    const results = await reconcileBcbaTimesheet(parsed);

    // Log audit
    await writeAuditLog({
      action: "TIMESHEET_RECONCILIATION",
      details: {
        type: "bcba",
        entriesCount: entries.length,
        flagsCount: results.reduce((sum, r) => sum + r.flags.length, 0)
      },
      userId: req.user.id
    });

    res.json({
      timesheetType: "bcba",
      entriesCount: entries.length,
      results: results,
      summary: {
        total: results.length,
        withFlags: results.filter(r => r.flags.length > 0).length,
        flagsByType: results.reduce((acc, r) => {
          r.flags.forEach(f => {
            acc[f.type] = (acc[f.type] || 0) + 1;
          });
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error("BCBA timesheet reconciliation error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/timesheet-reconciliation/apply-fixes
 * Apply approved fixes to sessions
 */
router.post("/apply-fixes", requireAuth, requirePermission("aplus.billing.edit_invoices"), async (req, res) => {
  try {
    const { fixes } = req.body;

    if (!Array.isArray(fixes)) {
      return res.status(400).json({ error: "fixes must be an array" });
    }

    // Apply the fixes
    const results = await applyFixes(fixes);

    // Log audit
    await writeAuditLog({
      action: "TIMESHEET_RECONCILIATION_APPLIED",
      details: {
        fixesCount: fixes.length,
        successCount: results.filter(r => r.status === "FIXED").length,
        failureCount: results.filter(r => r.status === "ERROR").length
      },
      userId: req.user.id
    });

    res.json({
      appliedCount: results.filter(r => r.status === "FIXED").length,
      failedCount: results.filter(r => r.status === "ERROR").length,
      results: results
    });
  } catch (error) {
    console.error("Apply fixes error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
