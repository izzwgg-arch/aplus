/**
 * Seeds the Phase 1 permission system:
 *   1. Upserts every Permission row from the catalog.
 *   2. Upserts every system Role and its RolePermission grants.
 *   3. Backfills every existing User.roleId from their legacy `role` enum,
 *      using LEGACY_ROLE_KEY_MAP so day-1 access is unchanged.
 *
 * Idempotent — safe to run repeatedly (e.g. on every deploy).
 *
 * Usage: node src/scripts/seedPermissions.js
 */
import { prisma } from "../config/prisma.js";
import { PERMISSIONS, SYSTEM_ROLES, LEGACY_ROLE_KEY_MAP } from "../config/permissions.js";

async function seedPermissions() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { category: perm.category, label: perm.label },
      create: perm
    });
  }
  console.log(`[seedPermissions] Upserted ${PERMISSIONS.length} permissions.`);
}

async function seedRoles() {
  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { key: roleDef.key },
      update: { name: roleDef.name, description: roleDef.description, isSystem: true },
      create: {
        key: roleDef.key,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true
      }
    });

    const permissionRows = await prisma.permission.findMany({
      where: { key: { in: roleDef.permissions } },
      select: { id: true, key: true }
    });
    const foundKeys = new Set(permissionRows.map((p) => p.key));
    const missing = roleDef.permissions.filter((k) => !foundKeys.has(k));
    if (missing.length) {
      console.warn(`[seedPermissions] Role ${roleDef.key} references unknown permission keys: ${missing.join(", ")}`);
    }

    // Reset then re-grant so removed keys in the catalog are cleaned up.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionRows.length) {
      await prisma.rolePermission.createMany({
        data: permissionRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true
      });
    }
    console.log(`[seedPermissions] Role ${roleDef.key}: ${permissionRows.length} permissions granted.`);
  }
}

async function backfillUserRoles() {
  const roles = await prisma.role.findMany({ where: { key: { in: Object.values(LEGACY_ROLE_KEY_MAP) } } });
  const roleByKey = new Map(roles.map((r) => [r.key, r]));

  const usersToBackfill = await prisma.user.findMany({
    where: { roleId: null },
    select: { id: true, role: true, email: true }
  });

  let updated = 0;
  for (const user of usersToBackfill) {
    const targetKey = LEGACY_ROLE_KEY_MAP[user.role];
    const targetRole = targetKey ? roleByKey.get(targetKey) : null;
    if (!targetRole) {
      console.warn(`[seedPermissions] No system role mapping for user ${user.email} (legacy role ${user.role}); skipped.`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { roleId: targetRole.id } });
    updated += 1;
  }
  console.log(`[seedPermissions] Backfilled roleId for ${updated}/${usersToBackfill.length} users.`);
}

async function main() {
  await seedPermissions();
  await seedRoles();
  await backfillUserRoles();
}

main()
  .catch((err) => {
    console.error("[seedPermissions] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
