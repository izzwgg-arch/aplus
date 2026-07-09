import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse } from "@/lib/permissions";
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
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientId } = await params;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.reports.view");
  if (denied) return denied;

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
