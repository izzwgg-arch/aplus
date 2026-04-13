import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PrismaClient } from "@prisma/client";

/* ── Secondary Prisma client for the scheduling database ── */
const schedulingDbUrl = process.env.SCHEDULING_DATABASE_URL;

let schedulingPrisma: PrismaClient | null = null;
function getSchedulingPrisma(): PrismaClient | null {
  if (!schedulingDbUrl) return null;
  if (!schedulingPrisma) {
    schedulingPrisma = new PrismaClient({
      datasources: { db: { url: schedulingDbUrl } },
    });
  }
  return schedulingPrisma;
}

export type ScheduleAppointment = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  title: string | null;
  location: string | null;
  serviceName: string | null;
  providerName: string | null;
  durationMinutes: number | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { clientId } = await params;

  // Check if scheduling DB is configured
  const sp = getSchedulingPrisma();
  if (!sp) {
    return NextResponse.json({
      appointments: [],
      configured: false,
      message: "Scheduling database not configured (SCHEDULING_DATABASE_URL missing)",
    });
  }

  try {
    // Look up client name in Smart Steps DB
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Query scheduling DB for appointments matching this client by name
    // Uses case-insensitive, trimmed name match to bridge the two systems
    const rows = await sp.$queryRaw<
      Array<{
        id: string;
        startsAt: Date;
        endsAt: Date | null;
        status: string;
        title: string | null;
        location: string | null;
        serviceNameSnapshot: string | null;
        durationMinutes: number | null;
        providerFirstName: string | null;
        providerLastName: string | null;
      }>
    >`
      SELECT
        a.id,
        a."startsAt",
        a."endsAt",
        a.status,
        a.title,
        a.location,
        a."serviceNameSnapshot",
        a."durationMinutes",
        p."firstName" as "providerFirstName",
        p."lastName"  as "providerLastName"
      FROM aplus_sched."Appointment" a
      JOIN aplus_sched."Client" c ON c.id = a."clientId"
      LEFT JOIN aplus_sched."Provider" p ON p.id = a."providerId"
      WHERE LOWER(TRIM(c."fullName")) = LOWER(TRIM(${client.name}))
      ORDER BY a."startsAt" DESC
      LIMIT 50
    `;

    const appointments: ScheduleAppointment[] = rows.map((r) => ({
      id: r.id,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt ? r.endsAt.toISOString() : null,
      status: r.status,
      title: r.title,
      location: r.location,
      serviceName: r.serviceNameSnapshot,
      providerName:
        r.providerFirstName || r.providerLastName
          ? `${r.providerFirstName ?? ""} ${r.providerLastName ?? ""}`.trim()
          : null,
      durationMinutes: r.durationMinutes,
    }));

    return NextResponse.json({ appointments, configured: true });
  } catch (err) {
    console.error("GET /api/clients/[clientId]/schedule error:", err);
    return NextResponse.json(
      { error: "Failed to load schedule", appointments: [], configured: true },
      { status: 500 }
    );
  }
}
