import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

const TRIAL_RESULTS = ["CORRECT", "INCORRECT", "PROMPTED", "NR", "SKIP"] as const;
const PROMPT_LEVELS = ["FULL_PHYSICAL", "PARTIAL_PHYSICAL", "GESTURAL", "VERBAL", "MODEL", "INDEPENDENT"] as const;
const NUMERIC_PROMPT_MAP: Record<string, (typeof PROMPT_LEVELS)[number]> = {
  "0": "INDEPENDENT",
  "1": "VERBAL",
  "2": "GESTURAL",
  "3": "MODEL",
  "4": "PARTIAL_PHYSICAL",
  "5": "FULL_PHYSICAL",
};

function isTrialResult(s: string): s is (typeof TRIAL_RESULTS)[number] {
  return TRIAL_RESULTS.includes(s as (typeof TRIAL_RESULTS)[number]);
}
function isPromptLevel(s: string): s is (typeof PROMPT_LEVELS)[number] {
  return PROMPT_LEVELS.includes(s as (typeof PROMPT_LEVELS)[number]);
}

function normalizePromptLevel(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const asString = String(value);
  if (isPromptLevel(asString)) return asString;
  return NUMERIC_PROMPT_MAP[asString] ?? null;
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const denied = await requirePermissionResponse(user.id, "smartsteps.trials.create");
    if (denied) return denied;

    const body = await req.json();
    const { sessionId, targetId, result, promptLevel, latencyMs, notes, createdAt, trials } = body as {
      sessionId?: string;
      targetId?: string;
      result?: string;
      promptLevel?: string | number | null;
      latencyMs?: number;
      notes?: string | null;
      createdAt?: string;
      trials?: Array<{ targetId: string; result: string; promptLevel?: string | number | null; latencyMs?: number; notes?: string | null; createdAt?: string }>;
    };
    const normalizedTrials = Array.isArray(trials)
      ? trials
      : sessionId && targetId && result
        ? [{ targetId, result, promptLevel, latencyMs, notes, createdAt }]
        : [];

    if (!sessionId || normalizedTrials.length === 0) {
      return NextResponse.json(
        { error: "sessionId and trial payload required" },
        { status: 400 }
      );
    }

    // Validate session exists before attempting the batch insert
    const sessionExists = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, clientId: true },
    });
    if (!sessionExists) {
      return NextResponse.json(
        { error: `Session not found: ${sessionId}`, code: "SESSION_NOT_FOUND" },
        { status: 422 },
      );
    }

    // Data entry is restricted to clients the user is assigned to (unless they
    // hold the ".all" scope). RBTs get ".assigned" and are blocked here for any
    // client not in their caseload, even if they somehow obtained the sessionId.
    const accessDenied = await requireClientAccessResponse(
      user.id,
      sessionExists.clientId,
      "smartsteps.sessions.view",
    );
    if (accessDenied) return accessDenied;

    // Validate all targetIds exist in DB (catch local/stale IDs early)
    const targetIds = [...new Set(normalizedTrials.map((t) => t.targetId))];
    const existingTargets = await prisma.target.findMany({
      where: { id: { in: targetIds } },
      select: { id: true },
    });
    const existingTargetIds = new Set(existingTargets.map((t) => t.id));
    const invalidTargetIds = targetIds.filter((id) => !existingTargetIds.has(id));
    if (invalidTargetIds.length > 0) {
      return NextResponse.json(
        {
          error: `Target(s) not found on server — goal may not be synced yet: ${invalidTargetIds.join(", ")}`,
          code: "TARGET_NOT_FOUND",
          invalidTargetIds,
        },
        { status: 422 },
      );
    }

    const created = await prisma.$transaction(
      normalizedTrials.map((t) =>
        prisma.trial.create({
          data: {
            sessionId,
            targetId: t.targetId,
            result: isTrialResult(t.result) ? t.result : "NR",
            promptLevel: normalizePromptLevel(t.promptLevel),
            latencyMs: t.latencyMs ?? null,
            notes: t.notes?.trim() || null,
            createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
          },
        })
      )
    );
    return NextResponse.json({ count: created.length, items: created }, { status: 201 });
  } catch (e) {
    console.error("POST /api/trials error:", e);
    return NextResponse.json({ error: "Failed to create trials", count: 0 }, { status: 500 });
  }
}
