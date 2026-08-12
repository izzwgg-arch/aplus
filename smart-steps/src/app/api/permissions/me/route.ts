import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getUserPermissions, getUserRoleKey } from "@/lib/permissions";

/**
 * GET /smart-steps/api/permissions/me
 * Returns the caller's effective permission keys + role key. Used by the
 * usePermissions() hook to drive nav filtering and UI enforcement.
 */
export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [keys, roleKey] = await Promise.all([
    getUserPermissions(user.id),
    getUserRoleKey(user.id),
  ]);

  return NextResponse.json({ permissions: [...keys], roleKey });
}
