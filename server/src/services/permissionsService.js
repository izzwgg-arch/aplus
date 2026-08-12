/**
 * Centralized permission resolution for A Plus Center Scheduling (Phase 1).
 *
 * Permissions are resolved from the DB (`User.roleId` -> `Role` ->
 * `RolePermission` -> `Permission.key`) on every check, with a short-lived
 * in-memory cache so a typical request doesn't pay a full join query, while
 * still ensuring a role/permission change takes effect within a few seconds
 * without requiring the affected user to log out and back in. Any write that
 * changes a role's grants or a user's role calls `invalidateUserCache` /
 * `invalidateAllCache` to make the change effective immediately.
 */
import { prisma } from "../config/prisma.js";

const CACHE_TTL_MS = 5000;
const cache = new Map(); // userId -> { keys: Set<string>, expiresAt: number, roleKey: string|null }

export function invalidateUserCache(userId) {
  cache.delete(userId);
}

export function invalidateAllCache() {
  cache.clear();
}

async function loadUserPermissions(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      customRole: {
        select: {
          key: true,
          isActive: true,
          permissions: { select: { permission: { select: { key: true } } } }
        }
      }
    }
  });

  if (!user) return { keys: new Set(), roleKey: null };

  if (user.customRole && user.customRole.isActive) {
    const keys = new Set(user.customRole.permissions.map((rp) => rp.permission.key));
    return { keys, roleKey: user.customRole.key };
  }

  // No roleId set yet (pre-backfill) or role deactivated — fail safe to no permissions
  // rather than silently trusting the legacy enum for anything beyond login.
  return { keys: new Set(), roleKey: null };
}

export async function getUserPermissions(userId) {
  if (!userId) return new Set();
  const cached = cache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.keys;

  const { keys, roleKey } = await loadUserPermissions(userId);
  cache.set(userId, { keys, roleKey, expiresAt: now + CACHE_TTL_MS });
  return keys;
}

export async function getUserRoleKey(userId) {
  if (!userId) return null;
  const cached = cache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.roleKey;
  const { keys, roleKey } = await loadUserPermissions(userId);
  cache.set(userId, { keys, roleKey, expiresAt: now + CACHE_TTL_MS });
  return roleKey;
}

export async function can(userId, permissionKey) {
  const keys = await getUserPermissions(userId);
  return keys.has(permissionKey);
}

export async function canAny(userId, permissionKeys) {
  const keys = await getUserPermissions(userId);
  return permissionKeys.some((k) => keys.has(k));
}
