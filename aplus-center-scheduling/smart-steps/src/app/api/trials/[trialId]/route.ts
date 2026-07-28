import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

/** Resolves the client that owns a trial (via its session). Returns null if the trial doesn't exist. */
async function getTrialClientId(trialId: string): Promise<string | null> {
  const trial = await prisma.trial.findUnique({
    where: { id: trialId },
    select: { session: { select: { clientId: true } } },
  });
  return trial?.session?.clientId ?? null;
}

const NUMERIC_PROMPT_MAP: Record<string, string> = {
  "0": "INDEPENDENT",
  "1": "VERBAL",
  "2": "GESTURAL",
  "3": "MODEL",
  "4": "PARTIAL_PHYSICAL",
  "5": "FULL_PHYSICAL",
};

function normalizePromptLevel(value: string | null | undefined) {
  if (!value) return null;
  return NUMERIC_PROMPT_MAP[value] ?? value;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ trialId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.trials.edit");
  if (denied) return denied;

  const { trialId } = await params;

  const clientId = await getTrialClientId(trialId);
  if (!clientId) return NextResponse.json({ error: "Trial not found" }, { status: 404 });
  const accessDenied = await requireClientAccessResponse(user.id, clientId, "smartsteps.sessions.view");
  if (accessDenied) return accessDenied;

  try {
    const body = await req.json() as {
      result?: string;
      promptLevel?: string | null;
      latencyMs?: number | null;
      notes?: string | null;
      createdAt?: string;
    };

    const data: Record<string, unknown> = {};
    if (body.result !== undefined) data.result = body.result || "NR";
    if (body.promptLevel !== undefined) data.promptLevel = normalizePromptLevel(body.promptLevel);
    if (body.latencyMs !== undefined) data.latencyMs = body.latencyMs ?? null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    if (body.createdAt !== undefined) data.createdAt = body.createdAt ? new Date(body.createdAt) : new Date();

    const updated = await prisma.trial.update({ where: { id: trialId }, data });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/trials/[trialId] error:", err);
    return NextResponse.json({ error: "Failed to update trial" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ trialId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.trials.delete");
  if (denied) return denied;

  const { trialId } = await params;

  const clientId = await getTrialClientId(trialId);
  if (!clientId) return NextResponse.json({ error: "Trial not found" }, { status: 404 });
  const accessDenied = await requireClientAccessResponse(user.id, clientId, "smartsteps.sessions.view");
  if (accessDenied) return accessDenied;

  try {
    await prisma.trial.update({
      where: { id: trialId },
      data: { deletedAt: new Date() }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/trials/[trialId] error:", err);
    return NextResponse.json({ error: "Failed to delete trial" }, { status: 500 });
  }
}
