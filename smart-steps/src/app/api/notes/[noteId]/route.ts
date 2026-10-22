import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireAnyPermissionResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { btObservationRequired, btObservationSaveError } from "@/lib/btObservation";

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
      btObservation?:  string | null;
      providerName?:   string | null;
    };

    const VALID_TYPES = ["BT_SESSION", "BCBA", "GENERAL"];
    if (body.type && !VALID_TYPES.includes(body.type))
      return NextResponse.json({ error: "Invalid note type" }, { status: 400 });

    const VALID_BCBA = ["DSU", "TM", "TP", "PRT", "ASSES"];
    if (body.bcbaServiceType && !VALID_BCBA.includes(body.bcbaServiceType))
      return NextResponse.json({ error: "Invalid BCBA service type" }, { status: 400 });

    /* A BT session note written by the therapist who RAN the session must still
       carry their own observation after the edit. The test runs against the note
       as it WILL BE — type, observation and session link all resolved to their
       post-edit values — so neither a type change into BT_SESSION, an edit that
       blanks the field, nor a re-link to one's own session can leave such a note
       without one.

       A note transcribed for another provider's session is never blocked; see
       btObservationRequired(). That is the common case here, and the author was
       not in the room. */
    const existing = await prisma.note.findUnique({
      where:  { id: noteId },
      select: { type: true, btObservation: true, userId: true, sessionId: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const nextType = body.type ?? existing.type;
    const nextObservation = body.btObservation !== undefined
      ? body.btObservation
      : existing.btObservation;
    const nextSessionId = body.sessionId !== undefined ? body.sessionId : existing.sessionId;
    const sessionProviderId = nextSessionId
      ? (await prisma.session.findUnique({
          where:  { id: nextSessionId },
          select: { userId: true },
        }))?.userId ?? null
      : null;

    if (nextType === "BT_SESSION") {
      const err = btObservationSaveError(
        nextObservation,
        btObservationRequired({ noteType: nextType, authorId: existing.userId, sessionProviderId }),
      );
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

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
        ...(body.btObservation   !== undefined
          ? { btObservation: body.btObservation?.trim() || null }
          : {}),
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
