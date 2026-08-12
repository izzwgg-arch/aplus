import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
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

/**
 * GET /smart-steps/api/roles
 * Lists all AppRoles with their permission keys and user counts.
 * Requires smartsteps.permissions.manage.
 */
export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.permissions.manage");
  if (denied) return denied;

  const roles = await prisma.appRole.findMany({
    select: ROLE_SELECT,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(roles.map(serializeRole));
}
