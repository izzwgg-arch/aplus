/**
 * Express middleware enforcing granular permissions (Phase 1).
 * Use in place of / alongside `requireRole` on every route.
 */
import { can, canAny } from "../services/permissionsService.js";
import { writeAuditLog } from "../services/auditLogService.js";

async function logDenied(req, keys) {
  try {
    await writeAuditLog(req, {
      action: "PERMISSION_DENIED",
      entityType: "Permission",
      entityId: Array.isArray(keys) ? keys.join(",") : keys,
      metadata: { path: req.originalUrl, method: req.method, requiredPermissions: keys }
    });
  } catch (err) {
    // Never let audit logging break the request/response cycle.
    console.error("[permissions] failed to write PERMISSION_DENIED audit log:", err.message);
  }
}

/** Requires the caller to hold the given permission key. */
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.user?.sub) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await can(req.user.sub, permissionKey);
    if (!allowed) {
      await logDenied(req, permissionKey);
      return res.status(403).json({ error: "Forbidden", requiredPermission: permissionKey });
    }
    return next();
  };
}

/** Requires the caller to hold at least one of the given permission keys. */
export function requireAnyPermission(...permissionKeys) {
  return async (req, res, next) => {
    if (!req.user?.sub) return res.status(401).json({ error: "Unauthorized" });
    const allowed = await canAny(req.user.sub, permissionKeys);
    if (!allowed) {
      await logDenied(req, permissionKeys);
      return res.status(403).json({ error: "Forbidden", requiredPermission: permissionKeys });
    }
    return next();
  };
}
