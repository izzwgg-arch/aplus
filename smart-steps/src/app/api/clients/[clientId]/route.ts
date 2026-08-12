import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { clientId } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
        programs: { include: { targets: true } },
        sessions: {
          take: 20,
          orderBy: { startedAt: "desc" },
          include: { trials: true },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const now = new Date();
    const birthYear = client.dob.getFullYear();
    const birthMonth = client.dob.getMonth();
    const birthDay = client.dob.getDate();
    let age = now.getFullYear() - birthYear;
    if (now.getMonth() < birthMonth || (now.getMonth() === birthMonth && now.getDate() < birthDay)) age--;

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const sessionsThisWeek = client.sessions.filter((s) => s.startedAt >= weekStart).length;

    const totalTargets = client.programs.reduce((acc, p) => acc + p.targets.length, 0);
    const masteredTargets = client.programs.reduce(
      (acc, p) => acc + p.targets.filter((t) => t.phase === "MASTERED").length,
      0
    );
    const progressPct = totalTargets > 0 ? Math.round((masteredTargets / totalTargets) * 100) : 0;

    const chartData: { date: string; correct: number; total: number; pct: number }[] = [];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const daySessions = client.sessions.filter(
        (s) => s.startedAt.toDateString() === d.toDateString()
      );
      let correct = 0;
      let total = 0;
      for (const sess of daySessions) {
        for (const t of sess.trials) {
          total++;
          if (t.result === "CORRECT") correct++;
        }
      }
      chartData.push({
        date: days[d.getDay()],
        correct,
        total,
        pct: total > 0 ? Math.round((correct / total) * 100) : 0,
      });
    }

    const resultCounts: Record<string, number> = {};
    for (const sess of client.sessions) {
      for (const t of sess.trials) {
        resultCounts[t.result] = (resultCounts[t.result] ?? 0) + 1;
      }
    }
    const behaviorBreakdown = Object.entries(resultCounts).map(([name, count]) => ({ name, count }));

    const lastSession = client.sessions[0];
    const rbt = client.assignments.find((a) => a.role === "RBT")?.user?.name;
    const bcba = client.assignments.find((a) => a.role === "BCBA")?.user?.name;

    return NextResponse.json({
      id: client.id,
      name: client.name,
      photoUrl: client.photoUrl,
      dob: client.dob.toISOString().slice(0, 10),
      age,
      diagnosis: client.diagnosis,
      guardianName: client.guardianName,
      guardianEmail: client.guardianEmail,
      guardianPhone: client.guardianPhone,
      address: client.address,
      school: client.school,
      insuranceId: client.insuranceId,
      intakeNotes: client.intakeNotes,
      isArchived: client.isArchived,
      assignedRbt: rbt ?? undefined,
      assignedBcba: bcba ?? undefined,
      assignments: client.assignments.map((a) => ({
        id: a.id,
        userId: a.userId,
        role: a.role,
        name: a.user.name,
        email: a.user.email,
      })),
      masteredTargets,
      totalTargets,
      progressPct,
      sessionsThisWeek,
      lastSessionAt: lastSession?.startedAt.toISOString(),
      chartData,
      behaviorBreakdown,
    });
  } catch (err) {
    console.error("GET /api/clients/[clientId] error:", err);
    return NextResponse.json({ error: "Failed to load client" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "BCBA") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientId } = await params;

  try {
    const body = await req.json();
    const { name, dob, diagnosis, guardianName, guardianEmail, guardianPhone, address, school, insuranceId, intakeNotes, isArchived } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (dob !== undefined) data.dob = new Date(dob);
    if (diagnosis !== undefined) data.diagnosis = Array.isArray(diagnosis) ? diagnosis.filter(Boolean) : [];
    if (guardianName !== undefined) data.guardianName = guardianName?.trim() || null;
    if (guardianEmail !== undefined) data.guardianEmail = guardianEmail?.trim() || null;
    if (guardianPhone !== undefined) data.guardianPhone = guardianPhone?.trim() || null;
    if (address !== undefined) data.address = address?.trim() || null;
    if (school !== undefined) data.school = school?.trim() || null;
    if (insuranceId !== undefined) data.insuranceId = insuranceId?.trim() || null;
    if (intakeNotes !== undefined) data.intakeNotes = intakeNotes?.trim() || null;
    if (isArchived !== undefined) data.isArchived = Boolean(isArchived);

    const updated = await prisma.client.update({
      where: { id: clientId },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/clients/[clientId] error:", err);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Only Admin can delete clients" }, { status: 403 });
  }

  const { clientId } = await params;

  try {
    await prisma.client.delete({ where: { id: clientId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/clients/[clientId] error:", err);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
