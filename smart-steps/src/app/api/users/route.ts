import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// Used for staff assignment — returns all users for admin/BCBA.
// ?forDropdown=1 — minimal mode for provider selector: any authenticated role,
// returns only {id, name, role, displayRole} for active staff, no email.
export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const forDropdown = searchParams.get("forDropdown") === "1";

  if (forDropdown) {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true, displayRole: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(users);
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
  }

  const denied = await requirePermissionResponse(user.id, "smartsteps.staff.view");
  if (denied) return denied;

  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(users);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
