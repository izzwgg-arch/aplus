import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireAnyPermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ targetId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.targets.view.assigned", "smartsteps.targets.view.all"]);
  if (denied) return denied;

  const { targetId } = await params;

  try {
    const items = await prisma.targetAnnotation.findMany({
      where: { targetId },
      orderBy: { annotatedAt: "desc" },
      include: { user: { select: { id: true, name: true } } }
    });
    return NextResponse.json(items);
  } catch (err) {
    console.error("GET /api/targets/[targetId]/annotations error:", err);
    return NextResponse.json({ error: "Failed to load annotations" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ targetId: string }> }
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireAnyPermissionResponse(user.id, ["smartsteps.targets.view.assigned", "smartsteps.targets.view.all"]);
  if (denied) return denied;

  const { targetId } = await params;

  try {
    const body = await req.json() as { note?: string; annotatedAt?: string; isVisible?: boolean };
    if (!body.note?.trim()) {
      return NextResponse.json({ error: "Annotation note required" }, { status: 400 });
    }

    const item = await prisma.targetAnnotation.create({
      data: {
        targetId,
        userId: user.id,
        note: body.note.trim(),
        annotatedAt: body.annotatedAt ? new Date(body.annotatedAt) : new Date(),
        isVisible: body.isVisible ?? true
      },
      include: { user: { select: { id: true, name: true } } }
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("POST /api/targets/[targetId]/annotations error:", err);
    return NextResponse.json({ error: "Failed to create annotation" }, { status: 500 });
  }
}
