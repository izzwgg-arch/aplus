/**
 * ABA Store — Zustand + localStorage persist
 *
 * This store is the offline-first safety net. Every write goes here first
 * (optimistic), then to the server API. On page refresh the store rehydrates
 * from localStorage so nothing is ever lost mid-session.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type TargetType =
  | "DISCRETE_TRIAL"
  | "TASK_ANALYSIS_FWD"
  | "TASK_ANALYSIS_BWD"
  | "TASK_ANALYSIS_TOTAL"
  | "DURATION"
  | "LATENCY"
  | "FREQUENCY"
  | "PARTIAL_INTERVAL"
  | "WHOLE_INTERVAL"
  | "MOMENTARY_TIME_SAMPLE"
  | "COLD_PROBE"
  | "OTHER";

export type Phase =
  | "NEW"
  | "BASELINE"
  | "ACQUISITION"
  | "MAINTENANCE"
  | "GENERALIZATION"
  | "MASTERED";

/** Clinician-facing lifecycle mapped to Target.phase */
export type GoalLifecycleKey = "new" | "in_treatment" | "mastered";

export const GOAL_LIFECYCLE_OPTIONS: ReadonlyArray<{
  value: GoalLifecycleKey;
  label: string;
  phase: Phase;
}> = [
  { value: "new", label: "New", phase: "NEW" },
  { value: "in_treatment", label: "In Treatment", phase: "ACQUISITION" },
  { value: "mastered", label: "Mastered", phase: "MASTERED" },
] as const;

export function lifecycleFromPhase(phase: string | null | undefined): GoalLifecycleKey {
  if (phase === "MASTERED") return "mastered";
  if (phase === "NEW") return "new";
  return "in_treatment";
}

export function phaseFromLifecycle(lifecycle: GoalLifecycleKey): Phase {
  return GOAL_LIFECYCLE_OPTIONS.find((o) => o.value === lifecycle)?.phase ?? "ACQUISITION";
}

export function lifecycleDisplayLabel(phase: string | null | undefined): string {
  if (phase === "NEW") return "New";
  if (phase === "MASTERED") return "Mastered";
  if (phase === "ACQUISITION") return "In Treatment";
  if (phase === "BASELINE") return "Baseline";
  if (phase === "MAINTENANCE") return "Maintenance";
  if (phase === "GENERALIZATION") return "Generalization";
  return "In Treatment";
}

export function isNewPhase(phase: string | null | undefined): boolean {
  return phase === "NEW";
}

export function isMasteredPhase(phase: string | null | undefined): boolean {
  return phase === "MASTERED";
}

/** Deterministic sort for any array that has `createdAt` + `id`.
 *  Primary: createdAt ascending (oldest first).
 *  Tiebreaker: id ascending (stable across all computers). */
export function sortByCreatedAt<T extends { createdAt: string; id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ta = a.createdAt ?? "";
    const tb = b.createdAt ?? "";
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Palette shared by every category color assignment across all computers. */
export const CATEGORY_COLOR_PALETTE = [
  "#06b6d4", "#a855f7", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#f97316", "#8b5cf6", "#14b8a6", "#ef4444",
];

/** Derives a deterministic color from any stable ID string so the same
 *  category always renders the same color on every computer/session. */
export function categoryColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CATEGORY_COLOR_PALETTE[h % CATEGORY_COLOR_PALETTE.length];
}

export type TrialResultKey =
  | "CORRECT"
  | "INCORRECT"
  | "PROMPTED"
  | "NO_RESPONSE"
  | "SKIP";

export interface PromptLevel {
  level: number; // 0 = independent
  name: string;  // e.g. "Independent", "Verbal Prompt", "Full Physical"
}

export interface MasteryCriteria {
  percentage: number;           // 0-100
  consecutiveDays: number;
  consecutiveSessions: number;
  minTrialsPerSession: number;
  firstTrialMustBe: "INDEPENDENT" | "ANY" | "SPECIFIC_PROMPT";
  firstTrialPromptLevel?: number;
  promptLevelToMaster: number;  // 0 = independent
  masteryType: "MANUAL" | "AUTOMATIC";
  openedDate: string | null;
  baselineDate: string | null;
  masteredDate: string | null;
}

