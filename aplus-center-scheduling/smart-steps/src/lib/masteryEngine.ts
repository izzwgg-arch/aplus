/**
 * Mastery Engine — Smart Steps ABA Tracker
 * Evaluates trial data against mastery criteria and determines phase transitions.
 * Runs server-side (Node.js) — safe to import in API routes.
 */

export type TrialResult = "CORRECT" | "INCORRECT" | "PROMPTED" | "NR" | "SKIP";
export type Phase = "BASELINE" | "ACQUISITION" | "FLUENCY" | "MAINTENANCE" | "GENERALIZATION" | "MASTERED";

export interface MasteryRule {
  /** Minimum % correct to consider "passing" a session (0–100) */
  thresholdPct: number;
  /** Number of consecutive sessions that must meet threshold */
  consecutiveSessions: number;
  /** Minimum trials per session to count */
  minTrialsPerSession: number;
  /** Require independent (no prompt) responses */
  promptFadeRequired: boolean;
  /** Optional: absolute number of consecutive correct responses */
  consecutiveCorrect?: number;
}

export interface SessionSummary {
  sessionId: string;
  date: Date;
  trials: { result: TrialResult; promptLevel?: string }[];
}

export interface MasteryEvaluation {
  isMastered: boolean;
  currentPhaseSuggestion: Phase;
  pctCorrect: number;
  consecutivePassingSessions: number;
  totalTrials: number;
  message: string;
}

const DEFAULT_RULE: MasteryRule = {
  thresholdPct: 80,
  consecutiveSessions: 3,
  minTrialsPerSession: 3,
  promptFadeRequired: false,
};

export function evaluateMastery(
  sessions: SessionSummary[],
  rule: Partial<MasteryRule> = {}
): MasteryEvaluation {
  const r: MasteryRule = { ...DEFAULT_RULE, ...rule };

  // Sort sessions newest-first
  const sorted = [...sessions].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalTrials = sorted.reduce((acc, s) => acc + s.trials.length, 0);
  const totalCorrect = sorted.reduce(
    (acc, s) => acc + s.trials.filter((t) => t.result === "CORRECT").length,
    0
  );
  const pctCorrect = totalTrials > 0 ? Math.round((totalCorrect / totalTrials) * 100) : 0;

  // Count consecutive sessions meeting threshold
  let consecutivePassingSessions = 0;
  for (const sess of sorted) {
    if (sess.trials.length < r.minTrialsPerSession) break;
    const correct = sess.trials.filter((t) => t.result === "CORRECT").length;
    const independent = sess.trials.filter(
      (t) => t.result === "CORRECT" && (!t.promptLevel || t.promptLevel === "INDEPENDENT")
    ).length;
    const pct = (correct / sess.trials.length) * 100;

    const meetsThreshold = pct >= r.thresholdPct;
    const meetsPrompt = r.promptFadeRequired ? independent / sess.trials.length >= r.thresholdPct / 100 : true;

    if (meetsThreshold && meetsPrompt) {
      consecutivePassingSessions++;
    } else {
      break;
    }
  }

  // Check consecutive correct responses rule
  if (r.consecutiveCorrect) {
    const allTrials = sorted.flatMap((s) => s.trials);
    let streak = 0;
    let maxStreak = 0;
    for (const t of allTrials) {
      if (t.result === "CORRECT") {
        streak++;
        maxStreak = Math.max(maxStreak, streak);
      } else {
        streak = 0;
      }
    }
    if (maxStreak >= r.consecutiveCorrect) {
      return {
        isMastered: true,
        currentPhaseSuggestion: "MASTERED",
        pctCorrect,
        consecutivePassingSessions,
        totalTrials,
        message: `Mastered: ${maxStreak} consecutive correct responses met criteria.`,
      };
    }
  }

  const isMastered = consecutivePassingSessions >= r.consecutiveSessions;

  // Phase suggestion based on performance trend
  let currentPhaseSuggestion: Phase = "ACQUISITION";
  if (isMastered) {
    currentPhaseSuggestion = "MASTERED";
  } else if (consecutivePassingSessions >= 1 && pctCorrect >= 60) {
    currentPhaseSuggestion = "FLUENCY";
  } else if (pctCorrect < 30 && totalTrials >= 10) {
    currentPhaseSuggestion = "BASELINE";
  }

  const message = isMastered
    ? `Mastered: ${consecutivePassingSessions}/${r.consecutiveSessions} sessions at ${pctCorrect}%`
    : `In progress: ${consecutivePassingSessions}/${r.consecutiveSessions} passing sessions (${pctCorrect}% correct)`;

  return { isMastered, currentPhaseSuggestion, pctCorrect, consecutivePassingSessions, totalTrials, message };
}

/** Determine the next phase after mastery */
export function nextPhase(currentPhase: Phase): Phase {
  const order: Phase[] = ["BASELINE", "ACQUISITION", "FLUENCY", "MAINTENANCE", "GENERALIZATION", "MASTERED"];
  const idx = order.indexOf(currentPhase);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : "MASTERED";
}

/** Quick check: is a target on a plateau (no improvement in N sessions)? */
export function isOnPlateau(sessions: SessionSummary[], stagnantSessions = 5): boolean {
  if (sessions.length < stagnantSessions) return false;
  const recent = [...sessions]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, stagnantSessions);
  const pcts = recent.map((s) => {
    if (s.trials.length === 0) return 0;
    return (s.trials.filter((t) => t.result === "CORRECT").length / s.trials.length) * 100;
  });
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  const max = Math.max(...pcts);
  const min = Math.min(...pcts);
  // Plateau: average <80%, range <10% over recent sessions
  return avg < 80 && max - min < 10;
}
