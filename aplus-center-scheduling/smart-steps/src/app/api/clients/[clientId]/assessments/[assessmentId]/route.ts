import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; assessmentId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId, assessmentId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.assessments.view");
  if (denied) return denied;

  try {
    const assessment = await prisma.clientAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        template: {
          include: {
            sections: {
              orderBy: { sortOrder: "asc" },
              include: { items: { orderBy: { sortOrder: "asc" } } },
            },
          },
        },
        responses: true,
        completedBy: { select: { name: true, role: true } },
      },
    });

    if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(assessment);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string; assessmentId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { assessmentId } = await params;
  const denied = await requirePermissionResponse(user.id, "smartsteps.assessments.edit");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { status, notes, totalScore } = body;

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (totalScore !== undefined) data.totalScore = totalScore;
    if (status === "COMPLETED") data.completedAt = new Date();

    const updated = await prisma.clientAssessment.update({ where: { id: assessmentId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
