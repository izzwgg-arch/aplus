import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse, invalidateAllCache } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/permissionKeys";
import { auditLog } from "@/lib/auditLogger";
import { prisma } from "@/lib/db";

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
  _count: { select: { users: true } },
} as const;

function serializeRole(role: {
  id: string; key: string; name: string; description: string | null;
  isSystem: boolean; isActive: boolean; createdAt: Date; updatedAt: Date;
  permissions: { permission: { key: string } }[];
  _count: { users: number };
}) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isActive: role.isActive,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    userCount: role._count.users,
    permissions: role.permissions.map((rp) => rp.permission.key),
  };
}

type Params = { params: Promise<{ roleId: string }> };

/**
 * GET /smart-steps/api/roles/[roleId]
 * Role detail including assigned users.
 */
export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.permissions.manage");
  if (denied) return denied;

  const { roleId } = await params;
  const role = await prisma.appRole.findUnique({
    where: { id: roleId },
    select: {
      ...ROLE_SELECT,
      users: { select: { id: true, name: true, email: true, isActive: true } },
    },
  });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  return NextResponse.json({ ...serializeRole(role), users: role.users });
}

/**
 * PATCH /smart-steps/api/roles/[roleId]
 * Updates a role's name/description/isActive/permission checklist. Phase 1:
 * editing seeded system roles' permission set is allowed; creating brand-new
 * custom roles is deferred to Phase 2.
 */
export async function PATCH(req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.permissions.manage");
  if (denied) return denied;

  const { roleId } = await params;
  const existing = await prisma.appRole.findUnique({ where: { id: roleId } });
  if (!existing) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const body = await req.json();
  const { name, description, isActive, permissions } = body as {
    name?: string; description?: string | null; isActive?: boolean; permissions?: string[];
  };

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (isActive !== undefined) data.isActive = Boolean(isActive);

  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) {
      return NextResponse.json({ error: "permissions must be an array" }, { status: 400 });
    }
    const invalidKeys = permissions.filter((k) => !PERMISSION_KEYS.includes(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json({ error: `Unknown permission key(s): ${invalidKeys.join(", ")}` }, { status: 400 });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.appRole.update({ where: { id: roleId }, data });

    if (permissions !== undefined) {
      const permRows = await tx.appPermission.findMany({ where: { key: { in: permissions } }, select: { id: true } });
      await tx.appRolePermission.deleteMany({ where: { roleId } });
      if (permRows.length > 0) {
        await tx.appRolePermission.createMany({
          data: permRows.map((p) => ({ roleId, permissionId: p.id })),
        });
      }
    }

    return tx.appRole.findUnique({ where: { id: roleId }, select: ROLE_SELECT });
  });

  invalidateAllCache();

  await auditLog(user.id, "ROLE_UPDATED", "AppRole", roleId, {
    roleKey: existing.key,
    changedFields: Object.keys(data),
    permissionsChanged: permissions !== undefined,
    permissionCount: permissions?.length,
  });

  return NextResponse.json(serializeRole(result!));
}
