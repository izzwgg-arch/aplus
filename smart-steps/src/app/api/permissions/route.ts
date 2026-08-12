import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/permissionKeys";

/**
 * GET /smart-steps/api/permissions
 * Returns the full permission catalog grouped by category — used to render
 * the role permission checklist on the Permissions settings page.
 * Requires smartsteps.permissions.manage.
 */
export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.permissions.manage");
  if (denied) return denied;

  const grouped: Record<string, { key: string; label: string }[]> = {};
  for (const p of PERMISSIONS) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push({ key: p.key, label: p.label });
  }

  return NextResponse.json({ categories: grouped, all: PERMISSIONS });
}
