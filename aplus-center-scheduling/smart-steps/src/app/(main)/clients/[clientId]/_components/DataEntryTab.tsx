"use client";

/**
 * DataEntryTab — full ABA session data-entry system embedded in the client profile.
 *
 * Views:
 *   "history"  — past sessions + Start button
 *   "live"     — active session recording (DTT / Interval / ABC)
 *   "summary"  — post-session summary before clearing
 *
 * Uses the existing Zustand ABA store (same as session/new/page.tsx) so
 * offline-first behaviour and localStorage persistence are inherited for free.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Play, Pause, Timer, Save, CloudOff, Plus, Minus, RefreshCcw,
  Activity, X, CheckCircle2, Zap, Layers, Target as TargetIcon, Clock,
  RotateCcw, ChevronDown, User,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { queueTrial, queueBehavior, queueSession } from "@/lib/dexie";
import {
  useABAStore,
  resolveSessionStart,
  defaultMastery,
  defaultPromptLevels,
  type TrialResultKey,
  type ActiveABCEntry,
  type ActiveSession,
  type LocalTarget,
} from "@/store/abaStore";
import { SessionSnapshotDrawer } from "./SessionSnapshotDrawer";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type RecordingMode = "DTT" | "INTERVAL" | "ABC";
type IntervalType  = "FREQUENCY" | "DURATION" | "MOMENTARY" | "PARTIAL" | "WHOLE" | "LATENCY";
type DataView      = "history" | "setup" | "live" | "summary";

interface SessionSetup {
  startedAt?: string;
  endedAt?: string;
  providerId?: string;
  mode?: RecordingMode;
}

interface ProviderOption {
  id: string;
  name: string | null;
  role: string;
  displayRole: string | null;
}

interface TrialEntry {
  id: string;
  targetId: string;
  targetTitle: string;
  result: TrialResultKey;
  promptLevel?: string;
  at: number;
}

interface AbcEntry {
  id: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  intensity: string;
  at: number;
}

interface SessionSummaryData {
  durationSec: number;
  trialCount: number;
  correctCount: number;
  incorrectCount: number;
  promptedCount: number;
  abcCount: number;
  goalBreakdown: Array<{
    title: string;
    total: number;
    correct: number;
    pct: number;
  }>;
}

interface PastSession {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  createdAt?: string | null;
  trialCount: number;
  pctCorrect?: number | null;
  therapistName?: string | null;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const TRIAL_BUTTONS = [
  { key: "CORRECT"   as TrialResultKey, label: "Correct",     short: "✓", color: "#10b981",                bg: "rgba(16,185,129,.12)",  ring: "rgba(16,185,129,.35)" },
  { key: "INCORRECT" as TrialResultKey, label: "Incorrect",   short: "✗", color: "var(--accent-pink)",     bg: "rgba(236,72,153,.12)",  ring: "rgba(236,72,153,.35)" },
  { key: "PROMPTED"  as TrialResultKey, label: "Prompted",    short: "P", color: "var(--accent-purple)",   bg: "rgba(168,85,247,.12)",  ring: "rgba(168,85,247,.35)" },
  { key: "NO_RESPONSE" as TrialResultKey, label: "No Response", short: "NR", color: "#71717a", bg: "rgba(113,113,122,.10)", ring: "rgba(113,113,122,.30)" },
] as const;

const PROMPT_LEVELS = [
  "FULL_PHYSICAL", "PARTIAL_PHYSICAL", "GESTURAL",
  "VERBAL", "MODEL", "INDEPENDENT",
] as const;

const INTERVAL_TYPES: { key: IntervalType; label: string }[] = [
  { key: "FREQUENCY", label: "Frequency"       },
  { key: "DURATION",  label: "Duration"        },
  { key: "MOMENTARY", label: "Momentary (MTS)" },
  { key: "PARTIAL",   label: "Partial Interval"},
  { key: "WHOLE",     label: "Whole Interval"  },
  { key: "LATENCY",   label: "Latency"         },
];

const INTENSITIES = ["mild", "moderate", "severe", "extreme"] as const;

function uid() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ─── Goal card with DTT buttons ────────────────────────────────────────── */

