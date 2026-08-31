import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { replacePlaceholders, replaceBracketPlaceholders, sanitizeHtml, formatDate } from "@/lib/sanitizeHtml";
import {
  detectSectionType,
  computeAge,
  firstNameOnly,
  type ReportBcba,
  type ServicePeriod,
} from "@/lib/reportGenerationUtils";
import {
  loadClientGenerationData,
  buildSectionContentForTitle,
} from "@/lib/reportSectionGeneration";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { templateId } = await params;

  const body = await req.json() as {
    clientId?: string;
    title?: string;
    servicePeriodStart?: string;
    servicePeriodEnd?: string;
    assessmentType?: "initial" | "reassessment";
    bcbaUserId?: string;
    /** Manual provider entry — used when no system user is selected */
    bcbaManualName?: string;
    bcbaManualEmail?: string;
    bcbaManualCredentials?: string;
  };
  const {
    clientId,
    title,
    servicePeriodStart,
    servicePeriodEnd,
    assessmentType = "reassessment",
    bcbaUserId,
    bcbaManualName,
    bcbaManualEmail,
    bcbaManualCredentials,
  } = body;
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  const createDenied = await requirePermissionResponse(user.id, "smartsteps.reports.create");
  if (createDenied) return createDenied;
  const denied = await requireClientAccessResponse(user.id, clientId, "smartsteps.reports.view");
  if (denied) return denied;

  // Parallel fetch: template + generation data (client, programs, goals, trials) + optional BCBA user
  const [template, generationData, bcbaUser] = await Promise.all([
    prisma.reportTemplate.findUnique({
      where: { id: templateId },
      include: { sections: { orderBy: { order: "asc" } } },
    }),
    loadClientGenerationData(clientId),
    bcbaUserId
      ? prisma.user.findUnique({
          where: { id: bcbaUserId },
          select: { id: true, name: true, email: true, role: true, phone: true, credentials: true },
        })
      : Promise.resolve(null),
  ]);

  if (!template)       return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!generationData) return NextResponse.json({ error: "Client not found" },   { status: 404 });
  const { client } = generationData;

  // ── BCBA / provider info ───────────────────────────────────────────────────
  // Priority: selected system user → manual entry → placeholders.
  // Deliberately do NOT fall back to the session (logged-in) user.
  let providerName: string;
  let providerEmail: string;
  let providerRole: string;
  let providerPhone: string | null = null;
  let providerCredentials: string | null = null;

  if (bcbaUser) {
    providerName        = bcbaUser.name ?? bcbaUser.email ?? "";
    providerEmail       = bcbaUser.email ?? "";
    providerRole        = bcbaUser.role ?? "BCBA";
    providerPhone       = bcbaUser.phone ?? null;
    providerCredentials = bcbaUser.credentials ?? null;
  } else if (bcbaManualName?.trim()) {
    // Manual provider entry — external BCBA, contractor, or non-system clinician
    providerName        = bcbaManualName.trim();
    providerEmail       = bcbaManualEmail?.trim() ?? "";
    providerRole        = "BCBA";
    providerCredentials = bcbaManualCredentials?.trim() ?? null;
    providerPhone       = null;
  } else {
    // No BCBA selected or entered — use placeholders; do NOT use session user
    providerName  = "[BCBA Name]";
    providerEmail = "[BCBA Email]";
    providerRole  = "BCBA";
  }

  const generationDate = formatDate(new Date());
  const age            = computeAge(client.dob);

  // ── Placeholder map ({{key}} and (bracket) forms) ─────────────────────────
  // Rule: if data exists, use actual value; if missing, use a clean editable
  // placeholder (truthy string) so replacePlaceholders() replaces instead of
  // leaving the raw {{key}} token in the generated text.
  const values: Record<string, string> = {
    // Narrative prose uses the FIRST name only (approved layout rule) — every
    // (Name)/{{client_name}} token in passthrough template text resolves to it.
    // The full legal name appears only in the provider-info fact table.
    client_name:                 firstNameOnly(client.name),
    client_full_name:            client.name,
    dob:                         formatDate(client.dob),
    address:                     client.address                || "[Client Address]",
    assessment_date:             generationDate,
    provider_name:               providerName,
    bcba_name:                   providerName,                   // alias
    age:                         String(age),
    diagnosis:                   client.diagnosis.join(", ")   || "[Diagnosis]",
    insurance_id:                client.insuranceId            || "[Insurance ID]",
    // guardian_* placeholders intentionally absent — guardian contact info
    // must not appear in generated assessments (removed 2026-08-31)
    school:                      client.school                 || "[School / Program]",
    intake_notes:                client.intakeNotes            || "[Intake notes]",
    // biopsychosocial / biophysical — map to intakeNotes if present, else editable placeholder
    biopsychosocial_information: client.intakeNotes            || "[Biopsychosocial information — edit here]",
    biophysical_information:                                      "[Biophysical information — edit here]",
    provider_email:              providerEmail                 || "[BCBA Email]",
    bcba_email:                  providerEmail                 || "[BCBA Email]",   // alias
    provider_role:               providerRole,
    provider_phone:              providerPhone                 || "[BCBA Phone]",
    bcba_phone:                  providerPhone                 || "[BCBA Phone]",   // alias
    provider_credentials:        providerCredentials           || "[BCBA Credentials]",
    bcba_credentials:            providerCredentials           || "[BCBA Credentials]", // alias
    service_period_start:        servicePeriodStart            || "[Service Period Start]",
    service_period_end:          servicePeriodEnd              || "[Service Period End]",
  };

  const provider: ReportBcba = {
    name: providerName, email: providerEmail, role: providerRole,
    phone: providerPhone, credentials: providerCredentials,
  };
  const servicePeriod: ServicePeriod = { start: servicePeriodStart, end: servicePeriodEnd };

  const buildSectionContent = (title: string): string | null =>
    buildSectionContentForTitle(title, {
      ...generationData,
      provider,
      servicePeriod,
      assessmentType,
      generationDate,
    });

  const reportSections = template.sections.map((s) => {
    const generatedHtml = buildSectionContent(s.title);

    let finalContent: string;
    if (generatedHtml !== null) {
      // REPLACE: discard template instructional text, use generated content
      finalContent = sanitizeHtml(generatedHtml);
    } else {
      // PASSTHROUGH: apply {{key}} and (bracket) placeholder substitution on template content
      const base = s.content ?? "";
      const withCurly   = replacePlaceholders(base, values);
      const withBracket = replaceBracketPlaceholders(withCurly, values);
      finalContent = sanitizeHtml(withBracket);
    }

    return { title: s.title, order: s.order, content: finalContent };
  });

  // ── Ensure standard sections missing from older templates are appended ─────
  const detectedKinds = new Set(template.sections.map((s) => detectSectionType(s.title).kind));
  const STANDARD_APPEND: { title: string; kind: ReturnType<typeof detectSectionType>["kind"] }[] = [
    { title: "Attachment A: Behavior Intervention Plan", kind: "behavior_plan" },
  ];
  let nextOrder = reportSections.length;
  for (const std of STANDARD_APPEND) {
    if (detectedKinds.has(std.kind)) continue;
    const html = buildSectionContent(std.title);
    if (html !== null) {
      reportSections.push({ title: std.title, order: nextOrder++, content: sanitizeHtml(html) });
    }
  }

  const report = await prisma.clientReport.create({
    data: {
      clientId,
      templateId: template.id,
      title: title?.trim() || template.name,
      status: "DRAFT",
      sections: { create: reportSections },
    },
    include: {
      sections: { orderBy: { order: "asc" } },
      client:   { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(report, { status: 201 });
}
