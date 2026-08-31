import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { canForClient, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { sanitizeHtml, formatDate } from "@/lib/sanitizeHtml";
import { detectSectionType, type ReportBcba, type ServicePeriod, type AssessmentType } from "@/lib/reportGenerationUtils";
import { loadClientGenerationData, buildSectionContentForTitle } from "@/lib/reportSectionGeneration";

/** Reads a fact value out of the provider-info section's label/value table.
 *  Returns undefined for missing values and "[...]" editable placeholders. */
function factFromHtml(html: string, label: string): string | undefined {
  const re = new RegExp(
    `<td><strong>${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</strong></td><td>(.*?)</td>`,
    "i",
  );
  const raw = re.exec(html)?.[1];
  if (!raw) return undefined;
  const text = raw.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
  if (!text || text.startsWith("[")) return undefined;
  return text;
}

/**
 * POST /api/client-reports/[reportId]/regenerate
 *
 * "Update this assessment from client data": rebuilds every auto-generated
 * section of an EXISTING report from the client's current info, goals and
 * trial data — so a change in the client file (or new goals/data entered by
 * a BT) can be pulled into an already-generated assessment on demand.
 *
 * - Only sections whose title maps to a builder are replaced. Passthrough
 *   sections (free-written by the BCBA) are never touched.
 * - Manual edits inside a BUILDER section are overwritten — the UI warns and
 *   confirms before calling this.
 * - The BCBA/provider identity and service period are recovered from the
 *   report's own provider-info fact table, so regeneration keeps the same
 *   provider block without asking again.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.reports.edit");
  if (denied) return denied;
  const { reportId } = await params;

  const report = await prisma.clientReport.findUnique({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" } },
      template: { select: { id: true, name: true } },
    },
  });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = await canForClient(user.id, report.clientId, "smartsteps.reports.view");
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const generationData = await loadClientGenerationData(report.clientId);
  if (!generationData) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Recover provider + service period from the report's provider-info section
  const providerSection = report.sections.find(
    (s) => detectSectionType(s.title).kind === "provider_info",
  );
  const html = providerSection?.content ?? "";
  const provider: ReportBcba = {
    name:        factFromHtml(html, "BCBA Name")        ?? "[BCBA Name]",
    email:       factFromHtml(html, "BCBA Email")       ?? "[BCBA Email]",
    phone:       factFromHtml(html, "BCBA Phone")       ?? null,
    credentials: factFromHtml(html, "BCBA Credentials") ?? null,
    role: "BCBA",
  };
  const servicePeriod: ServicePeriod = {
    start: factFromHtml(html, "Service Period Start"),
    end:   factFromHtml(html, "Service Period End"),
  };
  const assessmentType: AssessmentType =
    /initial/i.test(report.template?.name ?? "") || /initial/i.test(report.title)
      ? "initial"
      : "reassessment";

  const generationDate = formatDate(new Date());
  const updates: { id: string; content: string }[] = [];
  for (const s of report.sections) {
    const generated = buildSectionContentForTitle(s.title, {
      ...generationData,
      provider,
      servicePeriod,
      assessmentType,
      generationDate,
    });
    if (generated === null) continue; // passthrough — BCBA-authored, never touched
    updates.push({ id: s.id, content: sanitizeHtml(generated) });
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.clientReportSection.update({ where: { id: u.id }, data: { content: u.content } }),
    ),
  );

  const refreshed = await prisma.clientReport.findUnique({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" } },
      client:   { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ ...refreshed, regeneratedSections: updates.length });
}
