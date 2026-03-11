import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function mockClient(id: string) {
  const mocks: Record<string, { name: string; dob: string; age: number; diagnosis: string[]; assignedRbt?: string; assignedBcba?: string; lastSession?: string; progressPct: number }> = {
    "1": { name: "Alex J.", dob: "2018-05-12", age: 7, diagnosis: ["ASD"], assignedRbt: "Jordan", assignedBcba: "Dr. Smith", lastSession: "2h ago", progressPct: 78 },
    "2": { name: "Sam K.", dob: "2019-11-03", age: 6, diagnosis: ["ASD", "ADHD"], assignedRbt: "Casey", assignedBcba: "Dr. Smith", lastSession: "1d ago", progressPct: 92 },
    "3": { name: "Riley M.", dob: "2017-02-28", age: 8, diagnosis: ["ASD"], assignedRbt: "Jordan", lastSession: "Today", progressPct: 65 },
  };
  const m = mocks[id];
  if (!m) return null;
  return { id, photoUrl: null, ...m };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const c = await prisma.client.findUnique({
      where: { id },
      include: { assignments: { include: { user: { select: { name: true } } } } },
    });
    if (!c) {
      const mock = mockClient(id);
      return mock ? NextResponse.json(mock) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const age = new Date().getFullYear() - c.dob.getFullYear();
    const rbt = c.assignments.find((a) => a.role === "RBT")?.user?.name;
    const bcba = c.assignments.find((a) => a.role === "BCBA")?.user?.name;
    return NextResponse.json({
      id: c.id,
      name: c.name,
      photoUrl: c.photoUrl,
      dob: c.dob.toISOString().slice(0, 10),
      age,
      diagnosis: c.diagnosis,
      assignedRbt: rbt ?? undefined,
      assignedBcba: bcba ?? undefined,
      lastSession: null,
      progressPct: 0,
    });
  } catch {
    const mock = mockClient(id);
    return mock ? NextResponse.json(mock) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
