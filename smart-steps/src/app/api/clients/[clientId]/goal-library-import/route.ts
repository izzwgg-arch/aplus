import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { can, requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/auditLogger";
import { replaceClientNamePlaceholders } from "@/lib/sanitizeHtml";

/**
 * Imports a Goal Library / Parent Goal Library item into a client's live goal
 * hierarchy — the same Category (DB `Program`) -> Skill Area (DB `ParentGoal`)
 * -> Goal (DB `Target`) records the Goals & Targets tab reads.
 *
 * Used by the assessment report editor: picking a goal from the library there
 * has to produce a REAL goal for the child, not just a row of table text, so a
 * BT can start taking data on it the same day. The category and skill area are
 * resolved by name (case-insensitive) and created when they do not exist yet.
 *
 * Idempotent on the goal itself: re-importing the same definition under the
 * same skill area returns the existing Target with `duplicate: true` rather
 * than stacking copies, because report tables get edited repeatedly.
 */

type Body = {
  itemType?: "GOAL" | "PARENT_GOAL";
  libraryItemId?: string | null;
  /** Category name — DB `Program.name`. */
  category?: string | null;
  /** Skill-area title — DB `ParentGoal.title`. */
  skillArea?: string | null;
  /** Goal definition (GOAL) — DB `Target.definition`. */
  title?: string | null;
  operationalDefinition?: string | null;
  targetType?: string | null;
  masteryRule?: unknown;
  promptHierarchy?: unknown;
  notes?: string | null;
  description?: string | null;
  domain?: string | null;
  /** "YYYY-MM-DD" — stored as masteryRule.openedDate, the report's Start Date. */
  startDate?: string | null;
};

const DEFAULT_MASTERY: Record<string, unknown> = {
  percentage: 80,
  consecutiveDays: 3,
  consecutiveSessions: 3,
  minTrialsPerSession: 10,
  firstTrialMustBe: "ANY",
  promptLevelToMaster: 0,
  masteryType: "MANUAL",
  openedDate: null,
  baselineDate: null,
  masteredDate: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.goals.view");
  if (denied) return denied;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const itemType = body.itemType === "PARENT_GOAL" ? "PARENT_GOAL" : "GOAL";

  const deniedCreate = await requirePermissionResponse(
    user.id,
    itemType === "GOAL" ? "smartsteps.targets.create" : "smartsteps.goals.create",
  );
  if (deniedCreate) return deniedCreate;

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true },
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    // Library templates carry {{client}} / (Client) placeholders — resolve them
    // against this child exactly as the Goals & Targets library picker does.
    const sub = (value: string | null | undefined) =>
      replaceClientNamePlaceholders(value ?? "", client.name).trim();

    const skillAreaTitle = sub(body.skillArea) || (itemType === "PARENT_GOAL" ? sub(body.title) : "");
    if (!skillAreaTitle) {
      return NextResponse.json({ error: "A skill area is required" }, { status: 400 });
    }

    const definition = itemType === "GOAL" ? sub(body.title) : "";
    if (itemType === "GOAL" && !definition) {
      return NextResponse.json({ error: "A goal is required" }, { status: 400 });
    }

    const categoryName = (body.category ?? "").trim();
    const domain = (body.domain ?? "").trim() || categoryName;

    // -- Category (DB Program) ------------------------------------------------
    let program = categoryName
      ? await prisma.program.findFirst({
          where: { clientId, isActive: true, name: { equals: categoryName, mode: "insensitive" } },
          orderBy: { createdAt: "asc" },
        })
      : null;
    let createdProgram = false;

    // Creating the category is a side effect of filing the goal. A user allowed
    // to add goals but not categories still gets their goal — it just lands
    // uncategorised rather than failing the whole import.
    if (categoryName && !program && (await can(user.id, "smartsteps.programs.create"))) {
      program = await prisma.program.create({
        data: { clientId, name: categoryName, domain: domain || categoryName },
      });
      createdProgram = true;
      await auditLog(user.id, "UPDATE_PROGRAM", "Program", program.id, {
        action: "create",
        via: "assessment-goal-library",
      });
    }

    // -- Skill area (DB ParentGoal) -------------------------------------------
    let parentGoal = await prisma.parentGoal.findFirst({
      where: {
        clientId,
        status: { not: "ARCHIVED" },
        title: { equals: skillAreaTitle, mode: "insensitive" },
      },
      orderBy: { createdAt: "asc" },
    });
    let createdParentGoal = false;

    if (!parentGoal) {
      const deniedGoal = await requirePermissionResponse(user.id, "smartsteps.goals.create");
      if (deniedGoal) return deniedGoal;
      parentGoal = await prisma.parentGoal.create({
        data: {
          clientId,
          title: skillAreaTitle,
          description: sub(body.description) || null,
          domain: domain || null,
          programId: program?.id ?? null,
          status: "ACTIVE",
        },
      });
      createdParentGoal = true;
    } else if (program && !parentGoal.programId) {
      // An existing skill area with no category link is invisible in the
      // Goals & Targets drill-down — adopt the category we just resolved.
      parentGoal = await prisma.parentGoal.update({
        where: { id: parentGoal.id },
        data: { programId: program.id },
      });
    }

    // -- Goal (DB Target) -----------------------------------------------------
    let target: { id: string; definition: string; baseline: string | null } | null = null;
    let duplicate = false;

    if (itemType === "GOAL") {
      const existing = await prisma.target.findFirst({
        where: {
          parentGoalId: parentGoal.id,
          isActive: true,
          definition: { equals: definition, mode: "insensitive" },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, definition: true, baseline: true },
      });

      if (existing) {
        target = existing;
        duplicate = true;
      } else {
        const masteryRule = {
          ...DEFAULT_MASTERY,
          ...(asRecord(body.masteryRule) ?? {}),
          openedDate: (body.startDate ?? "").trim() || null,
        };
        const promptHierarchy = Array.isArray(body.promptHierarchy)
          ? body.promptHierarchy.filter((p): p is string => typeof p === "string")
          : [];

        target = await prisma.target.create({
          data: {
            definition,
            // `baseline` holds the operational definition — the same mapping
            // POST /api/targets applies, so an imported goal is indistinguishable
            // from one added in the Goals & Targets tab.
            baseline: sub(body.operationalDefinition) || null,
            targetType: (body.targetType ?? "").trim() || "DISCRETE_TRIAL",
            phase: "NEW",
            masteryRule: masteryRule as Prisma.InputJsonValue,
            promptHierarchy,
            notes: sub(body.notes) || null,
            parentGoalId: parentGoal.id,
            programId: program?.id ?? parentGoal.programId ?? null,
            isActive: true,
          },
          select: { id: true, definition: true, baseline: true },
        });
        await auditLog(user.id, "UPDATE_TARGET", "Target", target.id, {
          action: "create",
          via: "assessment-goal-library",
        });
      }
    }

    // -- Library usage (mirrors POST /api/goal-library/recently-used) ---------
    const libraryItemId = (body.libraryItemId ?? "").trim();
    if (libraryItemId && !duplicate) {
      try {
        await prisma.goalLibraryUsage.create({
          data: {
            userId: user.id,
            itemType,
            goalItemId: itemType === "GOAL" ? libraryItemId : null,
            parentItemId: itemType === "PARENT_GOAL" ? libraryItemId : null,
          },
        });
        if (itemType === "GOAL") {
          await prisma.targetLibraryItem.update({
            where: { id: libraryItemId },
            data: { usageCount: { increment: 1 } },
          });
        } else {
          await prisma.parentGoalLibraryItem.update({
            where: { id: libraryItemId },
            data: { usageCount: { increment: 1 } },
          });
        }
      } catch {
        /* usage tracking is best-effort — never fail the import over it */
      }
    }

    return NextResponse.json(
      {
        itemType,
        duplicate,
        created: {
          category: createdProgram,
          skillArea: createdParentGoal,
          goal: Boolean(target) && !duplicate,
        },
        category: program ? { id: program.id, name: program.name } : null,
        skillArea: { id: parentGoal.id, title: parentGoal.title },
        goal: target,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/clients/[clientId]/goal-library-import error:", err);
    return NextResponse.json({ error: "Failed to add goal" }, { status: 500 });
  }
}
