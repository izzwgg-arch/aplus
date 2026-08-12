import express from "express";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { invalidateAllCache } from "../services/permissionsService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { PERMISSION_KEYS } from "../config/permissions.js";

const router = express.Router();
router.use(requireAuth);

const ROLE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  isSystem: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: true } }
};

function serializeRole(role) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isActive: role.isActive,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    userCount: role._count?.users ?? 0,
    permissions: role.permissions.map((rp) => rp.permission.key)
  };
}

// ---------------------------------------------------------------------------
// LIST ROLES (with permission keys + user counts)
// ---------------------------------------------------------------------------
router.get("/", requirePermission("aplus.settings.manage_permissions"), async (_req, res) => {
  const roles = await prisma.role.findMany({
    select: ROLE_SELECT,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }]
  });
  return res.json(roles.map(serializeRole));
});

// ---------------------------------------------------------------------------
// ROLE DETAIL (with assigned users)
// ---------------------------------------------------------------------------
router.get("/:id", requirePermission("aplus.settings.manage_permissions"), async (req, res) => {
  const role = await prisma.role.findUnique({
    where: { id: req.params.id },
    select: {
      ...ROLE_SELECT,
      users: { select: { id: true, fullName: true, email: true, status: true } }
    }
  });
  if (!role) return res.status(404).json({ error: "Role not found." });
  return res.json({ ...serializeRole(role), users: role.users });
});

// ---------------------------------------------------------------------------
// UPDATE ROLE (name/description/isActive/permission checklist)
// Phase 1: editing seeded system roles' permission set is allowed; creating
// brand-new custom roles is deferred to Phase 2.
// ---------------------------------------------------------------------------
router.patch("/:id", requirePermission("aplus.settings.manage_permissions"), async (req, res) => {
  const { name, description, isActive, permissions } = req.body;

  const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Role not found." });

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (isActive !== undefined) data.isActive = Boolean(isActive);

  let invalidKeys = [];
  if (Array.isArray(permissions)) {
    invalidKeys = permissions.filter((k) => !PERMISSION_KEYS.includes(k));
    if (invalidKeys.length > 0) {
      return res.status(400).json({ error: `Unknown permission key(s): ${invalidKeys.join(", ")}` });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({ where: { id: req.params.id }, data });

    if (Array.isArray(permissions)) {
      const permRows = await tx.permission.findMany({ where: { key: { in: permissions } }, select: { id: true } });
      await tx.rolePermission.deleteMany({ where: { roleId: req.params.id } });
      if (permRows.length > 0) {
        await tx.rolePermission.createMany({
          data: permRows.map((p) => ({ roleId: req.params.id, permissionId: p.id }))
        });
      }
    }

    return tx.role.findUnique({ where: { id: req.params.id }, select: ROLE_SELECT });
  });

  invalidateAllCache();

  await writeAuditLog(req, {
    action: "ROLE_UPDATED",
    targetType: "Role",
    targetId: req.params.id,
    metadata: {
      roleKey: existing.key,
      changedFields: Object.keys(data),
      permissionsChanged: Array.isArray(permissions),
      permissionCount: Array.isArray(permissions) ? permissions.length : undefined
    }
  });

  return res.json(serializeRole(result));
});

export default router;
