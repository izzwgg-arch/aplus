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
  await ensureUser({ id: user.id, email: user.email, name: user.name, role: user.role });
  return user;
}
