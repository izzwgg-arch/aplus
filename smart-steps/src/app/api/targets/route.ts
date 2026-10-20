import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.targets.create");
  if (denied) return denied;

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

    /* Re-creating a goal that already exists under the same parent returns the
     * EXISTING row instead of a second copy, the same way
     * `POST /api/clients/[clientId]/goal-library-import` is idempotent.
     *
     * Four production clients had exact duplicate targets created 13-60 seconds
     * apart (Aron Wertzberger, Yisrol Zev Wallach x2, Yossi Brim) — too slow for
     * a double-click, and the signature of someone saving a goal, not seeing it
     * appear, and typing it again. The drill-down bugs that hid a freshly created
     * goal are fixed separately; this stops the re-entry from leaving a duplicate
     * in the clinical record. The local store then links to the existing goal, so
     * the user gets the goal they expected either way.
     *
     * Scoped to the SAME parent, so two children — or two skill areas — may
     * legitimately carry identically worded goals. An orphan target (no parent at
     * all) is not scopable and is always created. */
    const parentScope =
      subGoalId ? { subGoalId: String(subGoalId) }
      : parentGoalId ? { parentGoalId: String(parentGoalId) }
      : programId ? { programId: String(programId), parentGoalId: null, subGoalId: null }
      : null;

    if (parentScope) {
      const existing = await prisma.target.findFirst({
        where: {
          ...parentScope,
          isActive: true,
          definition: { equals: definition.trim(), mode: "insensitive" },
        },
      });
      if (existing) return NextResponse.json({ ...existing, duplicate: true });
    }

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
