import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/auditLogger";

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.programs.view");
  if (denied) return denied;

  try {
    const programs = await prisma.program.findMany({
      where: { clientId, isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { _count: { select: { targets: true } } },
    });

    const withCounts = await Promise.all(
      programs.map(async (p) => {
        const masteredCount = await prisma.target.count({
          where: { programId: p.id, phase: "MASTERED" },
        });
        return {
          id: p.id,
          clientId: p.clientId,
          name: p.name,
          domain: p.domain,
          description: p.description ?? "",
          isActive: p.isActive,
          createdAt: p.createdAt.toISOString(),
          targetCount: p._count.targets,
          masteredCount,
        };
      })
    );
    return NextResponse.json(withCounts);
  } catch (err) {
    console.error("GET /api/programs error:", err);
    return NextResponse.json({ error: "Failed to load programs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.programs.create");
  if (denied) return denied;

  try {
    const body = await req.json() as { clientId: string; name: string; domain: string; description?: string };
    const program = await prisma.program.create({
      data: { clientId: body.clientId, name: body.name, domain: body.domain },
    });
    await auditLog(user.id, "UPDATE_PROGRAM", "Program", program.id, { action: "create" });
    return NextResponse.json(program, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
