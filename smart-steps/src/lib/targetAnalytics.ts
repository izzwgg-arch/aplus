"use client";

export const LOW_TRIAL_COUNT_THRESHOLD = 3;

export type TargetStatus = "active" | "mastered" | "closed";

export interface TargetAnalyticsTrial {
  id: string;
  targetId: string;
  goalId?: string | null;
  parentGoalId?: string | null;
  subGoalId?: string | null;
  clientId?: string | null;
  sessionId?: string | null;
  providerId?: string | null;
  timestamp: string;
  date: string;
  sessionKind?: string | null;
  promptCode?: string | null;
  promptLevel?: string | null;
  result: string;
  percentage: number;
  notes?: string | null;
  ioaPercentage?: number | null;
  isMaintenance?: boolean;
  createdAt: string;
  updatedAt?: string;
  latencyMs?: number | null;
  session?: {
    id?: string | null;
    mode?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    notes?: string | null;
    voiceNotes?: string | null;
    user?: { id?: string | null; name?: string | null; email?: string | null } | null;
  } | null;
  provider?: { id?: string | null; name?: string | null; email?: string | null } | null;
}

export interface TargetAnalyticsAnnotation {
  id: string;
  targetId?: string;
  clientId?: string | null;
  note: string;
  annotatedAt: string;
  isVisible: boolean;
  user?: { id?: string | null; name?: string | null } | null;
}

export interface TargetAnalyticsResponse {
  id: string;
  clientId?: string | null;
  definition: string;
  targetType: string;
  phase: string;
  isActive: boolean;
  inMaintenance?: boolean;
  inGeneralization?: boolean;
  dateMastered?: string | null;
  createdAt: string;
  updatedAt: string;
  parentGoal?: { id: string; title: string; domain?: string | null; status?: string | null; clientId?: string | null } | null;
  subGoal?: { id: string; title: string; status?: string | null } | null;
  program?: { id: string; name: string; domain?: string | null; clientId?: string | null } | null;
  trials: TargetAnalyticsTrial[];
  annotations?: TargetAnalyticsAnnotation[];
}

export interface ChartPoint {
  key: string;
  date: string;
  sessionLabel: string;
  correct: number;
  total: number;
  pct: number;
  byPrompt: Record<string, number>;
  amCount: number;
  pmCount: number;
  amPct: number;
  pmPct: number;
  averageIoa: number | null;
  uniqueTherapists: number;
  therapistNames: string[];
  notesCount: number;
  firstTimestamp: string;
  ma25?: number;
  trend?: number;
  sdUpper?: number;
  sdLower?: number;
}

export function normalizeResult(result: string) {
  return result === "NO_RESPONSE" ? "NR" : result;
}

export function trialPercentage(result: string) {
  const normalized = normalizeResult(result);
  if (normalized === "CORRECT" || normalized === "INDEPENDENT") return 100;
  if (normalized === "PROMPTED") return 50;
  return 0;
}

export function resolveTargetStatus(target: Pick<TargetAnalyticsResponse, "phase" | "isActive">): TargetStatus {
  if (target.isActive === false) return "closed";
  if (target.phase === "MASTERED") return "mastered";
  // NEW and in-treatment phases are both non-closed, non-mastered for analytics.
  return "active";
}