function GoalCard({
  goal,
  trials,
  onRecord,
}: {
  goal: LocalTarget;
  trials: TrialEntry[];
  onRecord: (targetId: string, targetTitle: string, result: TrialResultKey, prompt?: string) => void;
}) {
  const myTrials    = trials.filter((t) => t.targetId === (goal.serverId ?? goal.id));
  const correct     = myTrials.filter((t) => t.result === "CORRECT").length;
  const total       = myTrials.length;
  const pct         = total > 0 ? Math.round((correct / total) * 100) : null;
  const [showPrompt, setShowPrompt] = useState(false);

  const resolvedId    = goal.serverId ?? goal.id;
  const resolvedTitle = goal.title ?? "Untitled";

  return (
    <motion.div
      layout
      className="glass-card rounded-2xl border border-[var(--glass-border)] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-2 gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)] leading-snug">{resolvedTitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs rounded-full px-2 py-0.5 ${
              goal.phase === "MASTERED" ? "bg-emerald-400/10 text-emerald-400" :
              goal.phase === "ACQUISITION" ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]" :
              "bg-zinc-500/15 text-zinc-400"
            }`}>{goal.phase?.charAt(0) + (goal.phase ?? "BASELINE").slice(1).toLowerCase()}</span>
            {total > 0 && (
              <span className="text-xs text-zinc-500">{total} trial{total !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
        {pct !== null && (
          <div className={`shrink-0 text-xl font-bold ${pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-[var(--accent-pink)]"}`}>
            {pct}%
          </div>
        )}
      </div>

      {/* Prompt level picker */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-4"
          >
            <p className="text-xs text-zinc-500 mb-2">Select prompt level:</p>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {PROMPT_LEVELS.map((pl) => (
                <motion.button
                  key={pl}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    onRecord(resolvedId, resolvedTitle, "PROMPTED", pl);
                    setShowPrompt(false);
                    if (navigator.vibrate) navigator.vibrate(15);
                  }}
                  className="rounded-xl py-2 text-xs font-medium bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/25 transition-colors"
                >
                  {pl.replace(/_/g, " ")}
                </motion.button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowPrompt(false)}
              className="w-full rounded-xl py-2 text-xs text-zinc-500 bg-[var(--glass-bg)] mb-3"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trial buttons */}
      {!showPrompt && (
        <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
          {TRIAL_BUTTONS.map((btn) => {
            const cnt = myTrials.filter((t) => t.result === btn.key).length;
            return (
              <motion.button
                key={btn.key}
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  if (btn.key === "PROMPTED") {
                    setShowPrompt(true);
                    return;
                  }
                  onRecord(resolvedId, resolvedTitle, btn.key);
                  if (navigator.vibrate) navigator.vibrate(10);
                }}
                className="flex flex-col items-center justify-center gap-0.5 rounded-xl py-3 text-center transition-all active:scale-90"
                style={{ background: btn.bg, color: btn.color, outline: `2px solid transparent` }}
              >
                <span className="text-lg font-bold leading-none">{cnt > 0 ? cnt : btn.short}</span>
                <span className="text-[10px] font-medium opacity-80 leading-none">{btn.label}</span>
              </motion.button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/* ─── Session summary card ───────────────────────────────────────────────── */

function SummaryView({
  summary,
  onDone,
}: {
  summary: SessionSummaryData;
  onDone: () => void;
}) {
  const pct = summary.trialCount > 0
    ? Math.round((summary.correctCount / summary.trialCount) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Hero */}
      <div className="glass-card rounded-2xl p-6 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-400/10 mb-4">
          <CheckCircle2 className="h-9 w-9 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--foreground)] mb-1">Session Complete</h2>
        <p className="text-sm text-zinc-500">
          {fmt(summary.durationSec)} · {summary.trialCount} trial{summary.trialCount !== 1 ? "s" : ""}
          {summary.abcCount > 0 && ` · ${summary.abcCount} ABC`}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "% Correct",  value: pct !== null ? `${pct}%` : "—",           color: pct !== null && pct >= 80 ? "#10b981" : pct !== null && pct >= 60 ? "#f59e0b" : "var(--accent-pink)" },
          { label: "Correct",    value: summary.correctCount,   color: "#10b981" },
          { label: "Incorrect",  value: summary.incorrectCount, color: "var(--accent-pink)" },
          { label: "Prompted",   value: summary.promptedCount,  color: "var(--accent-purple)" },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{String(s.value)}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Per-goal breakdown */}
      {summary.goalBreakdown.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            <TargetIcon className="h-4 w-4 text-[var(--accent-cyan)]" />
            Goal breakdown
          </h3>
          <div className="space-y-3">
            {summary.goalBreakdown.map((g) => (
              <div key={g.title}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-300 truncate max-w-[70%]">{g.title}</span>
                  <span className={`font-semibold ${g.pct >= 80 ? "text-emerald-400" : g.pct >= 60 ? "text-amber-400" : "text-[var(--accent-pink)]"}`}>
                    {g.pct}% <span className="text-zinc-500 font-normal">({g.correct}/{g.total})</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--glass-border)]">
                  <motion.div
                    className={`h-full rounded-full ${g.pct >= 80 ? "bg-emerald-400" : g.pct >= 60 ? "bg-amber-400" : "bg-[var(--accent-pink)]"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${g.pct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="btn-primary w-full rounded-xl py-3.5 font-bold text-base"
      >
        Done
      </button>
    </motion.div>
  );
}

/* ─── Unsaved-session conflict dialog ─────────────────────────────────────
 * Shown instead of silently discarding data when the user tries to start a
 * session while a DIFFERENT client's session is still unsaved. */
function ConflictDialog({
  trialCount,
  onCancel,
  onDiscard,
}: {
  trialCount: number;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass-card w-full max-w-md rounded-2xl border border-amber-500/30 p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15">
            <CloudOff className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">Unsaved session in progress</h3>
            <p className="text-xs text-zinc-500">for a different client</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400">
          You have <span className="font-semibold text-amber-300">{trialCount} recorded trial{trialCount !== 1 ? "s" : ""}</span> that
          {" "}have not been saved yet. Starting a new session here will <span className="font-semibold text-[var(--accent-pink)]">permanently discard</span> that
          data unless you go back and end that session first.
        </p>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[var(--glass-border)] py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/5 transition-colors"
          >
            Go back &amp; resume it
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="flex-1 rounded-xl bg-[var(--accent-pink)]/20 py-2.5 text-sm font-semibold text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/30 transition-colors"
          >
            Discard &amp; start new
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Main DataEntryTab ──────────────────────────────────────────────────── */

export function DataEntryTab({ clientId }: { clientId: string }) {
  /* ── Hydration guard ── */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  /* ── Auth ── */
  const { data: authSession } = useSession();
  const loggedInUserId   = (authSession?.user as { id?: string })?.id ?? "";
  const loggedInUserName = authSession?.user?.name ?? "";

  /* ── View state ── */
  const [view, setView] = useState<DataView>("history");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  /* ── Pre-session setup form ── */
  const todayStr   = new Date().toISOString().slice(0, 10);
  const nowTimeStr = new Date().toTimeString().slice(0, 5);
  const [setupForm, setSetupForm] = useState({
    sessionDate: todayStr,
    timeIn: nowTimeStr,
    timeOut: "",
    mode: "DTT" as RecordingMode,
    providerId: "",
    providerName: "",
  });

  /* Set default provider once auth loads */
  useEffect(() => {
    if (loggedInUserId && !setupForm.providerId) {
      setSetupForm((f) => ({ ...f, providerId: loggedInUserId, providerName: loggedInUserName }));
    }
    // Only run when auth first resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedInUserId]);

  /* ── Provider dropdown list ── */
  const { data: providerList = [] } = useQuery<ProviderOption[]>({
    queryKey: ["providers-dropdown"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/users?forDropdown=1");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  /* ── Session timer ── */
  const [startedAtMs, setStartedAtMs]   = useState<number | null>(null);
  const [elapsedSec, setElapsedSec]     = useState(0);
  const [isPaused, setIsPaused]         = useState(false);
  const pauseAccumRef                   = useRef(0);
  const pauseStartRef                   = useRef<number | null>(null);
  const timerRef                        = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Session IDs ── */
  const [sessionId, setSessionId]               = useState<string | null>(null);
  const [localSessionId, setLocalSessionId]     = useState<string | null>(null);

  /* ── Recording mode ── */
  const [mode, setMode]           = useState<RecordingMode>("DTT");
  const [trials, setTrials]       = useState<TrialEntry[]>([]);
  const [abcEntries, setAbcEntries] = useState<AbcEntry[]>([]);

  /* ── Category/skill navigation filter ── */
  const [filterCatId, setFilterCatId]     = useState<string | null>(null);
  const [filterSkillId, setFilterSkillId] = useState<string | null>(null);

  /* ── Interval ── */
  const [intervalType, setIntervalType]         = useState<IntervalType>("FREQUENCY");
  const [intervalDuration, setIntervalDuration] = useState(10);
  const [intervalTimeLeft, setIntervalTimeLeft] = useState(0);
  const [intervalCount, setIntervalCount]       = useState(0);
  const [isIntervalRunning, setIsIntervalRunning] = useState(false);
  const [behaviorCount, setBehaviorCount]       = useState(0);
  const intervalRef                             = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── ABC ── */
  const [showAbcForm, setShowAbcForm] = useState(false);
  const [abcForm, setAbcForm]         = useState({ antecedent: "", behavior: "", consequence: "", intensity: "mild" });

  /* ── Session summary ── */
  const [summary, setSummary]  = useState<SessionSummaryData | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /* ── Conflicting unsaved session guard ──
   * Set when the user tries to start a new session while a DIFFERENT
   * client's session is still unsaved. We never discard that data
   * automatically — the user must explicitly confirm. */
  const [conflictingSession, setConflictingSession] = useState<{
    existing: ActiveSession;
    pendingSetup?: SessionSetup;
  } | null>(null);

  const qc = useQueryClient();

  /* ── Zustand store ── */
  const storeSetServerId   = useABAStore((s) => s.setSessionServerId);
  const storeAddTrial      = useABAStore((s) => s.addTrial);
  const storeAddABC        = useABAStore((s) => s.addABCEvent);
  const storeMarkSaved     = useABAStore((s) => s.markSessionSaved);
  const storeClear         = useABAStore((s) => s.clearActiveSession);
  const storeActiveSession = useABAStore((s) => s.activeSession);
  // Select raw arrays — never filter inside useABAStore selector (filter() returns a new
  // array reference every call → Zustand sees changed value every render → infinite loop).
  // Actions (setTargetServerId, addTarget) are accessed via getState() in effects only —
  // subscribing to them as selectors + including them in effect deps causes React #185
  // (maximum update depth exceeded) in React 19 because Zustand notifies subscribers
  // synchronously inside useSyncExternalStore, re-triggering the effect chain.
  const rawCategories      = useABAStore((s) => s.categories);
  const allSkills          = useABAStore((s) => s.programs);
  const rawTargets         = useABAStore((s) => s.targets);
  const categories         = useMemo(() => (rawCategories ?? []).filter((c) => c.clientId === clientId), [rawCategories, clientId]);
  const allGoals           = useMemo(() => (rawTargets ?? []).filter((t) => t.clientId === clientId && (t.isActive ?? true)), [rawTargets, clientId]);

  /* ── Past sessions ── */
  const { data: pastSessions = [], refetch: refetchSessions } = useQuery<PastSession[]>({
    queryKey: ["sessions", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/sessions?clientId=${clientId}&limit=20`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
  });

  /* ── Server target sync: ensures every goal has a serverId before recording ── */
  const { data: serverTargetData } = useQuery<{
    groups: Array<{
      groupId: string;
      groupLabel: string;
      groupType: "goal" | "program";
      targets: Array<{ id: string; definition: string; targetType: string; phase: string }>;
    }>;
  }>({
    queryKey: ["server-targets-sync", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/targets`);
      if (!res.ok) return { groups: [] };
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  /* ── Derived goal list ── */
  const visibleGoals = useMemo(() => allGoals.filter((g) => {
    if (filterSkillId) return g.programId === filterSkillId;
    if (filterCatId) {
      const skill = (allSkills ?? []).find((s) => s.categoryId === filterCatId && s.clientId === clientId && g.programId === s.id);
      return !!skill || ((allSkills ?? []).filter((s) => s.categoryId === filterCatId).length === 0 && g.categoryId === filterCatId);
    }
    return true;
  }), [allGoals, allSkills, filterSkillId, filterCatId, clientId]);

  const visibleSkills = useMemo(() => filterCatId
    ? (allSkills ?? []).filter((s) => s.categoryId === filterCatId && s.clientId === clientId)
    : (allSkills ?? []).filter((s) => s.clientId === clientId),
  [allSkills, filterCatId, clientId]);

  /* ── Sync server targetIds into local Zustand store ──────────────────────
   * This ensures every LocalTarget has a serverId before the user records
   * trials. Without a serverId, trials would be saved with local IDs that
   * don't exist in the database → FK violation → silent data loss.
   *
   * Actions are accessed via useABAStore.getState() rather than as subscribed
   * selectors. Including action function selectors in the dep array caused
   * React error #185 (maximum update depth exceeded) in React 19: Zustand
   * notifies all subscribers synchronously inside useSyncExternalStore, and
   * having the action refs in deps caused the effect to re-queue itself on
   * every store write, producing an unbounded synchronous call chain.
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!serverTargetData?.groups) return;

    // Snapshot current store state + grab actions imperatively (no subscription)
    const { targets: storeTargets, addTarget, setTargetServerId } = useABAStore.getState();

    for (const group of serverTargetData.groups) {
      for (const st of group.targets) {
        // Already linked — skip
        if (storeTargets.some((t) => t.serverId === st.id)) continue;

        // Try to match an existing local target by title + clientId (case-insensitive)
        const match = storeTargets.find(
          (t) =>
            t.clientId === clientId &&
            !t.serverId &&
            (t.title ?? "").trim().toLowerCase() === (st.definition ?? "").trim().toLowerCase(),
        );

        if (match) {
          // Link the server ID to the existing local target
          setTargetServerId(match.id, st.id);
        } else if (!storeTargets.some((t) => t.id === st.id)) {
          // Target exists on server but not locally — add it so it's visible in DataEntry
          addTarget({
            id: st.id,
            serverId: st.id,
            clientId,
            title: st.definition,
            operationalDefinition: st.definition,
            targetType: st.targetType as LocalTarget["targetType"],
            phase: st.phase as LocalTarget["phase"],
            status: (st.phase === "MASTERED" ? "mastered" : "active") as LocalTarget["status"],
            categoryId: "",
            programId: group.groupType === "program" ? group.groupId : "",
            masteryCriteria: defaultMastery(),
            promptLevels: defaultPromptLevels(),
            isActive: true,
            synced: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
    // Only re-run when the server data or client changes.
    // Actions come from getState() so they don't need to be deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTargetData, clientId]);

  /* ── Session timer effect ── */
  useEffect(() => {
    if (!startedAtMs) return;
    if (isPaused) {
      pauseStartRef.current = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    if (pauseStartRef.current !== null) {
      pauseAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtMs - pauseAccumRef.current) / 1000)));
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startedAtMs, isPaused]);

  /* ── Interval timer effect ── */
  useEffect(() => {
    if (!isIntervalRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    setIntervalTimeLeft(intervalDuration);
    intervalRef.current = setInterval(() => {
      setIntervalTimeLeft((t) => {
        if (t <= 1) {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setIntervalCount((c) => c + 1);
          return intervalDuration;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isIntervalRunning, intervalDuration]);

  /* ── Start session ──
   * Always routes through resolveSessionStart() so an unsaved session
   * (this client OR any other client) is NEVER silently discarded. See the
   * comment on resolveSessionStart in abaStore.ts for why this must be
   * centralized rather than reimplemented per-caller. */
  const startSession = useCallback(async (setup?: SessionSetup, opts?: { force?: boolean }) => {
    const result = resolveSessionStart(clientId, opts);

    if (result.kind === "conflict") {
      // Do NOT proceed — surface a confirmation instead of wiping data.
      setConflictingSession({ existing: result.existing, pendingSetup: setup });
      return;
    }

    if (result.kind === "resumed") {
      const lid = result.existing.localId;
      setLocalSessionId(lid);
      setSessionId(result.existing.serverId ?? lid);
      setStartedAtMs(result.existing.startedAt);
      const restored: TrialEntry[] = result.existing.trials.map((t) => ({
        id: t.id, targetId: t.targetId, targetTitle: t.targetTitle,
        result: t.result, at: t.recordedAt,
      }));
      if (restored.length > 0) {
        setTrials(restored);
        toast.info(`Restored ${restored.length} trial${restored.length !== 1 ? "s" : ""} from previous session`);
      }
      setView("live");
      return;
    }

    // result.kind === "started" — brand new local session (or explicit force-discard-and-start)
    const lid = result.localId;
    setLocalSessionId(lid);
    setTrials([]);
    setAbcEntries([]);
    // Timer uses the setup startedAt so live elapsed time is relative to service date
    setStartedAtMs(setup?.startedAt ? new Date(setup.startedAt).getTime() : Date.now());
    if (setup?.mode) setMode(setup.mode);
    setView("live");

    try {
      const res  = await fetch("/smart-steps/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          mode: setup?.mode ?? "DTT",
          ...(setup?.startedAt  ? { startedAt:  setup.startedAt  } : {}),
          ...(setup?.endedAt    ? { endedAt:    setup.endedAt    } : {}),
          ...(setup?.providerId ? { providerId: setup.providerId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.id && !String(data.id).startsWith("mock-")) {
        setSessionId(data.id);
        storeSetServerId(lid, data.id);
      } else {
        setSessionId(lid);
        // Queue the session itself for creation — without this, any trials
        // recorded against `lid` below would reference a session id that
        // never exists server-side and could never sync, no matter how
        // many times it's retried (see queueSession() for full context).
        queueSession({ localId: lid, clientId, startedAt: new Date(setup?.startedAt ?? Date.now()).toISOString(), mode: setup?.mode ?? "DTT" }).catch(() => {});
        toast.info("Working offline — data saved locally", { duration: 3000 });
      }
    } catch {
      setSessionId(lid);
      queueSession({ localId: lid, clientId, startedAt: new Date(setup?.startedAt ?? Date.now()).toISOString(), mode: setup?.mode ?? "DTT" }).catch(() => {});
      toast.info("Offline mode — data saved locally", { duration: 3000 });
    }
  }, [clientId, storeSetServerId]);

  /* ── Resolve a pending conflict: user explicitly chose to discard the
   * other client's unsaved session and proceed with this one. ── */
  const confirmDiscardAndStart = useCallback(() => {
    if (!conflictingSession) return;
    const pendingSetup = conflictingSession.pendingSetup;
    setConflictingSession(null);
    void startSession(pendingSetup, { force: true });
  }, [conflictingSession, startSession]);

  /* ── Record trial ── */
  const recordTrial = useCallback(
    (targetId: string, targetTitle: string, result: TrialResultKey, promptLevel?: string) => {
      const now   = Date.now();
      const entry: TrialEntry = { id: uid(), targetId, targetTitle, result, promptLevel, at: now };
      setTrials((prev) => [...prev, entry]);
      if (localSessionId) {
        storeAddTrial(localSessionId, { targetId, targetTitle, result, recordedAt: now });
      }
    },
    [localSessionId, storeAddTrial]
  );

  /* ── Undo last trial (live session only) ── */
  const undoLastTrial = useCallback(() => {
    setTrials((prev) => {
      if (prev.length === 0) return prev;
      toast.info("Last trial removed");
      return prev.slice(0, -1);
    });
    if (localSessionId) {
      useABAStore.getState().undoLastTrial(localSessionId);
    }
  }, [localSessionId]);

  /* ── Record ABC ── */
  const recordABC = useCallback(() => {
    if (!abcForm.behavior.trim()) { toast.warning("Please describe the behavior."); return; }
    const now   = Date.now();
    const entry: AbcEntry = { id: uid(), ...abcForm, at: now };
    setAbcEntries((prev) => [...prev, entry]);
    if (localSessionId) {
      storeAddABC(localSessionId, {
        antecedent: abcForm.antecedent, behavior: abcForm.behavior,
        consequence: abcForm.consequence,
        intensity: abcForm.intensity as ActiveABCEntry["intensity"],
        recordedAt: now,
      });
    }
    if (sessionId) {
      queueBehavior({
        sessionId, type: "ABC", antecedent: abcForm.antecedent,
        behavior: abcForm.behavior, consequence: abcForm.consequence,
        intensity: abcForm.intensity, createdAt: new Date().toISOString(),
      }).catch(() => {});
    }
    setAbcForm({ antecedent: "", behavior: "", consequence: "", intensity: "mild" });
    setShowAbcForm(false);
    if (navigator.vibrate) navigator.vibrate(20);
    toast.success("Behavior event recorded");
  }, [abcForm, sessionId, localSessionId, storeAddABC]);

  /* ── End session ── */
  const endSession = useCallback(async () => {
    let sid = sessionId ?? localSessionId;
    if (!sid || isSaving) return;
    setIsSaving(true);

    const endedAt = new Date().toISOString();

    try {
      // If we're still on a local-fallback session ID (server was unreachable
      // at start), make one more attempt to create a real server session
      // before saving. Local ids are always formatted "session-<ts>-<n>";
      // real ones are Prisma cuids — this is the reliable way to tell them
      // apart (the previous `sid === localSessionId && sid !== sessionId`
      // check could never be true here since `startSession` always sets
      // `sessionId` equal to `localSessionId` in its offline-fallback path).
      const sessionIsLocal = sid.startsWith("session-");
      if (sessionIsLocal) {
        const localSid = sid;
        try {
          const retryRes = await fetch("/smart-steps/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId }),
          });
          const retryData = await retryRes.json().catch(() => ({}));
          if (retryData?.id && !String(retryData.id).startsWith("mock-")) {
            sid = retryData.id;
            setSessionId(retryData.id);
            if (localSessionId) storeSetServerId(localSessionId, retryData.id);
          } else {
            queueSession({ localId: localSid, clientId, startedAt: new Date(startedAtMs ?? Date.now()).toISOString() }).catch(() => {});
          }
        } catch {
          // Offline — queue the session itself so it (and anything
          // referencing it) can be created/resolved on the next successful
          // sync instead of being lost.
          queueSession({ localId: localSid, clientId, startedAt: new Date(startedAtMs ?? Date.now()).toISOString() }).catch(() => {});
        }
      }

      // Patch session end time
      await fetch(`/smart-steps/api/sessions/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt }),
      }).catch(() => {});

      // Re-resolve target IDs — sync may have populated serverId after recording started
      const freshTargets = useABAStore.getState().targets;
      const resolvedTrials = trials.map((t) => {
        if (!t.targetId.startsWith("local-")) return t;
        const fresh = freshTargets.find((ft) => ft.id === t.targetId);
        return fresh?.serverId ? { ...t, targetId: fresh.serverId } : t;
      });

      // Separate server-linked trials from still-local ones
      const serverTrials  = resolvedTrials.filter((t) => !t.targetId.startsWith("local-"));
      const localTrials   = resolvedTrials.filter((t) =>  t.targetId.startsWith("local-"));

      // Queue any still-local trials to Dexie for later reconciliation
      if (localTrials.length > 0) {
        localTrials.forEach((t) => queueTrial({
          sessionId: sid!, targetId: t.targetId, result: t.result,
          promptLevel: t.promptLevel, createdAt: new Date(t.at).toISOString(),
        }).catch(() => {}));
        toast.warning(
          `${localTrials.length} trial${localTrials.length !== 1 ? "s" : ""} queued locally — goals not yet synced to server`,
          { duration: 5000 },
        );
      }

      // Save server-linked trials
      if (serverTrials.length > 0) {
        const trialsRes = await fetch("/smart-steps/api/trials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            trials: serverTrials.map((t) => ({
              targetId:    t.targetId,
              result:      t.result,
              promptLevel: t.promptLevel,
            })),
          }),
        });
        if (!trialsRes.ok) {
          // Server rejected — queue all for later sync
          const errBody = await trialsRes.json().catch(() => ({}));
          serverTrials.forEach((t) => queueTrial({
            sessionId: sid!, targetId: t.targetId, result: t.result,
            promptLevel: t.promptLevel, createdAt: new Date(t.at).toISOString(),
          }).catch(() => {}));
          toast.warning(`Trials queued for sync (${errBody?.error ?? trialsRes.status})`);
        }
      }

      // Save ABC events
      if (abcEntries.length > 0) {
        await fetch("/smart-steps/api/behaviors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            events: abcEntries.map((e) => ({
              type: "ABC", antecedent: e.antecedent,
              behavior: e.behavior, consequence: e.consequence, intensity: e.intensity,
            })),
          }),
        }).catch(() => {});
      }

      // Build summary
      const goalBreakdown = allGoals
        .map((g) => {
          const rid  = g.serverId ?? g.id;
          const mine = trials.filter((t) => t.targetId === rid);
          const c    = mine.filter((t) => t.result === "CORRECT").length;
          return { title: g.title, total: mine.length, correct: c, pct: mine.length > 0 ? Math.round((c / mine.length) * 100) : 0 };
        })
        .filter((g) => g.total > 0);

      const s: SessionSummaryData = {
        durationSec:   elapsedSec,
        trialCount:    trials.length,
        correctCount:  trials.filter((t) => t.result === "CORRECT").length,
        incorrectCount: trials.filter((t) => t.result === "INCORRECT").length,
        promptedCount:  trials.filter((t) => t.result === "PROMPTED").length,
        abcCount:       abcEntries.length,
        goalBreakdown,
      };

      // Mark store session as saved
      if (localSessionId) storeMarkSaved(localSessionId);
      storeClear();

      // Invalidate caches
      qc.invalidateQueries({ queryKey: ["sessions", clientId] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });

      setSummary(s);
      setView("summary");
      toast.success(`Session saved! ${trials.length} trial${trials.length !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Server error — data saved locally for sync later");
      if (localSessionId) storeMarkSaved(localSessionId);
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, trials, abcEntries, elapsedSec, localSessionId, allGoals, storeMarkSaved, storeClear, storeSetServerId, qc, clientId, isSaving, startedAtMs]);

  /* ── Reset to history ── */
  function resetToHistory() {
    setSummary(null);
    setTrials([]);
    setAbcEntries([]);
    setSessionId(null);
    setLocalSessionId(null);
    setStartedAtMs(null);
    setElapsedSec(0);
    setIsPaused(false);
    pauseAccumRef.current = 0;
    setFilterCatId(null);
    setFilterSkillId(null);
    setIntervalCount(0);
    setIsIntervalRunning(false);
    // Reset setup form defaults for next session
    const nowDate = new Date();
    setSetupForm({
      sessionDate: nowDate.toISOString().slice(0, 10),
      timeIn: nowDate.toTimeString().slice(0, 5),
      timeOut: "",
      mode: "DTT",
      providerId: loggedInUserId,
      providerName: loggedInUserName,
    });
    setView("history");
    refetchSessions();
  }

  if (!hydrated) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-20 rounded-2xl" />)}
      </div>
    );
  }

  const conflictDialog = conflictingSession && (
    <ConflictDialog
      trialCount={conflictingSession.existing.trials.length}
      onCancel={() => setConflictingSession(null)}
      onDiscard={confirmDiscardAndStart}
    />
  );

  /* ━━━━ VIEW: SUMMARY ━━━━ */
  if (view === "summary" && summary) {
    return <>
      <SummaryView summary={summary} onDone={resetToHistory} />
      {conflictDialog}
    </>;
  }

  /* ━━━━ VIEW: SETUP — pre-session form ━━━━ */
  if (view === "setup") {
    const isBackdated = setupForm.sessionDate !== new Date().toISOString().slice(0, 10);
    const handleStartFromSetup = async () => {
      const startedAt = setupForm.timeIn
        ? `${setupForm.sessionDate}T${setupForm.timeIn}:00`
        : `${setupForm.sessionDate}T00:00:00`;
      const endedAt = setupForm.timeOut
        ? `${setupForm.sessionDate}T${setupForm.timeOut}:00`
        : undefined;
      await startSession({
        startedAt: new Date(startedAt).toISOString(),
        endedAt: endedAt ? new Date(endedAt).toISOString() : undefined,
        providerId: setupForm.providerId || undefined,
        mode: setupForm.mode,
      });
    };

    return (<>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-5"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView("history")}
            className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">New Session Setup</h2>
            <p className="text-xs text-zinc-500">Session date controls reports, graphs, assessments, and session notes.</p>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-4">
          {/* Provider */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
              <User className="inline h-3.5 w-3.5 mr-1" />Provider
            </label>
            <div className="relative">
              <select
                value={setupForm.providerId}
                onChange={(e) => {
                  const opt = providerList.find((p) => p.id === e.target.value);
                  setSetupForm((f) => ({
                    ...f,
                    providerId: e.target.value,
                    providerName: opt?.name ?? e.target.value,
                  }));
                }}
                className="w-full appearance-none rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] pr-8"
              >
                {providerList.length === 0 && (
                  <option value={loggedInUserId}>{loggedInUserName || "Me (logged in)"}</option>
                )}
                {providerList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.id}{p.displayRole ? ` — ${p.displayRole}` : p.role !== "RBT" ? ` — ${p.role}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            </div>
          </div>

          {/* Session Date */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Session Date</label>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={setupForm.sessionDate}
              onChange={(e) => setSetupForm((f) => ({ ...f, sessionDate: e.target.value }))}
              className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--foreground)]"
            />
          </div>

          {/* Time In / Time Out */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Time In</label>
              <input
                type="time"
                value={setupForm.timeIn}
                onChange={(e) => setSetupForm((f) => ({ ...f, timeIn: e.target.value }))}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--foreground)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Time Out <span className="font-normal">(optional)</span></label>
              <input
                type="time"
                value={setupForm.timeOut}
                onChange={(e) => setSetupForm((f) => ({ ...f, timeOut: e.target.value }))}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--foreground)]"
              />
            </div>
          </div>

          {/* Session Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Session Type</label>
            <div className="flex gap-1.5 rounded-xl bg-[var(--glass-bg)] p-1 border border-[var(--glass-border)]">
              {(["DTT", "INTERVAL", "ABC"] as RecordingMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSetupForm((f) => ({ ...f, mode: m }))}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all ${
                    setupForm.mode === m
                      ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {m === "DTT" ? "Discrete Trial" : m === "INTERVAL" ? "Interval" : "ABC Data"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Backdated warning */}
        {isBackdated && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
          >
            <p className="text-sm font-semibold text-amber-300">Backdated Session</p>
            <p className="text-xs text-amber-400/80 mt-1">
              You are creating a session for{" "}
              <span className="font-semibold">
                {new Date(setupForm.sessionDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </span>
              . Reports, graphs, assessments, and session notes will use this service date.
            </p>
          </motion.div>
        )}

        {/* Start button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={handleStartFromSetup}
          className="w-full flex items-center justify-center gap-2 btn-primary rounded-2xl py-4 font-bold text-base"
        >
          <Play className="h-5 w-5" />
          {isBackdated ? "Create Backdated Session" : "Start Session"}
        </motion.button>
      </motion.div>
      {conflictDialog}
    </>);
  }

  /* ━━━━ VIEW: HISTORY ━━━━ */
  if (view === "history") {
    return (<>
      <div className="space-y-5">
        {/* Active session restore banner — shown for THIS client's unsaved session */}
        {storeActiveSession && storeActiveSession.clientId === clientId && !storeActiveSession.saved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-sm font-semibold text-amber-300">Session in progress</p>
              <p className="text-xs text-amber-400/70">
                {storeActiveSession.trials.length} trial{storeActiveSession.trials.length !== 1 ? "s" : ""} recorded — resume where you left off
              </p>
            </div>
            <button
              type="button"
              onClick={() => startSession()}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-4 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              <Play className="h-4 w-4" /> Resume
            </button>
          </motion.div>
        )}

        {/* Warn about an unsaved session for a DIFFERENT client — visible no
         * matter which client's page you're on, so it can never be silently
         * lost just because you navigated elsewhere before ending it. */}
        {storeActiveSession && storeActiveSession.clientId !== clientId && !storeActiveSession.saved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center justify-between gap-3"
          >
            <div>
              <p className="text-sm font-semibold text-amber-300">Unsaved session for another client</p>
              <p className="text-xs text-amber-400/70">
                {storeActiveSession.trials.length} trial{storeActiveSession.trials.length !== 1 ? "s" : ""} recorded there — finish it before starting a new one to avoid losing it
              </p>
            </div>
            <Link
              href={`/clients/${storeActiveSession.clientId}?tab=data-entry`}
              className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 px-4 py-2.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              <Play className="h-4 w-4" /> Go resume it
            </Link>
          </motion.div>
        )}

        {/* Start new session */}
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={() => setView("setup")}
          className="w-full flex items-center justify-between gap-4 glass-card rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5 p-5 hover:border-[var(--accent-cyan)]/60 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-[var(--accent-cyan)]/15 flex items-center justify-center shrink-0">
              <Zap className="h-6 w-6 text-[var(--accent-cyan)]" />
            </div>
            <div className="text-left">
              <p className="font-bold text-[var(--foreground)] text-base">Start New Session</p>
              <p className="text-xs text-zinc-500">
                {allGoals.length} active goal{allGoals.length !== 1 ? "s" : ""} · {categories.length} skill area{categories.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Play className="h-5 w-5 text-[var(--accent-cyan)] shrink-0" />
        </motion.button>

        {/* Quick stats row */}
        {pastSessions.length > 0 && (() => {
          const recent = pastSessions.slice(0, 5);
          const avgPct = recent.filter((s) => s.pctCorrect != null).reduce((a, s) => a + (s.pctCorrect ?? 0), 0) / (recent.filter((s) => s.pctCorrect != null).length || 1);
          return (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total sessions", value: pastSessions.length,   color: "var(--foreground)" },
                { label: "Avg % correct",  value: `${Math.round(avgPct)}%`, color: avgPct >= 80 ? "#10b981" : avgPct >= 60 ? "#f59e0b" : "var(--accent-pink)" },
                { label: "Last session",   value: pastSessions[0] ? new Date(pastSessions[0].startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—", color: "var(--accent-cyan)" },
              ].map((s) => (
                <div key={s.label} className="glass-card rounded-xl p-3 text-center">
                  <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Session history */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" /> Session History
          </h3>
          {pastSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-12 text-center">
              <Activity className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium mb-1">No sessions yet</p>
              <p className="text-zinc-600 text-sm">Start your first session above to begin tracking data.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pastSessions.map((s) => {
                const start    = new Date(s.startedAt);
                const durMin   = s.endedAt ? Math.round((new Date(s.endedAt).getTime() - start.getTime()) / 60000) : null;
                return (
                  <button key={s.id} type="button" onClick={() => setSelectedSessionId(s.id)} className="glass-card w-full rounded-2xl p-4 flex items-center gap-4 text-left hover:border-[var(--accent-cyan)]/40 transition-colors">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10">
                      <Activity className="h-5 w-5 text-[var(--accent-cyan)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--foreground)] text-sm">
                        {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        {durMin !== null && ` · ${durMin} min`}
                        {` · ${s.trialCount} trial${s.trialCount !== 1 ? "s" : ""}`}
                        {s.therapistName && ` · ${s.therapistName}`}
                      </p>
                    </div>
                    {s.pctCorrect != null && (
                      <span className={`text-lg font-bold shrink-0 ${s.pctCorrect >= 80 ? "text-emerald-400" : s.pctCorrect >= 60 ? "text-amber-400" : "text-[var(--accent-pink)]"}`}>
                        {Math.round(s.pctCorrect)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <SessionSnapshotDrawer sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      </div>
      {conflictDialog}
    </>);
  }

  /* ━━━━ VIEW: LIVE SESSION ━━━━ */
  return (<>
    <div className="space-y-4 -mx-0 relative">
      {/* ── Sticky session header ── */}
      <div className="sticky top-0 z-20 -mx-0 glass-card rounded-2xl border border-[var(--accent-cyan)]/20 p-3 backdrop-blur-xl mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timer */}
          <div className="flex items-center gap-1.5 rounded-xl bg-[var(--glass-bg)] px-3 py-1.5">
            <Timer className="h-4 w-4 text-[var(--accent-cyan)]" />
            <span className="font-mono text-base font-bold tabular-nums text-[var(--foreground)]">
              {fmt(elapsedSec)}
            </span>
          </div>

          {/* Pause */}
          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {isPaused ? "Resume" : "Pause"}
          </button>

          {/* Trial count */}
          <div className="flex-1 min-w-0 text-center">
            <span className="text-xs text-zinc-500">{trials.length} trial{trials.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Undo last trial */}
          {trials.length > 0 && (
            <button
              type="button"
              onClick={undoLastTrial}
              title="Undo last trial"
              className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-400/10 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Undo
            </button>
          )}

          {/* End session */}
          <button
            type="button"
            onClick={endSession}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-400/15 px-4 py-1.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-400/25 transition-colors disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving…" : "End Session"}
          </button>
        </div>
      </div>

      {/* ── Mode tabs ── */}
      <div className="flex gap-1 rounded-xl bg-[var(--glass-bg)] p-1 border border-[var(--glass-border)]">
        {(["DTT", "INTERVAL", "ABC"] as RecordingMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-all ${
              mode === m ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {m === "DTT" ? "Discrete Trial" : m === "INTERVAL" ? "Interval" : "ABC Data"}
          </button>
        ))}
      </div>

      {/* ── DTT Mode ── */}
      {mode === "DTT" && (
        <AnimatePresence mode="wait">
          <motion.div
            key="dtt"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* No goals warning */}
            {allGoals.length === 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-300">No active goals found</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Create goals & targets for this client first in the Goals & Targets tab.
                </p>
              </div>
            )}

            {/* Category filter pills */}
            {categories.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Filter by skill area</p>
                <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                  <button
                    type="button"
                    onClick={() => { setFilterCatId(null); setFilterSkillId(null); }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      !filterCatId ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" : "bg-[var(--glass-bg)] text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    All ({allGoals.length})
                  </button>
                  {categories.map((cat) => {
                    const cnt = allGoals.filter((g) => {
                      const inCat = allSkills.some((s) => s.categoryId === cat.id && s.clientId === clientId && g.programId === s.id);
                      return inCat || g.categoryId === cat.id;
                    }).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => { setFilterCatId(cat.id); setFilterSkillId(null); }}
                        className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          filterCatId === cat.id
                            ? "text-white ring-1"
                            : "bg-[var(--glass-bg)] text-zinc-400 hover:text-zinc-200"
                        }`}
                        style={filterCatId === cat.id ? { background: cat.color ?? "var(--accent-cyan)" } : {}}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: cat.color ?? "var(--accent-cyan)" }}
                        />
                        {cat.name} ({cnt})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Skill filter pills */}
            {filterCatId && visibleSkills.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                <button
                  type="button"
                  onClick={() => setFilterSkillId(null)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    !filterSkillId ? "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]" : "bg-[var(--glass-bg)] text-zinc-400"
                  }`}
                >
                  All skills
                </button>
                {visibleSkills.map((skill) => {
                  const cnt = allGoals.filter((g) => g.programId === skill.id).length;
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => setFilterSkillId(skill.id)}
                      className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        filterSkillId === skill.id
                          ? "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]"
                          : "bg-[var(--glass-bg)] text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Layers className="h-3 w-3 shrink-0" /> {skill.name} ({cnt})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Goal cards */}
            {visibleGoals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-10 text-center">
                <TargetIcon className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-zinc-500 text-sm">No goals in this area</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    trials={trials}
                    onRecord={recordTrial}
                  />
                ))}
              </div>
            )}

            {/* Offline save button */}
            <button
              type="button"
              onClick={async () => {
                const offlineId = sessionId ?? localSessionId ?? "offline";
                for (const t of trials) {
                  await queueTrial({
                    sessionId: offlineId,
                    targetId: t.targetId, result: t.result,
                    promptLevel: t.promptLevel,
                    createdAt: new Date(t.at).toISOString(),
                  }).catch(() => {});
                }
                toast.success("Queued for offline sync");
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--glass-border)] py-2.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <CloudOff className="h-3.5 w-3.5" /> Save offline copy
            </button>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Interval Mode ── */}
      {mode === "INTERVAL" && (
        <AnimatePresence mode="wait">
          <motion.div
            key="interval"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Type selector */}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Recording type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INTERVAL_TYPES.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => setIntervalType(it.key)}
                    className={`rounded-xl py-2.5 text-xs font-medium transition-all ${
                      intervalType === it.key
                        ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                        : "bg-[var(--glass-bg)] text-zinc-400 hover:text-zinc-300"
                    }`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="glass-card rounded-2xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Interval duration</p>
              <div className="flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={() => setIntervalDuration((d) => Math.max(5, d - 5))}
                  className="h-10 w-10 rounded-xl bg-[var(--glass-bg)] flex items-center justify-center"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-3xl font-bold tabular-nums text-[var(--foreground)] w-20 text-center">{intervalDuration}s</span>
                <button
                  type="button"
                  onClick={() => setIntervalDuration((d) => Math.min(300, d + 5))}
                  className="h-10 w-10 rounded-xl bg-[var(--glass-bg)] flex items-center justify-center"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Timer display */}
            {isIntervalRunning && (
              <div className="glass-card rounded-2xl p-6 text-center">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Next interval in</p>
                <div className="text-5xl font-bold tabular-nums text-[var(--accent-cyan)]">{intervalTimeLeft}s</div>
                <div className="mt-3 h-2 w-full rounded-full bg-[var(--glass-border)]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)]"
                    style={{ width: `${((intervalDuration - intervalTimeLeft) / intervalDuration) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-zinc-400">Interval #{intervalCount + 1}</p>
              </div>
            )}

            {/* Controls */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setIsIntervalRunning((r) => !r)}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl py-5 font-semibold transition-all ${
                  isIntervalRunning
                    ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                    : "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                }`}
              >
                {isIntervalRunning ? <><RefreshCcw className="h-7 w-7" />Stop</> : <><Timer className="h-7 w-7" />Start</>}
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setBehaviorCount((c) => c + 1);
                  if (navigator.vibrate) navigator.vibrate(15);
                }}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-[var(--accent-pink)]/20 py-5 text-[var(--accent-pink)]"
              >
                <span className="text-4xl font-bold">{behaviorCount}</span>
                <span className="text-xs font-semibold">Tap to record</span>
              </motion.button>
            </div>

            <p className="text-center text-xs text-zinc-500">
              {intervalType} · {intervalCount} interval{intervalCount !== 1 ? "s" : ""} completed
            </p>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── ABC Mode ── */}
      {mode === "ABC" && (
        <AnimatePresence mode="wait">
          <motion.div
            key="abc"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowAbcForm(true)}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl bg-[var(--accent-pink)]/15 py-7 text-[var(--accent-pink)] border border-[var(--accent-pink)]/20 hover:bg-[var(--accent-pink)]/25 transition-colors"
            >
              <Plus className="h-9 w-9" />
              <span className="font-semibold text-base">Record behavior event</span>
            </motion.button>

            <AnimatePresence>
              {showAbcForm && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="glass-card rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[var(--foreground)]">ABC Entry</h3>
                    <button type="button" onClick={() => setShowAbcForm(false)} className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-200">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {[
                    { key: "antecedent",  label: "Antecedent",  placeholder: "What happened before…" },
                    { key: "behavior",    label: "Behavior *",  placeholder: "Describe the behavior…" },
                    { key: "consequence", label: "Consequence", placeholder: "What happened after…"  },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="block text-xs text-zinc-400 mb-1">{f.label}</label>
                      <input
                        type="text"
                        value={abcForm[f.key as keyof typeof abcForm]}
                        onChange={(e) => setAbcForm({ ...abcForm, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="field-input w-full"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Intensity</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {INTENSITIES.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setAbcForm({ ...abcForm, intensity: lvl })}
                          className={`rounded-xl py-2 text-xs font-medium capitalize transition-colors ${
                            abcForm.intensity === lvl
                              ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                              : "bg-[var(--glass-bg)] text-zinc-400 hover:text-zinc-300"
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowAbcForm(false)} className="flex-1 rounded-xl border border-[var(--glass-border)] py-2.5 text-sm text-zinc-400">Cancel</button>
                    <button type="button" onClick={recordABC} className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-semibold">Record</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ABC Timeline */}
            {abcEntries.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Timeline ({abcEntries.length})</p>
                <div className="space-y-2">
                  {[...abcEntries].reverse().map((e) => (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="glass-card rounded-xl p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 text-xs flex-1 min-w-0">
                          {e.antecedent && <p><span className="text-zinc-500">A: </span><span className="text-zinc-300">{e.antecedent}</span></p>}
                          <p><span className="text-zinc-500">B: </span><span className="text-[var(--foreground)] font-medium">{e.behavior}</span></p>
                          {e.consequence && <p><span className="text-zinc-500">C: </span><span className="text-zinc-300">{e.consequence}</span></p>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${
                          e.intensity === "severe" || e.intensity === "extreme"
                            ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                            : "bg-zinc-700/60 text-zinc-400"
                        }`}>{e.intensity}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
    {conflictDialog}
  </>);
}