export interface LocalTarget {
  id: string;
  programId: string;    // the parent Program/Goal ID
  categoryId: string;   // the Category/Skill Area ID
  clientId: string;
  title: string;
  description?: string;
  operationalDefinition: string;
  baselineLevel?: string;
  requiredPrompts?: string;
  status?: "active" | "mastered" | "paused" | "new";
  targetType: TargetType;
  phase: Phase;
  masteryCriteria: MasteryCriteria;
  promptLevels: PromptLevel[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // synced state
  synced: boolean;
  serverId?: string;    // Prisma DB id after sync
}

export interface LocalProgram {
  id: string;
  categoryId: string;
  clientId: string;
  name: string;
  description?: string;
  createdAt: string;
  synced: boolean;
  serverId?: string;
}

export interface LocalCategory {
  id: string;
  clientId: string;
  name: string;
  color?: string;
  description?: string;
  createdAt: string;
  synced: boolean;
  serverId?: string;
}

export interface ActiveTrialEntry {
  id: string;
  targetId: string;
  targetTitle: string;
  result: TrialResultKey;
  promptLevel?: number;
  latencyMs?: number;
  recordedAt: number; // epoch ms
}

export interface ActiveABCEntry {
  id: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  intensity: "mild" | "moderate" | "severe" | "extreme";
  recordedAt: number;
}

export interface ActiveSession {
  localId: string;          // temp local ID
  serverId: string | null;  // set once API returns real session ID
  clientId: string;
  startedAt: number;
  pausedAt: number | null;
  pausedAccumulatedMs: number;
  trials: ActiveTrialEntry[];
  abcEvents: ActiveABCEntry[];
  mode: "DTT" | "INTERVAL" | "ABC";
  saved: boolean;
}

/* ─── Default mastery criteria ───────────────────────────────────────────── */

export const defaultMastery = (): MasteryCriteria => ({
  percentage: 80,
  consecutiveDays: 3,
  consecutiveSessions: 3,
  minTrialsPerSession: 10,
  firstTrialMustBe: "ANY",
  promptLevelToMaster: 0,
  masteryType: "MANUAL",
  openedDate: null,
  baselineDate: null,
  masteredDate: null,
});

export const defaultPromptLevels = (): PromptLevel[] => [
  { level: 0, name: "Independent" },
  { level: 1, name: "Verbal Prompt" },
  { level: 2, name: "Gestural Prompt" },
  { level: 3, name: "Model Prompt" },
  { level: 4, name: "Partial Physical" },
  { level: 5, name: "Full Physical" },
];

/* ─── Store interface ────────────────────────────────────────────────────── */

interface ABAStore {
  /* ─ Data ─ */
  categories: LocalCategory[];
  programs: LocalProgram[];
  targets: LocalTarget[];
  activeSession: ActiveSession | null;

  /* ─ Category actions ─ */
  addCategory: (cat: LocalCategory) => void;
  updateCategory: (id: string, patch: Partial<LocalCategory>) => void;
  removeCategory: (id: string) => void;
  setCategoryServerId: (id: string, serverId: string) => void;

  /* ─ Program actions ─ */
  addProgram: (prog: LocalProgram) => void;
  updateProgram: (id: string, patch: Partial<LocalProgram>) => void;
  removeProgram: (id: string) => void;
  setProgramServerId: (id: string, serverId: string) => void;

  /* ─ Target actions ─ */
  addTarget: (target: LocalTarget) => void;
  updateTarget: (id: string, patch: Partial<LocalTarget>) => void;
  removeTarget: (id: string) => void;
  setTargetPhase: (id: string, phase: Phase) => void;
  setTargetServerId: (id: string, serverId: string) => void;

