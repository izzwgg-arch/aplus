/**
 * Ensures the authenticated user exists in the Smart Steps User table.
 *
 * Smart Steps uses NextAuth which returns a session.user.id that comes from
 * the main A+ Center app's JWT (SSO). That ID does NOT automatically exist
 * in the smart_steps.User table, causing FK constraint failures on any write
 * (Session, Target, ParentGoal, etc.) that references userId.
 *
 * Call this at the top of any API route that creates/updates records with a userId.
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

export async function ensureUser(user: AuthUser): Promise<void> {
  const email = user.email?.trim() || `sso-${user.id}@smart-steps.local`;
  const role = safeRole(user.role);

  try {
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, appRoleId: true, appRole: { select: { key: true } } },
    });

    // Auto-assign a default app role for brand-new users. For EXISTING users,
    // only re-sync the app role when the incoming SSO role has actually
    // changed (e.g. promoted to ADMIN in the main A+ Center app) AND the
    // currently-stored appRoleId still matches the legacy role it was
    // auto-assigned from (i.e. nobody has since hand-picked a different role
    // via Roles & Permissions — that customization is always preserved).
    //
    // Without this, a user's SmartSteps role/appRoleId is frozen forever at
    // whatever it was on their very first login, even after being promoted
    // or demoted in the main app — silently locking them out of features
    // their new role should grant (or over-granting after a demotion).
    const roleChanged = existing ? existing.role !== role : false;
    const currentlyAutoAssigned = !existing?.appRoleId || existing.appRole?.key === existing.role;
    const shouldSyncAppRole = !existing || (roleChanged && currentlyAutoAssigned);
    const appRoleId = shouldSyncAppRole ? await resolveDefaultAppRoleId(role) : undefined;

    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        // Sync name/email/role from SSO token so promotions/demotions in the
        // main app propagate here. displayRole and appRoleId customizations
        // made via Roles & Permissions are preserved (see shouldSyncAppRole).
        name: user.name ?? undefined,
        email,
        ...(roleChanged ? { role } : {}),
        ...(appRoleId ? { appRoleId } : {}),
      },
      create: {
        id: user.id,
        email,
        name: user.name ?? "Therapist",
        role,
        appRoleId,
        // isActive defaults to true; displayRole defaults to null
      },
    });

    if (appRoleId || roleChanged) invalidateUserCache(user.id);
  } catch {
    // If upsert fails (e.g. email unique conflict from different account),
    // try updating by email instead, or just continue — sessions degrade gracefully.
    try {
      const appRoleId = await resolveDefaultAppRoleId(role);
      await prisma.user.upsert({
        where: { email },
        update: { name: user.name ?? undefined },
        create: {
          id: user.id,
          email: `sso-${user.id}@smart-steps.local`,
          name: user.name ?? "Therapist",
          role,
          appRoleId,
        },
      });
    } catch {
      // Silent — better to attempt the main operation and let it surface a clear error
    }
  }
}
