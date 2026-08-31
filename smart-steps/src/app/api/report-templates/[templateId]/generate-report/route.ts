import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requireClientAccessResponse, requirePermissionResponse } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { replacePlaceholders, replaceBracketPlaceholders, sanitizeHtml, formatDate } from "@/lib/sanitizeHtml";
import {
  detectSectionType,
  buildProviderInfoHtml,
  buildBiopsychosocialHtml,
  buildWhyAbaHtml,
  buildCategoryGoalsHtml,
  buildMasteredGoalsHtml,
  buildCurrentGoalsHtml,
  buildParentGoalsHtml,
  buildNewGoalsHtml,
  buildCoordinationHtml,
  buildTeamTrainingHtml,
  buildCrisisPlanHtml,
  buildTransitionPlanHtml,
  buildDischargeCriteriaHtml,
  buildServiceRecommendationsHtml,
  buildScheduleHtml,
  buildSummaryContactHtml,
  buildBehaviorPlanHtml,
  computeAge,
  firstNameOnly,
  type ReportClient,
  type ReportBcba,
  type ServicePeriod,
  type TrialStats,
} from "@/lib/reportGenerationUtils";

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

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Parallel fetch: template, client, programs, parent-goals + targets, optional BCBA user
  const [template, client, programs, parentGoals, bcbaUser] = await Promise.all([
    prisma.reportTemplate.findUnique({
      where: { id: templateId },
      include: { sections: { orderBy: { order: "asc" } } },
    }),
    prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true, name: true, dob: true, address: true,
        diagnosis: true, guardianName: true, guardianEmail: true,
        guardianPhone: true, school: true, insuranceId: true, intakeNotes: true,
      },
    }),
    prisma.program.findMany({
      where: { clientId, isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.parentGoal.findMany({
      where: { clientId, status: { not: "ARCHIVED" } },
      include: {
        program: { select: { id: true, name: true, domain: true } },
        targets: {
          where: {
            isActive: true,
            OR: [
              { phase: { in: ["NEW", "ACQUISITION", "BASELINE", "MAINTENANCE", "GENERALIZATION"] } },
              { phase: "MASTERED", dateMastered: { gte: sixMonthsAgo } },
            ],
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true, definition: true, phase: true, targetType: true,
            baseline: true, dateMastered: true, notes: true, createdAt: true,
            masteryRule: true,
          },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    // Fetch selected BCBA or fall back to null (session user used below)
    bcbaUserId
      ? prisma.user.findUnique({
          where: { id: bcbaUserId },
          select: { id: true, name: true, email: true, role: true, phone: true, credentials: true },
        })
      : Promise.resolve(null),
  ]);

  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (!client)   return NextResponse.json({ error: "Client not found" },   { status: 404 });

  // ── Batch trial query for current-level calculation ────────────────────────
  // Bounded to last 30 days, max 500 trials for performance safety.
  const allTargetIds = parentGoals.flatMap((g) => g.targets.map((t) => t.id));
  const trialStats   = new Map<string, TrialStats>();

  if (allTargetIds.length > 0) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentTrials  = await prisma.trial.findMany({
      where: {
        targetId: { in: allTargetIds },
        deletedAt: null,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { targetId: true, result: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    for (const trial of recentTrials) {
      const s = trialStats.get(trial.targetId) ?? { correct: 0, total: 0 };
      s.total++;
      if (["CORRECT", "INDEPENDENT"].includes(trial.result.toUpperCase())) s.correct++;
      trialStats.set(trial.targetId, s);
    }
  }

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

  const reportClient: ReportClient = { ...client };
  const provider: ReportBcba = {
    name: providerName, email: providerEmail, role: providerRole,
    phone: providerPhone, credentials: providerCredentials,
  };
  const servicePeriod: ServicePeriod = { start: servicePeriodStart, end: servicePeriodEnd };

  // ── Build section content (REPLACE behavior — Option B1) ──────────────────
  const buildSectionContent = (title: string): string | null => {
    const sectionType = detectSectionType(title);

    switch (sectionType.kind) {
      case "provider_info":
        return buildProviderInfoHtml(reportClient, provider, servicePeriod, generationDate);
      case "biopsychosocial":
        return buildBiopsychosocialHtml(reportClient, generationDate, assessmentType);
      case "why_aba":
        return buildWhyAbaHtml(reportClient, generationDate);
      case "category_goals":
        return buildCategoryGoalsHtml(
          programs, parentGoals, sectionType.keywords,
          generationDate, trialStats, assessmentType, client.name, sectionType.label,
        );
      case "mastered_goals":
        return buildMasteredGoalsHtml(parentGoals, programs, generationDate, assessmentType, client.name);
      case "current_goals":
        return buildCurrentGoalsHtml(
          parentGoals, programs, generationDate, trialStats,
          assessmentType, client.name, servicePeriodEnd,
        );
      case "parent_goals":
        return buildParentGoalsHtml(parentGoals, programs, generationDate, trialStats, client.name);
      case "new_goals":
        return buildNewGoalsHtml(parentGoals, programs, generationDate, client.name);
      case "coordination":
        return buildCoordinationHtml(client.name);
      case "team_training":
        return buildTeamTrainingHtml(client.name);
      case "crisis_plan":
        return buildCrisisPlanHtml(client.name);
      case "transition_plan":
        return buildTransitionPlanHtml(client.name);
      case "discharge_criteria":
        return buildDischargeCriteriaHtml(client.name);
      case "service_recommendations":
        return buildServiceRecommendationsHtml();
      case "schedule":
        return buildScheduleHtml(servicePeriodStart);
      case "summary_contact":
        return buildSummaryContactHtml(provider, generationDate);
      case "behavior_plan":
        return buildBehaviorPlanHtml(parentGoals, programs, client.name);
      default:
        return null; // passthrough
    }
  };

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
