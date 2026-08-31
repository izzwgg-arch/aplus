/**
 * Shared core for generating client-report section content.
 * Used by BOTH report-generation routes:
 *   - POST /api/report-templates/[templateId]/generate-report  (new report)
 *   - POST /api/client-reports/[reportId]/regenerate           (refresh existing)
 * One switch, one data loader — the two routes can never drift apart.
 * Server-side only.
 */

import { prisma } from "./db";
import { formatDate } from "./sanitizeHtml";
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
  type ReportClient,
  type ReportBcba,
  type ServicePeriod,
  type AssessmentType,
  type TrialStats,
  type ReportProgram,
  type ReportParentGoal,
} from "./reportGenerationUtils";

export interface ClientGenerationData {
  client: ReportClient;
  programs: ReportProgram[];
  parentGoals: ReportParentGoal[];
  trialStats: Map<string, TrialStats>;
}

/** Loads everything the builders need for one client. Returns null when the
 *  client does not exist. Mastered targets are bounded to the last 6 months,
 *  trial stats to the last 30 days / 500 trials (performance safety). */
export async function loadClientGenerationData(clientId: string): Promise<ClientGenerationData | null> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [client, programs, parentGoals] = await Promise.all([
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
  ]);

  if (!client) return null;

  const allTargetIds = parentGoals.flatMap((g) => g.targets.map((t) => t.id));
  const trialStats = new Map<string, TrialStats>();

  if (allTargetIds.length > 0) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentTrials = await prisma.trial.findMany({
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

  return { client, programs, parentGoals, trialStats };
}

export interface SectionGenerationContext extends ClientGenerationData {
  provider: ReportBcba;
  servicePeriod: ServicePeriod;
  assessmentType: AssessmentType;
  /** Formatted display date; defaults to today when omitted. */
  generationDate?: string;
}

/**
 * Maps a section title to freshly generated HTML, or null for passthrough
 * sections (whose content is authored in the template / by the BCBA).
 * Output is UNSANITIZED — callers must run sanitizeHtml() before storing.
 */
export function buildSectionContentForTitle(
  title: string,
  ctx: SectionGenerationContext,
): string | null {
  const { client, programs, parentGoals, trialStats, provider, servicePeriod, assessmentType } = ctx;
  const generationDate = ctx.generationDate ?? formatDate(new Date());
  const sectionType = detectSectionType(title);

  switch (sectionType.kind) {
    case "provider_info":
      return buildProviderInfoHtml(client, provider, servicePeriod, generationDate);
    case "biopsychosocial":
      return buildBiopsychosocialHtml(client, generationDate, assessmentType);
    case "why_aba":
      return buildWhyAbaHtml(client, generationDate);
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
        assessmentType, client.name, servicePeriod.end,
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
      return buildScheduleHtml(servicePeriod.start);
    case "summary_contact":
      return buildSummaryContactHtml(provider, generationDate);
    case "behavior_plan":
      return buildBehaviorPlanHtml(parentGoals, programs, client.name);
    default:
      return null; // passthrough
  }
}
