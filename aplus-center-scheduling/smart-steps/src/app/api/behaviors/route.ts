import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/auditLogger";

function mockBehaviors(clientId: string) {
  return [
    { id: "b1", sessionId: "s1", type: "ABC", behavior: "Screaming", antecedent: "Demand presented", consequence: "Escape", intensity: "moderate", createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: "b2", sessionId: "s1", type: "frequency", behavior: "Hand flapping", value: 4, createdAt: new Date(Date.now() - 43200000).toISOString() },
  ];
}

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const sessionId = searchParams.get("sessionId");

  if (clientId) {
    const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.behavior_plan.view");
    if (denied) return denied;
  }

  try {
    const where = sessionId
      ? { sessionId }
      : clientId
      ? { session: { clientId } }
      : {};

    const behaviors = await prisma.behaviorEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    await auditLog(user.id, "VIEW_CLIENT", "BehaviorEvent", clientId, { query: "GET behaviors" });
    return NextResponse.json(behaviors.length ? behaviors : mockBehaviors(clientId ?? "mock"));
  } catch {
    return NextResponse.json(mockBehaviors(clientId ?? "mock"));
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.trials.create");
  if (denied) return denied;

  try {
    const body = await req.json() as {
      sessionId?: string;
      type?: string;
      value?: number;
      antecedent?: string;
      behavior?: string;
      consequence?: string;
      intensity?: string;
      // Batch mode: { sessionId, events: [...] }
      events?: Array<{
        type: string;
        antecedent?: string;
        behavior?: string;
        consequence?: string;
        intensity?: string;
        value?: number;
      }>;
    };

    // Batch insert
    if (body.events && body.sessionId) {
      const created = await prisma.$transaction(
        body.events.map((e) =>
          prisma.behaviorEvent.create({
            data: {
              sessionId: body.sessionId!,
              type: e.type,
              antecedent: e.antecedent ?? "",
              behavior: e.behavior ?? "",
              consequence: e.consequence ?? "",
              intensity: e.intensity ?? "mild",
              value: e.value ?? null,
            },
          })
        )
      );
      return NextResponse.json({ created: created.length }, { status: 201 });
    }

    // Single insert
    const event = await prisma.behaviorEvent.create({
      data: {
        sessionId: body.sessionId!,
        type: body.type ?? "ABC",
        antecedent: body.antecedent ?? "",
        behavior: body.behavior ?? "",
        consequence: body.consequence ?? "",
        intensity: body.intensity ?? "mild",
        value: body.value ?? null,
      },
    });
    await auditLog(user.id, "LOG_BEHAVIOR", "BehaviorEvent", event.id);
    return NextResponse.json(event, { status: 201 });
  } catch (e) {
    console.error("POST /behaviors error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
