import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";

const SINGLETON_ID = "singleton";

/**
 * Branding-only view of OrganizationSettings. The email-integration columns
 * (SMTP host/user/sender + the encrypted app password) are intentionally
 * excluded so this endpoint — readable by BCBA via
 * `organization_settings.view` — never leaks email credentials. Email settings
 * are served/managed only by the ADMIN-only `/email-settings` routes.
 */
function toBrandingResponse(row: {
  id: string;
  orgName: string;
  orgAddress: string | null;
  orgPhone: string | null;
  orgEmail: string | null;
  logoUrl: string | null;
  letterheadHtml: string | null;
  footerHtml: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    orgName: row.orgName,
    orgAddress: row.orgAddress,
    orgPhone: row.orgPhone,
    orgEmail: row.orgEmail,
    logoUrl: row.logoUrl,
    letterheadHtml: row.letterheadHtml,
    footerHtml: row.footerHtml,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** GET /smart-steps/api/organization/settings — returns org settings, creating defaults if needed */
export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.organization_settings.view");
  if (denied) return denied;

  try {
    const settings = await prisma.organizationSettings.upsert({
      where:  { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, orgName: "A+ Center" },
      update: {},
    });
    return NextResponse.json(toBrandingResponse(settings));
  } catch (err) {
    console.error("[org-settings GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/** PATCH /smart-steps/api/organization/settings — update org settings (ADMIN / BCBA only) */
export async function PATCH(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.organization_settings.edit");
  if (denied) return denied;

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
    return NextResponse.json(toBrandingResponse(settings));
  } catch (err) {
    console.error("[org-settings PATCH]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
