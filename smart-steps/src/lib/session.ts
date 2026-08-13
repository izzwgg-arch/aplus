/**
 * Centralizes "get the authenticated user and make sure their DB row exists"
 * for every API route. Previously `ensureUser()` was only called from a
 * handful of routes, meaning most routes could run a query referencing
 * `userId` (or, going forward, a permission check keyed on `User.appRoleId`)
 * against a user row that didn't exist yet. Every route should call
 * `requireSession()` instead of calling `auth()` directly.
 */
import { auth } from "@/auth";
import { ensureUser } from "@/lib/ensureUser";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string;
};

export async function requireSession(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) return null;
  // ensureUser returns the CANONICAL user id: sessions minted from an A+
  // Center SSO token carry the main app's user id, but the person's Smart
  // Steps row (holding their client assignments and appRole) may live under
  // a different id created via Settings → Staff. All permission checks and
  // queries must run under the canonical id, so remap it here — this also
  // heals pre-existing session cookies issued before this fix.
  const canonicalId = await ensureUser({ id: user.id, email: user.email, name: user.name, role: user.role });
  return { ...user, id: canonicalId };
}