  /* ─ Session actions ─ */
  startSession: (clientId: string, serverId: string | null) => string;
  setSessionServerId: (localId: string, serverId: string) => void;
  addTrial: (localSessionId: string, trial: Omit<ActiveTrialEntry, "id">) => void;
  undoLastTrial: (localSessionId: string) => void;
  addABCEvent: (localSessionId: string, event: Omit<ActiveABCEntry, "id">) => void;
  pauseSession: (localSessionId: string) => void;
  resumeSession: (localSessionId: string) => void;
  markSessionSaved: (localSessionId: string) => void;
  clearActiveSession: () => void;

  /* ─ Selectors ─ */
  getCategoriesForClient: (clientId: string) => LocalCategory[];
  getProgramsForCategory: (categoryId: string, clientId: string) => LocalProgram[];
  getTargetsForProgram: (programId: string) => LocalTarget[];
  getTargetsForClient: (clientId: string) => LocalTarget[];
}

/* ─── Store ──────────────────────────────────────────────────────────────── */

let idCounter = 0;
function localId(prefix = "local") {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/* ─── Shared "start session" guard ───────────────────────────────────────
 * IMPORTANT: this is the single source of truth for starting a session.
 * Every entry point (DataEntryTab, session/new page, any future one) MUST
 * go through this function instead of calling the store's `startSession`
 * action directly.
 *
 * Root cause this fixes: `startSession` used to be called directly by two
 * separate page components, each with its own (subtly different, and in one
 * case completely absent) "is there already an unsaved session?" check.
 * Because `activeSession` is a single slot, calling the raw store action
 * unconditionally OVERWRITES whatever unsaved session was there — silently
 * discarding real, unsynced clinical data (trials/ABC events) with zero
 * warning. This has been the actual mechanism behind "I recorded a session
 * and it disappeared" reports. Centralizing the guard here means the fix
 * can't be bypassed or re-broken by a future caller reimplementing it. */
export type SessionStartResult =
  | { kind: "resumed"; localId: string; existing: ActiveSession }
  | { kind: "conflict"; existing: ActiveSession }
  | { kind: "started"; localId: string };

export function resolveSessionStart(
  clientId: string,
  opts?: { force?: boolean }
): SessionStartResult {
  const state = useABAStore.getState();
  const existing = state.activeSession;

  if (existing && !existing.saved) {
    if (existing.clientId === clientId) {
      // Same client — always resume, never silently wipe in-progress work.
      return { kind: "resumed", localId: existing.localId, existing };
    }
    if (!opts?.force) {
      // Different client with unsaved work — refuse to proceed until the
      // caller explicitly confirms discarding it (opts.force === true).
      return { kind: "conflict", existing };
    }
    // force === true: caller has explicit user confirmation to discard.
  }

  const newLocalId = state.startSession(clientId, null);
  return { kind: "started", localId: newLocalId };
}

export const useABAStore = create<ABAStore>()(
  persist(
    (set, get) => ({
      categories: [],
      programs: [],
      targets: [],
      activeSession: null,

      /* ─ Category ─ */
      addCategory: (cat) =>
        set((s) => ({ categories: [...s.categories, cat] })),
      updateCategory: (id, patch) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
          ),
        })),
      removeCategory: (id) =>
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),
      setCategoryServerId: (id, serverId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, serverId, synced: true } : c
          ),
        })),

      /* ─ Program ─ */
      addProgram: (prog) =>
        set((s) => ({ programs: [...s.programs, prog] })),
      updateProgram: (id, patch) =>
        set((s) => ({
          programs: s.programs.map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        })),
      removeProgram: (id) =>
        set((s) => ({ programs: s.programs.filter((p) => p.id !== id) })),
      setProgramServerId: (id, serverId) =>
        set((s) => ({
          programs: s.programs.map((p) =>
            p.id === id ? { ...p, serverId, synced: true } : p
          ),
        })),

      /* ─ Target ─ */
      addTarget: (target) =>
        set((s) => ({ targets: [...s.targets, target] })),
      updateTarget: (id, patch) =>
        set((s) => ({
          targets: s.targets.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
          ),
        })),
      removeTarget: (id) =>
        set((s) => ({ targets: s.targets.filter((t) => t.id !== id) })),
      setTargetPhase: (id, phase) =>
        set((s) => ({
          targets: s.targets.map((t) =>
            t.id === id ? { ...t, phase, updatedAt: new Date().toISOString() } : t
          ),
        })),
      setTargetServerId: (id, serverId) =>
        set((s) => ({
          targets: s.targets.map((t) =>
            t.id === id ? { ...t, serverId, synced: true } : t
          ),
        })),

      /* ─ Session ─ */
      startSession: (clientId, serverId) => {
        const id = localId("session");
        const session: ActiveSession = {
          localId: id,
          serverId,
          clientId,
          startedAt: Date.now(),
          pausedAt: null,
          pausedAccumulatedMs: 0,
          trials: [],
          abcEvents: [],
          mode: "DTT",
          saved: false,
        };
        set({ activeSession: session });
        return id;
      },
      setSessionServerId: (localId, serverId) =>
        set((s) => ({
          activeSession:
            s.activeSession?.localId === localId
              ? { ...s.activeSession, serverId }
              : s.activeSession,
        })),
      addTrial: (localSessionId, trial) => {
        const entry: ActiveTrialEntry = {
          ...trial,
          id: localId("trial"),
        };
        set((s) => {
          if (s.activeSession?.localId !== localSessionId) return s;
          return {
            activeSession: {
              ...s.activeSession,
              trials: [...s.activeSession.trials, entry],
            },
          };
        });
      },
      undoLastTrial: (localSessionId) =>
        set((s) => {
          if (s.activeSession?.localId !== localSessionId) return s;
          return {
            activeSession: {
              ...s.activeSession,
              trials: s.activeSession.trials.slice(0, -1),
            },
          };
        }),
      addABCEvent: (localSessionId, event) => {
        const entry: ActiveABCEntry = { ...event, id: localId("abc") };
        set((s) => {
          if (s.activeSession?.localId !== localSessionId) return s;
          return {
            activeSession: {
              ...s.activeSession,
              abcEvents: [...s.activeSession.abcEvents, entry],
            },
          };
        });
      },
      pauseSession: (localSessionId) =>
        set((s) => {
          if (s.activeSession?.localId !== localSessionId || s.activeSession.pausedAt) return s;
          return {
            activeSession: { ...s.activeSession, pausedAt: Date.now() },
          };
        }),
      resumeSession: (localSessionId) =>
        set((s) => {
          if (s.activeSession?.localId !== localSessionId || !s.activeSession.pausedAt) return s;
          const addedMs = Date.now() - s.activeSession.pausedAt;
          return {
            activeSession: {
              ...s.activeSession,
              pausedAt: null,
              pausedAccumulatedMs: s.activeSession.pausedAccumulatedMs + addedMs,
            },
          };
        }),
      markSessionSaved: (localSessionId) =>
        set((s) => {
          if (s.activeSession?.localId !== localSessionId) return s;
          return { activeSession: { ...s.activeSession, saved: true } };
        }),
      clearActiveSession: () => set({ activeSession: null }),

      /* ─ Selectors ─ */
      getCategoriesForClient: (clientId) =>
        get().categories.filter((c) => c.clientId === clientId),
      getProgramsForCategory: (categoryId, clientId) =>
        get().programs.filter((p) => p.categoryId === categoryId && p.clientId === clientId),
      getTargetsForProgram: (programId) =>
        get().targets.filter((t) => t.programId === programId && t.isActive),
      getTargetsForClient: (clientId) =>
        get().targets.filter((t) => t.clientId === clientId && t.isActive),
    }),
    {
      name: "smart-steps-aba",
      storage: createJSONStorage(() => localStorage),
      // Only persist data, not computed selectors
      partialize: (state) => ({
        categories: state.categories,
        programs: state.programs,
        targets: state.targets,
        activeSession: state.activeSession,
      }),
    }
  )
);
