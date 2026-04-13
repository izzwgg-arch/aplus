import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const role = (session.user as { role?: string }).role;
    const isAdmin = role === "ADMIN" || role === "BCBA";

    const clients = await prisma.client.findMany({
      where: {
        isArchived: false,
        ...(isAdmin
          ? {}
          : { assignments: { some: { userId: session.user!.id } } }),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        assignments: { include: { user: { select: { name: true, role: true } } } },
        sessions: { take: 1, orderBy: { startedAt: "desc" } },
      },
    });

    const now = new Date();
    const list = clients.map((c) => {
      const birthYear = c.dob.getFullYear();
      const birthMonth = c.dob.getMonth();
      const birthDay = c.dob.getDate();
      let age = now.getFullYear() - birthYear;
      if (now.getMonth() < birthMonth || (now.getMonth() === birthMonth && now.getDate() < birthDay)) age--;

      const rbt = c.assignments.find((a) => a.role === "RBT")?.user?.name;
      const bcba = c.assignments.find((a) => a.role === "BCBA")?.user?.name;
      const lastS = c.sessions[0];
      let lastSession: string | undefined;
      if (lastS) {
        const diff = now.getTime() - lastS.startedAt.getTime();
        if (diff < 3600000) lastSession = `${Math.floor(diff / 60000)}m ago`;
        else if (diff < 86400000) lastSession = "Today";
        else lastSession = `${Math.floor(diff / 86400000)}d ago`;
      }
      return {
        id: c.id,
        name: c.name,
        photoUrl: c.photoUrl,
        dob: c.dob.toISOString().slice(0, 10),
        age,
        diagnosis: c.diagnosis,
        assignedRbt: rbt ?? undefined,
        assignedBcba: bcba ?? undefined,
        lastSession,
        progressPct: 0,
        isArchived: c.isArchived,
      };
    });
    return NextResponse.json(list);
  } catch (err) {
    console.error("GET /api/clients error:", err);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "BCBA") {
    return NextResponse.json({ error: "Only BCBA or Admin can create clients" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, dob, diagnosis, guardianName, guardianEmail, guardianPhone, address, school, insuranceId, intakeNotes } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!dob) return NextResponse.json({ error: "Date of birth is required" }, { status: 400 });

    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
    }

    const client = await prisma.client.create({
      data: {
        name: name.trim(),
        dob: dobDate,
        diagnosis: Array.isArray(diagnosis) ? diagnosis.filter(Boolean) : [],
        guardianName: guardianName?.trim() || null,
        guardianEmail: guardianEmail?.trim() || null,
        guardianPhone: guardianPhone?.trim() || null,
        address: address?.trim() || null,
        school: school?.trim() || null,
        insuranceId: insuranceId?.trim() || null,
        intakeNotes: intakeNotes?.trim() || null,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (err) {
    console.error("POST /api/clients error:", err);
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}
