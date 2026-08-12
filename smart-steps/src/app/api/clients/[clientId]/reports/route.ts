import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/clients/[clientId]/reports
 * Returns all ClientReport records generated for a given client.
 * Auth-scoped the same way as /api/clients/[clientId]/assessments.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;

  try {
    const reports = await prisma.clientReport.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        template: {
          select: { id: true, name: true, type: true },
        },
        _count: { select: { sections: true } },
      },
    });

    return NextResponse.json(reports);
  } catch (err) {
    console.error("[client-reports] GET error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
