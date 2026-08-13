/**
 * Ensures the authenticated user exists in the Smart Steps User table and
 * returns the CANONICAL user id every query for this person must run under.
 *
 * Smart Steps uses NextAuth which returns a session.user.id that comes from
 * the main A+ Center app's JWT (SSO). That ID does NOT automatically exist
 * in the smart_steps.User table. Worse, admins create staff profiles via
 * Settings → Staff, which mints a cuid id — so the same person can be known
 * under two different ids (their profile row vs. their SSO `sub`). Client
 * assignments hang off the profile row; if the SSO login runs under the other
 * id, the staff member sees no assigned clients and has zero permissions.
 *
 * Resolution order:
 *   1. A row with the incoming id exists → sync and use it (legacy behavior).
 *   2. Otherwise a row with the same email (case-insensitive) exists → link to
 *      it and use ITS id. The admin-created profile is authoritative for
 *      role/appRole; we only backfill missing fields.
 *   3. Otherwise create a new row under the incoming id.
 *
 * Callers must use the returned id (not the incoming one) for the session and
 * for all downstream queries.
 */

import { prisma } from "@/lib/db";
import { LEGACY_ROLE_KEY_MAP } from "@/lib/permissionKeys";
import { invalidateUserCache } from "@/lib/permissions";

type AuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string;
};

const VALID_ROLES = ["RBT", "BCBA", "ADMIN"] as const;
type Role = (typeof VALID_ROLES)[number];

function safeRole(r: string | undefined): Role {
  return VALID_ROLES.includes(r as Role) ? (r as Role) : "RBT";
}

/**
 * Resolves the default AppRole id for a legacy role, so brand-new (or
 * not-yet-backfilled) users get a working appRoleId immediately at login
 * instead of silently resolving to zero permissions (the resolver is
 * fail-closed on a null appRoleId) until the next manual seed/backfill run.
 */
async function resolveDefaultAppRoleId(role: Role): Promise<string | null> {
  const key = LEGACY_ROLE_KEY_MAP[role];
  if (!key) return null;
  const appRole = await prisma.appRole.findUnique({ where: { key }, select: { id: true, isActive: true } });
  return appRole?.isActive ? appRole.id : null;
}

async function findByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, role: true, appRoleId: true },
  });
}

export async function ensureUser(user: AuthUser): Promise<string> {
  const email = (user.email?.trim() || `sso-${user.id}@smart-steps.local`).toLowerCase();
  const role = safeRole(user.role);

  try {
    const byId = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, appRoleId: true, appRole: { select: { key: true } } },
    });

    if (byId) {
      // For EXISTING rows, only re-sync the app role when the incoming SSO
      // role has actually changed (e.g. promoted to ADMIN in the main A+
      // Center app) AND the currently-stored appRoleId still matches the
      // legacy role it was auto-assigned from (i.e. nobody has since
      // hand-picked a different role via Roles & Permissions — that
      // customization is always preserved).
      const roleChanged = byId.role !== role;
      const currentlyAutoAssigned = !byId.appRoleId || byId.appRole?.key === byId.role;
      const shouldSyncAppRole = roleChanged && currentlyAutoAssigned;
      const appRoleId = shouldSyncAppRole ? await resolveDefaultAppRoleId(role) : undefined;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: user.name ?? undefined,
          email,
          ...(roleChanged ? { role } : {}),
          ...(appRoleId ? { appRoleId } : {}),
        },
      });
      if (appRoleId || roleChanged) invalidateUserCache(user.id);
      return user.id;
    }

    // No row under this id — link to an existing profile with the same email
    // (Settings → Staff profiles, invite accounts). The profile's role and
    // appRole were chosen by an admin and are authoritative: never overwrite
    // them from the SSO token, only backfill what's missing.
    const byEmail = await findByEmail(email);
    if (byEmail) {
      const appRoleId = byEmail.appRoleId ? undefined : await resolveDefaultAppRoleId(safeRole(byEmail.role));
      await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          email, // normalize casing so future lookups are exact
          ...(byEmail.name ? {} : { name: user.name ?? undefined }),
          ...(appRoleId ? { appRoleId } : {}),
        },
      });
      if (appRoleId) invalidateUserCache(byEmail.id);
      return byEmail.id;
    }

    const appRoleId = await resolveDefaultAppRoleId(role);
    await prisma.user.create({
      data: {
        id: user.id,
        email,
        name: user.name ?? "Therapist",
        role,
        appRoleId,
        // isActive defaults to true; displayRole defaults to null
      },
    });
    invalidateUserCache(user.id);
    return user.id;
  } catch {
    // Last resort (e.g. unique-email race with a concurrent request): never
    // break the request over identity sync — resolve to whichever row holds
    // the email, else fall back to the incoming id.
    try {
      const byEmail = await findByEmail(email);
      if (byEmail) return byEmail.id;
    } catch {
      // fall through
    }
    return user.id;
  }
}
