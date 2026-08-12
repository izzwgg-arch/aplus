import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const TRIAL_RESULTS = ["CORRECT", "INCORRECT", "PROMPTED", "NR", "SKIP"] as const;
const PROMPT_LEVELS = ["FULL_PHYSICAL", "PARTIAL_PHYSICAL", "GESTURAL", "VERBAL", "MODEL", "INDEPENDENT"] as const;

function isTrialResult(s: string): s is (typeof TRIAL_RESULTS)[number] {
  return TRIAL_RESULTS.includes(s as (typeof TRIAL_RESULTS)[number]);
}
function isPromptLevel(s: string): s is (typeof PROMPT_LEVELS)[number] {
  return PROMPT_LEVELS.includes(s as (typeof PROMPT_LEVELS)[number]);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, trials } = body as {
      sessionId?: string;
      trials?: Array<{ targetId: string; result: string; promptLevel?: string; latencyMs?: number }>;
    };
    if (!sessionId || !Array.isArray(trials) || trials.length === 0) {
      return NextResponse.json(
        { error: "sessionId and non-empty trials array required" },
        { status: 400 }
      );
    }

    const created = await prisma.trial.createMany({
      data: trials.map((t) => ({
        sessionId,
        targetId: t.targetId,
        result: isTrialResult(t.result) ? t.result : "NR",
        promptLevel: t.promptLevel && isPromptLevel(t.promptLevel) ? t.promptLevel : null,
        latencyMs: t.latencyMs ?? null,
      })),
    });
    return NextResponse.json({ count: created.count });
  } catch {
    return NextResponse.json({ count: 0 }, { status: 201 });
  }
}