export function computeTrend(points: ChartPoint[]) {
  if (points.length < 2) return points;
  const n = points.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = points.reduce((sum, point) => sum + point.pct, 0);
  const sumXY = points.reduce((sum, point, index) => sum + index * point.pct, 0);
  const sumX2 = points.reduce((sum, _, index) => sum + index * index, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  return points.map((point, index) => ({
    ...point,
    trend: Math.round(Math.min(100, Math.max(0, intercept + slope * index))),
  }));
}

export function applyMovingAverage(points: ChartPoint[], window: number) {
  if (window <= 1) return points;
  return points.map((point, index) => {
    const slice = points.slice(Math.max(0, index - window + 1), index + 1);
    return {
      ...point,
      ma25: Math.round(slice.reduce((sum, row) => sum + row.pct, 0) / slice.length),
    };
  });
}

export function applyStandardDeviation(points: ChartPoint[]) {
  if (points.length < 3) return points;
  const mean = points.reduce((sum, point) => sum + point.pct, 0) / points.length;
  const sd = Math.sqrt(points.reduce((sum, point) => sum + (point.pct - mean) ** 2, 0) / points.length);
  return points.map((point) => ({
    ...point,
    sdUpper: Math.min(100, Math.round(mean + sd)),
    sdLower: Math.max(0, Math.round(mean - sd)),
  }));
}

export function buildChartPoints(
  trials: TargetAnalyticsTrial[],
  options: {
    groupByDate: boolean;
    plotFirstTrialOnly: boolean;
    excludeLowTrialCounts: boolean;
  }
) {
  const grouped = new Map<string, TargetAnalyticsTrial[]>();

  for (const trial of trials) {
    const groupKey = options.groupByDate ? trial.date : trial.sessionId || trial.id;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey)!.push(trial);
  }

  let points = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows], index) => {
      const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const filteredRows = options.plotFirstTrialOnly ? ordered.slice(0, 1) : ordered;
      const correct = filteredRows.filter((row) => {
        const normalized = normalizeResult(row.result);
        return normalized === "CORRECT" || normalized === "INDEPENDENT";
      }).length;
      const total = filteredRows.length;
      const promptCounts = filteredRows.reduce<Record<string, number>>((acc, row) => {
        const promptCode = row.promptCode || "INDEPENDENT";
        acc[promptCode] = (acc[promptCode] ?? 0) + 1;
        return acc;
      }, {});
      const amRows = filteredRows.filter((row) => new Date(row.createdAt).getHours() < 12);
      const pmRows = filteredRows.filter((row) => new Date(row.createdAt).getHours() >= 12);
      const amCorrect = amRows.filter((row) => {
        const normalized = normalizeResult(row.result);
        return normalized === "CORRECT" || normalized === "INDEPENDENT";
      }).length;
      const pmCorrect = pmRows.filter((row) => {
        const normalized = normalizeResult(row.result);
        return normalized === "CORRECT" || normalized === "INDEPENDENT";
      }).length;
      const ioaRows = filteredRows.filter((row) => row.ioaPercentage != null);
      const therapistNames = Array.from(new Set(filteredRows.map((row) => row.provider?.name || row.session?.user?.name).filter(Boolean))) as string[];
      return {
        key,
        date: filteredRows[0]?.date ?? key,
        sessionLabel: options.groupByDate ? (filteredRows[0]?.date ?? key) : `Session ${index + 1}`,
        correct,
        total,
        pct: total ? Math.round((correct / total) * 100) : 0,
        byPrompt: promptCounts,
        amCount: amRows.length,
        pmCount: pmRows.length,
        amPct: amRows.length ? Math.round((amCorrect / amRows.length) * 100) : 0,
        pmPct: pmRows.length ? Math.round((pmCorrect / pmRows.length) * 100) : 0,
        averageIoa: ioaRows.length ? Math.round(ioaRows.reduce((sum, row) => sum + Number(row.ioaPercentage || 0), 0) / ioaRows.length) : null,
        uniqueTherapists: therapistNames.length,
        therapistNames,
        notesCount: filteredRows.filter((row) => row.notes?.trim()).length,
        firstTimestamp: filteredRows[0]?.createdAt ?? new Date().toISOString(),
      } satisfies ChartPoint;
    });

  if (options.excludeLowTrialCounts) {
    points = points.filter((point) => point.total >= LOW_TRIAL_COUNT_THRESHOLD);
  }

  return points;
}

export function mergeComparisonPoints(series: Array<{ id: string; title: string; data: ChartPoint[] }>) {
  const merged = new Map<string, { correct: number; total: number; date: string; byPrompt: Record<string, number> }>();
  for (const item of series) {
    for (const point of item.data) {
      const current = merged.get(point.date) ?? { correct: 0, total: 0, date: point.date, byPrompt: {} };
      current.correct += point.correct;
      current.total += point.total;
      for (const [prompt, count] of Object.entries(point.byPrompt)) {
        current.byPrompt[prompt] = (current.byPrompt[prompt] ?? 0) + count;
      }
      merged.set(point.date, current);
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point, index) => ({
      key: point.date,
      date: point.date,
      sessionLabel: `Merged ${index + 1}`,
      correct: point.correct,
      total: point.total,
      pct: point.total ? Math.round((point.correct / point.total) * 100) : 0,
      byPrompt: point.byPrompt,
      amCount: 0,
      pmCount: 0,
      amPct: 0,
      pmPct: 0,
      averageIoa: null,
      uniqueTherapists: 0,
      therapistNames: [],
      notesCount: 0,
      firstTimestamp: point.date,
    } satisfies ChartPoint));
}
