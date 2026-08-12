import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// Used for staff assignment — returns all users for admin/BCBA.
// ?forDropdown=1 — minimal mode for provider selector: any authenticated role,
// returns only {id, name, role, displayRole} for active staff, no email.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "BCBA") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
