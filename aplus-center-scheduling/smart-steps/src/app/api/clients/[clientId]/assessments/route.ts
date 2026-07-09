import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.assessments.view");
  if (denied) return denied;

  try {
    const assessments = await prisma.clientAssessment.findMany({
      where: { clientId },
      orderBy: { startedAt: "desc" },
      include: {
        template: { select: { id: true, name: true, category: true, scoringMethod: true } },
        completedBy: { select: { name: true } },
        _count: { select: { responses: true } },
      },
    });

    return NextResponse.json(assessments);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.assessments.view");
  if (denied) return denied;
  const createDenied = await requirePermissionResponse(user.id, "smartsteps.assessments.create");
  if (createDenied) return createDenied;

  try {
    const body = await req.json();
    const { templateId } = body;

    if (!templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 });

    const assessment = await prisma.clientAssessment.create({
      data: {
        clientId,
        templateId,
        completedById: user.id,
        status: "IN_PROGRESS",
      },
      include: {
        template: {
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: { items: { orderBy: { sortOrder: "asc" } } },
            },
          },
        },
      },
    });

    return NextResponse.json(assessment, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create assessment" }, { status: 500 });
  }
}
