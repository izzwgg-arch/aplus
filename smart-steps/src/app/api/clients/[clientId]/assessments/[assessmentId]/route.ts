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

/**
 * Delete a client assessment that is not needed (wrong template picked, blank
 * duplicate, test entry). Item responses are removed with it via the
 * `ClientAssessmentResponse.clientAssessment` cascade; the template itself and
 * every other client's assessments are untouched.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; assessmentId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId, assessmentId } = await params;

  const accessDenied = await requireClientAccessResponse(user.id, clientId, "smartsteps.assessments.view");
  if (accessDenied) return accessDenied;
  const denied = await requirePermissionResponse(user.id, "smartsteps.assessments.delete");
  if (denied) return denied;

  const existing = await prisma.clientAssessment.findUnique({
    where: { id: assessmentId },
    select: { clientId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Guard against an id from a different client being passed in the URL.
  if (existing.clientId !== clientId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await prisma.clientAssessment.delete({ where: { id: assessmentId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /clients/[clientId]/assessments/[assessmentId] error:", err);
    return NextResponse.json({ error: "Failed to delete assessment" }, { status: 500 });
  }
}
