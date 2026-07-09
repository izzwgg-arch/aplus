import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireAnyPermissionResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ noteId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.notes.view.assigned", "smartsteps.notes.view.all"]);
  if (denied) return denied;

  const { noteId } = await params;

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: { user: { select: { id: true, name: true, role: true, credentials: true } } },
    });

    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(note);
  } catch (e) {
    console.error("GET /api/notes/[noteId] error:", e);
    return NextResponse.json({ error: "Failed to load note" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.notes.edit");
  if (denied) return denied;

  const { noteId } = await params;

  try {
    const body = await req.json() as {
      title?:          string | null;
      type?:           string;
      bcbaServiceType?: string | null;
      sessionId?:      string | null;
      serviceDate?:    string | null;
      timeIn?:         string | null;
      timeOut?:        string | null;
      attendance?:     string | null;
      content?:        string;
      recommendations?: string | null;
      nextSteps?:      string | null;
      providerName?:   string | null;
    };

    const VALID_TYPES = ["BT_SESSION", "BCBA", "GENERAL"];
    if (body.type && !VALID_TYPES.includes(body.type))
      return NextResponse.json({ error: "Invalid note type" }, { status: 400 });

    const VALID_BCBA = ["DSU", "TM", "TP", "PRT", "ASSES"];
    if (body.bcbaServiceType && !VALID_BCBA.includes(body.bcbaServiceType))
      return NextResponse.json({ error: "Invalid BCBA service type" }, { status: 400 });

    const updated = await prisma.note.update({
      where: { id: noteId },
      data: {
        ...(body.title           !== undefined ? { title:           body.title }              : {}),
        ...(body.type            !== undefined ? { type:            body.type }               : {}),
        ...(body.bcbaServiceType !== undefined ? { bcbaServiceType: body.bcbaServiceType }    : {}),
        ...(body.sessionId       !== undefined ? { sessionId:       body.sessionId }          : {}),
        ...(body.serviceDate     !== undefined
          ? { serviceDate: body.serviceDate ? new Date(body.serviceDate) : null }
          : {}),
        ...(body.timeIn          !== undefined ? { timeIn:          body.timeIn }             : {}),
        ...(body.timeOut         !== undefined ? { timeOut:         body.timeOut }            : {}),
        ...(body.attendance      !== undefined ? { attendance:      body.attendance }         : {}),
        ...(body.content         !== undefined ? { content:         body.content }            : {}),
        ...(body.recommendations !== undefined ? { recommendations: body.recommendations }    : {}),
        ...(body.nextSteps       !== undefined ? { nextSteps:       body.nextSteps }          : {}),
        ...(body.providerName    !== undefined ? { providerName:    body.providerName }       : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/notes/[noteId] error:", e);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.notes.delete");
  if (denied) return denied;

  const { noteId } = await params;

  try {
    await prisma.note.delete({ where: { id: noteId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/notes/[noteId] error:", e);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
