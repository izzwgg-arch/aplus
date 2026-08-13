import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// Save or update multiple responses at once
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ clientId: string; assessmentId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId, assessmentId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.assessments.view");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { responses } = body;
    // responses: Array<{ itemId: string; responseValue: string | null; responseScore?: number; notes?: string }>

    if (!Array.isArray(responses)) {
      return NextResponse.json({ error: "responses array required" }, { status: 400 });
    }

    // Upsert each response
    const results = await Promise.all(
      responses.map((r: { itemId: string; responseValue?: string | null; responseScore?: number; notes?: string }) =>
        prisma.clientAssessmentResponse.upsert({
          where: {
            clientAssessmentId_itemId: {
              clientAssessmentId: assessmentId,
              itemId: r.itemId,
            },
          },
          update: {
            responseValue: r.responseValue ?? null,
            responseScore: r.responseScore ?? null,
            notes: r.notes?.trim() || null,
          },
          create: {
            clientAssessmentId: assessmentId,
            itemId: r.itemId,
            responseValue: r.responseValue ?? null,
            responseScore: r.responseScore ?? null,
            notes: r.notes?.trim() || null,
          },
        })
      )
    );

    // Recalculate total score
    const allResponses = await prisma.clientAssessmentResponse.findMany({
      where: { clientAssessmentId: assessmentId },
      select: { responseScore: true },
    });

    const totalScore = allResponses.reduce((sum, r) => sum + (r.responseScore ?? 0), 0);

    await prisma.clientAssessment.update({
      where: { id: assessmentId },
      data: { totalScore },
    });

    return NextResponse.json({ saved: results.length, totalScore });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save responses" }, { status: 500 });
  }
}

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
    const responses = await prisma.clientAssessmentResponse.findMany({
      where: { clientAssessmentId: assessmentId },
    });
    return NextResponse.json(responses);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
