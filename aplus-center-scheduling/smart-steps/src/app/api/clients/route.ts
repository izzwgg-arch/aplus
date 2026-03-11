import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function mockClients() {
  return [
    { id: "1", name: "Alex J.", photoUrl: null, dob: "2018-05-12", age: 7, diagnosis: ["ASD"], assignedRbt: "Jordan", assignedBcba: "Dr. Smith", lastSession: "2h ago", progressPct: 78 },
    { id: "2", name: "Sam K.", photoUrl: null, dob: "2019-11-03", age: 6, diagnosis: ["ASD", "ADHD"], assignedRbt: "Casey", assignedBcba: "Dr. Smith", lastSession: "1d ago", progressPct: 92 },
    { id: "3", name: "Riley M.", photoUrl: null, dob: "2017-02-28", age: 8, diagnosis: ["ASD"], assignedRbt: "Jordan", assignedBcba: undefined, lastSession: "Today", progressPct: 65 },
  ];
}

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        assignments: { include: { user: { select: { name: true } } } },
      },
    });
    const now = new Date();
    const list = clients.map((c) => {
      const age = now.getFullYear() - c.dob.getFullYear();
      const rbt = c.assignments.find((a) => a.role === "RBT")?.user?.name;
      const bcba = c.assignments.find((a) => a.role === "BCBA")?.user?.name;
      return {
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
      };
    });
    return NextResponse.json(list.length ? list : mockClients());
  } catch {
    return NextResponse.json(mockClients());
  }
}
