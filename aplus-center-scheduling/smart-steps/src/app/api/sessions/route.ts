import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { clientId, userId } = body as { clientId?: string; userId?: string };
    if (!clientId || !userId) {
      return NextResponse.json({ error: "clientId and userId required" }, { status: 400 });
    }
    const session = await prisma.session.create({
      data: { clientId, userId },
    });
    return NextResponse.json({ id: session.id });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to create session", id: `mock-${Date.now()}` },
      { status: 201 }
    );
  }
}
