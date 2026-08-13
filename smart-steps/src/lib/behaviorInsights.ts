/**
 * Behavior Insights Engine — Smart Steps ABA Tracker
 * Detects patterns in trial/behavior data and surfaces AI-style nudges.
 * Pure TypeScript — no external AI API needed for these heuristics.
 */

export interface TargetSummary {
  targetId: string;
  targetName: string;
  phase: string;
  sessions: {
    date: Date;
    trials: { result: string; promptLevel?: string }[];
  }[];
}

export type InsightSeverity = "info" | "warning" | "critical";
export type InsightType =
  | "plateau"
  | "prompt_dependency"
  | "behavior_spike"
  | "mastery_ready"
  | "low_data"
  | "strong_progress"
  | "regression";

export interface Insight {
  type: InsightType;
  severity: InsightSeverity;
  targetId?: string;
  targetName?: string;
  title: string;
  description: string;
  recommendation: string;
  icon: string;
}

export function generateInsights(targets: TargetSummary[]): Insight[] {
  const insights: Insight[] = [];

  for (const target of targets) {
    const sessions = [...target.sessions].sort((a, b) => b.date.getTime() - a.date.getTime());
    if (sessions.length === 0) continue;

    const allTrials = sessions.flatMap((s) => s.trials);
    const totalTrials = allTrials.length;
    if (totalTrials === 0) continue;

    // Calculate per-session pct correct
    const sessionPcts = sessions.map((s) => {
      if (s.trials.length === 0) return 0;
      return (s.trials.filter((t) => t.result === "CORRECT").length / s.trials.length) * 100;
    });

    const recentPct = sessionPcts[0] ?? 0;
    const olderPct = sessionPcts.slice(1, 4).reduce((a, b) => a + b, 0) / Math.max(sessionPcts.slice(1, 4).length, 1);

    // Mastery ready: 3+ sessions ≥80%
    const passingCount = sessionPcts.slice(0, 3).filter((p) => p >= 80).length;
    if (passingCount >= 3 && target.phase !== "MASTERED") {
      insights.push({
        type: "mastery_ready",
        severity: "info",
        targetId: target.targetId,
        targetName: target.targetName,
        title: `${target.targetName} is mastery-ready`,
        description: `3 consecutive sessions at ≥80% correct.`,
        recommendation: "Consider advancing to maintenance phase.",
        icon: "🏆",
      });
    }

    // Plateau: recent 5 sessions <80% with <10% variance
    if (sessions.length >= 5) {
      const recent5 = sessionPcts.slice(0, 5);
      const avg = recent5.reduce((a, b) => a + b, 0) / 5;
      const range = Math.max(...recent5) - Math.min(...recent5);
      if (avg < 80 && range < 15 && target.phase !== "MASTERED") {
        insights.push({
          type: "plateau",
          severity: "warning",
          targetId: target.targetId,
          targetName: target.targetName,
          title: `Plateau detected: ${target.targetName}`,
          description: `Average ${Math.round(avg)}% across last 5 sessions with minimal variance.`,
          recommendation: "Consider modifying teaching procedures, reinforcement schedule, or stimulus materials.",
          icon: "📊",
        });
      }
    }

    // Regression: recent pct significantly lower than older sessions
    if (sessions.length >= 4 && olderPct - recentPct > 20) {
      insights.push({
        type: "regression",
        severity: "warning",
        targetId: target.targetId,
        targetName: target.targetName,
        title: `Regression on ${target.targetName}`,
        description: `Performance dropped from ${Math.round(olderPct)}% to ${Math.round(recentPct)}%.`,
        recommendation: "Review recent session notes, check for setting/instructor variability.",
        icon: "📉",
      });
    }

    // Prompt dependency: high proportion of prompted responses
    const promptedCount = allTrials.filter((t) => t.result === "PROMPTED").length;
    const promptRatio = promptedCount / totalTrials;
    if (promptRatio > 0.4 && totalTrials >= 10) {
      insights.push({
        type: "prompt_dependency",
        severity: "warning",
        targetId: target.targetId,
        targetName: target.targetName,
        title: `Prompt dependency risk: ${target.targetName}`,
        description: `${Math.round(promptRatio * 100)}% of responses are prompted.`,
        recommendation: "Consider a more aggressive prompt fading strategy or errorless teaching adjustment.",
        icon: "👆",
      });
    }

    // Strong progress
    if (recentPct >= 90 && recentPct - olderPct >= 15) {
      insights.push({
        type: "strong_progress",
        severity: "info",
        targetId: target.targetId,
        targetName: target.targetName,
        title: `Strong progress: ${target.targetName}`,
        description: `Recent session at ${Math.round(recentPct)}% — up ${Math.round(recentPct - olderPct)}% from baseline.`,
        recommendation: "Excellent! Verify generalization across environments.",
        icon: "🚀",
      });
    }

    // Low data warning
    if (totalTrials < 5) {
      insights.push({
        type: "low_data",
        severity: "info",
        targetId: target.targetId,
        targetName: target.targetName,
        title: `Insufficient data: ${target.targetName}`,
        description: "Less than 5 trials recorded.",
        recommendation: "Run at least 5–10 trials before drawing conclusions.",
        icon: "⚠️",
      });
    }
  }

  // Sort by severity: critical → warning → info
  const order: InsightSeverity[] = ["critical", "warning", "info"];
  return insights.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

/** Detect behavior spike: behavior count significantly above rolling average */
export function detectBehaviorSpike(
  behaviorCounts: { date: Date; count: number }[],
  zScoreThreshold = 1.5
): { spikeDate: Date; count: number; avgCount: number } | null {
  if (behaviorCounts.length < 3) return null;
  const counts = behaviorCounts.map((b) => b.count);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - avg) ** 2, 0) / counts.length;
  const stdDev = Math.sqrt(variance);
  const latest = behaviorCounts[behaviorCounts.length - 1];
  if (!latest) return null;
  const zScore = stdDev > 0 ? (latest.count - avg) / stdDev : 0;
  return zScore > zScoreThreshold ? { spikeDate: latest.date, count: latest.count, avgCount: Math.round(avg) } : null;
}
