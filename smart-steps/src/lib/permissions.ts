/**
 * Centralized permission resolution for SmartSteps ABA Tracker (Phase 1).
 *
 * Mirrors `aplus-center-scheduling/server/src/services/permissionsService.js`:
 * permissions resolve from `User.appRoleId` -> `AppRole` -> `AppRolePermission`
 * -> `AppPermission.key`, cached in-memory for a few seconds per user so a
 * role/permission edit takes effect promptly without requiring re-login.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scopedKeyPair } from "@/lib/permissionKeys";
import { auditLog } from "@/lib/auditLogger";

const CACHE_TTL_MS = 5000;
type CacheEntry = { keys: Set<string>; roleKey: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function invalidateUserCache(userId: string) {
  cache.delete(userId);
}

export function invalidateAllCache() {
  cache.clear();
}

async function loadUserPermissions(userId: string): Promise<{ keys: Set<string>; roleKey: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      appRole: {
        select: {
          key: true,
          isActive: true,
          permissions: { select: { permission: { select: { key: true } } } }
        }
      }
    }
  });

  if (!user?.appRole || !user.appRole.isActive) return { keys: new Set(), roleKey: null };

  const keys = new Set(user.appRole.permissions.map((rp) => rp.permission.key));
  return { keys, roleKey: user.appRole.key };
}

export async function getUserPermissions(userId: string | undefined | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const cached = cache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.keys;

  const { keys, roleKey } = await loadUserPermissions(userId);
  cache.set(userId, { keys, roleKey, expiresAt: now + CACHE_TTL_MS });
  return keys;
}

export async function getUserRoleKey(userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const cached = cache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.roleKey;
  const { keys, roleKey } = await loadUserPermissions(userId);
  cache.set(userId, { keys, roleKey, expiresAt: now + CACHE_TTL_MS });
  return roleKey;
}

export async function can(userId: string | undefined | null, permissionKey: string): Promise<boolean> {
  const keys = await getUserPermissions(userId);
  return keys.has(permissionKey);
}

export async function canAny(userId: string | undefined | null, permissionKeys: string[]): Promise<boolean> {
  const keys = await getUserPermissions(userId);
  return permissionKeys.some((k) => keys.has(k));
}

/**
 * Resolves whether `userId` may act on `clientId` for a scoped permission
 * base key (e.g. "smartsteps.clients.view"). Holding the `.all` variant
 * grants access to any client; holding only the `.assigned` variant requires
 * a `ClientAssignment` row linking the user to that client.
 */
export async function canForClient(userId: string | undefined | null, clientId: string, baseKey: string): Promise<boolean> {
  if (!userId) return false;
  const { assigned, all } = scopedKeyPair(baseKey);
  const keys = await getUserPermissions(userId);
  if (keys.has(all)) return true;
  if (!keys.has(assigned)) return false;

  const assignment = await prisma.clientAssignment.findUnique({
    where: { clientId_userId: { clientId, userId } },
    select: { id: true }
  });
  return !!assignment;
}

/**
 * Whether the user holds the unrestricted `.all` variant of a scoped base key
 * (e.g. "smartsteps.goals.view"). Used to distinguish full-visibility roles
 * (BCBA/Admin) from assigned-only roles (BT/RBT, Parent Viewer) so the latter
 * can be limited to In-Treatment goals server-side. A user WITHOUT `.all` is
 * treated as a restricted "assigned-only" viewer.
 */
export async function hasAllScope(userId: string | undefined | null, baseKey: string): Promise<boolean> {
  if (!userId) return false;
  const { all } = scopedKeyPair(baseKey);
  const keys = await getUserPermissions(userId);
  return keys.has(all);
}

async function logDenied(userId: string, requiredPermission: string | string[], extra?: Record<string, unknown>) {
  try {
    await auditLog(userId, "PERMISSION_DENIED", "Permission", Array.isArray(requiredPermission) ? requiredPermission.join(",") : requiredPermission, {
      requiredPermission,
      ...extra
    });
  } catch {
    // never break the request over a logging failure
  }
}

/**
 * Route-guard helper: returns a 403 NextResponse if the user lacks the
 * permission, or `null` if they may proceed. Usage:
 *   const denied = await requirePermissionResponse(user.id, "smartsteps.staff.view");
 *   if (denied) return denied;
 */
export async function requirePermissionResponse(userId: string, permissionKey: string): Promise<NextResponse | null> {
  const allowed = await can(userId, permissionKey);
  if (!allowed) {
    await logDenied(userId, permissionKey);
    return NextResponse.json({ error: "Forbidden", requiredPermission: permissionKey }, { status: 403 });
  }
  return null;
}

export async function requireAnyPermissionResponse(userId: string, permissionKeys: string[]): Promise<NextResponse | null> {
  const allowed = await canAny(userId, permissionKeys);
  if (!allowed) {
    await logDenied(userId, permissionKeys);
    return NextResponse.json({ error: "Forbidden", requiredPermission: permissionKeys }, { status: 403 });
  }
  return null;
}

/**
 * Route-guard helper for client-scoped resources: returns a 403 if the user
 * cannot access `clientId` under the given scoped base key.
 */
export async function requireClientAccessResponse(userId: string, clientId: string, baseKey: string): Promise<NextResponse | null> {
  const allowed = await canForClient(userId, clientId, baseKey);
  if (!allowed) {
    await logDenied(userId, baseKey, { clientId });
    return NextResponse.json({ error: "Forbidden", requiredPermission: baseKey, clientId }, { status: 403 });
  }
  return null;
}

/** Returns the set of clientIds the user is allowed to see for a scoped base key, or `"ALL"` if unrestricted. */
export async function accessibleClientIds(userId: string | undefined | null, baseKey: string): Promise<"ALL" | string[]> {
  if (!userId) return [];
  const { assigned, all } = scopedKeyPair(baseKey);
  const keys = await getUserPermissions(userId);
  if (keys.has(all)) return "ALL";
  if (!keys.has(assigned)) return [];

  const assignments = await prisma.clientAssignment.findMany({
    where: { userId },
    select: { clientId: true }
  });
  return assignments.map((a) => a.clientId);
}
