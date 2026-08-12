import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      definition,
      operationalDefinition,
      targetType,
      phase,
      masteryRule,
      promptHierarchy,
      baseline,
      notes,
      dateMastered,
      programId,
      parentGoalId,
      subGoalId,
    } = body;

    if (!definition?.trim()) return NextResponse.json({ error: "Definition required" }, { status: 400 });

    const target = await prisma.target.create({
      data: {
        definition: definition.trim(),
        targetType: targetType ?? "DISCRETE_TRIAL",
        phase: phase ?? "NEW",
        masteryRule: masteryRule ?? null,
        promptHierarchy: Array.isArray(promptHierarchy) ? promptHierarchy : [],
        baseline: operationalDefinition?.trim() || baseline?.trim() || null,
        notes: notes?.trim() || null,
        // `dateMastered` is manual-only. Never infer it implicitly from masteryRule.
        dateMastered: dateMastered ? new Date(dateMastered) : null,
        programId: programId || null,
        parentGoalId: parentGoalId || null,
        subGoalId: subGoalId || null,
        isActive: true,
      },
    });

    return NextResponse.json(target, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create target" }, { status: 500 });
  }
}
