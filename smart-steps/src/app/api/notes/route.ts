import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { accessibleClientIds, requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId        = searchParams.get("clientId");
  const userId          = searchParams.get("userId");
  const type            = searchParams.get("type");         // BT_SESSION | BCBA | GENERAL
  const bcbaServiceType = searchParams.get("bcbaServiceType");
  const from            = searchParams.get("from");
  const to              = searchParams.get("to");
  const limit           = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset          = Number(searchParams.get("offset") ?? 0);

  if (clientId) {
    const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.notes.view");
    if (denied) return denied;
  }
  const clientIds = clientId ? null : await accessibleClientIds(user.id, "smartsteps.notes.view");

  try {
    const notes = await prisma.note.findMany({
      where: {
        ...(clientId ? { clientId } : (clientIds === "ALL" ? {} : { clientId: { in: clientIds as string[] } })),
        ...(userId   ? { userId }   : {}),
        ...(type     ? { type }     : {}),
        ...(bcbaServiceType ? { bcbaServiceType } : {}),
        ...(from || to
          ? {
              serviceDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to   ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
              },
            }
          : {}),
      },
      orderBy: [
        { serviceDate: "desc" },
        { createdAt:   "desc" },
      ],
      take: limit,
      skip: offset,
      select: {
        id:              true,
        clientId:        true,
        userId:          true,
        sessionId:       true,
        title:           true,
        type:            true,
        bcbaServiceType: true,
        serviceDate:     true,
        timeIn:          true,
        timeOut:         true,
        attendance:      true,
        providerName:    true,
        isGenerated:     true,
        createdAt:       true,
        updatedAt:       true,
        content:         true,
        recommendations: true,
        nextSteps:       true,
        user:            { select: { id: true, name: true, role: true } },
      },
    });

    return NextResponse.json(notes);
  } catch (e) {
    console.error("GET /api/notes error:", e);
    return NextResponse.json({ error: "Failed to load notes" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  const userId = user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(userId, "smartsteps.notes.create");
  if (denied) return denied;

  try {
    const body = await req.json() as {
      clientId:        string;
      type:            string;
      bcbaServiceType?: string;
      sessionId?:      string;
      title?:          string;
      serviceDate?:    string;
      timeIn?:         string;
      timeOut?:        string;
      attendance?:     string;
      content:         string;
      recommendations?: string;
      nextSteps?:      string;
      providerName?:   string;
      isGenerated?:    boolean;
    };

    if (!body.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
    const clientDenied = await requireClientAccessResponse(userId, body.clientId, "smartsteps.notes.view");
    if (clientDenied) return clientDenied;
    if (!body.type)     return NextResponse.json({ error: "type required" },     { status: 400 });
    if (!body.content && body.content !== "")
      return NextResponse.json({ error: "content required" }, { status: 400 });

    const VALID_TYPES = ["BT_SESSION", "BCBA", "GENERAL"];
    if (!VALID_TYPES.includes(body.type))
      return NextResponse.json({ error: "Invalid note type" }, { status: 400 });

    const VALID_BCBA = ["DSU", "TM", "TP", "PRT", "ASSES"];
    if (body.type === "BCBA" && body.bcbaServiceType && !VALID_BCBA.includes(body.bcbaServiceType))
      return NextResponse.json({ error: "Invalid BCBA service type" }, { status: 400 });

    const note = await prisma.note.create({
      data: {
        clientId:        body.clientId,
        userId,
        sessionId:       body.sessionId       ?? null,
        title:           body.title           ?? null,
        type:            body.type,
        bcbaServiceType: body.bcbaServiceType ?? null,
        serviceDate:     body.serviceDate     ? new Date(body.serviceDate) : null,
        timeIn:          body.timeIn          ?? null,
        timeOut:         body.timeOut         ?? null,
        attendance:      body.attendance      ?? null,
        content:         body.content,
        recommendations: body.recommendations ?? null,
        nextSteps:       body.nextSteps       ?? null,
        providerName:    body.providerName    ?? null,
        isGenerated:     body.isGenerated     ?? false,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (e) {
    console.error("POST /api/notes error:", e);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
