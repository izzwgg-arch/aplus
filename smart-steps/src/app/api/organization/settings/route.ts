import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const SINGLETON_ID = "singleton";

/** GET /smart-steps/api/organization/settings — returns org settings, creating defaults if needed */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const settings = await prisma.organizationSettings.upsert({
      where:  { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, orgName: "A+ Center" },
      update: {},
    });
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[org-settings GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/** PATCH /smart-steps/api/organization/settings — update org settings (ADMIN / BCBA only) */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "BCBA") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json() as {
      orgName?: string;
      orgAddress?: string;
      orgPhone?: string;
      orgEmail?: string;
      logoUrl?: string;
      letterheadHtml?: string;
      footerHtml?: string;
    };

    const settings = await prisma.organizationSettings.upsert({
      where:  { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, orgName: "A+ Center", ...body },
      update: { ...body, updatedAt: new Date() },
    });
    return NextResponse.json(settings);
  } catch (err) {
    console.error("[org-settings PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
