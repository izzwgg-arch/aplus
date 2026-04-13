"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { db, queueTrial, queueBehavior } from "@/lib/dexie";
import { toast } from "sonner";
import { ArrowLeft, Pause, Play, Timer, Plus, Minus, RefreshCcw, Save, CloudOff } from "lucide-react";
import { useABAStore } from "@/store/abaStore";

/* ─── Types ─────────────────────────────────────────────────────────────── */

const TRIAL_RESULTS = [
  { key: "CORRECT", label: "Correct", short: "✓", color: "var(--accent-cyan)", emoji: "✅" },
  { key: "INCORRECT", label: "Incorrect", short: "✗", color: "var(--accent-pink)", emoji: "❌" },
  { key: "PROMPTED", label: "Prompted", short: "P", color: "var(--accent-purple)", emoji: "👆" },
  { key: "NR", label: "No response", short: "NR", color: "var(--foreground)", emoji: "—" },
] as const;

const PROMPT_LEVELS = [
  "FULL_PHYSICAL",
  "PARTIAL_PHYSICAL",
  "GESTURAL",
  "VERBAL",
  "MODEL",
  "INDEPENDENT",
] as const;

type TrialResult = (typeof TRIAL_RESULTS)[number]["key"];
type PromptLevel = (typeof PROMPT_LEVELS)[number];

type TrialEntry = {
  targetId: string;
  targetLabel: string;
  result: TrialResult;
  promptLevel?: PromptLevel;
  latencyMs?: number;
  at: number;
};

type Target = { id: string; definition: string; targetType: string; phase: string };

type RecordingMode = "DTT" | "INTERVAL" | "ABC";

type IntervalType = "FREQUENCY" | "DURATION" | "MOMENTARY" | "PARTIAL" | "WHOLE" | "LATENCY";

type AbcEntry = {
  at: number;
  antecedent: string;
  behavior: string;
  consequence: string;
  intensity: string;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const MAX_UNDO = 10;

const INTERVAL_TYPES: { key: IntervalType; label: string }[] = [
  { key: "FREQUENCY", label: "Frequency" },
  { key: "DURATION", label: "Duration" },
  { key: "MOMENTARY", label: "Momentary (MTS)" },
  { key: "PARTIAL", label: "Partial Interval" },
  { key: "WHOLE", label: "Whole Interval" },
  { key: "LATENCY", label: "Latency" },
];

const INTENSITIES = ["mild", "moderate", "severe", "extreme"];

async function postTrials(
  sessionId: string,
  trials: { targetId: string; result: string; promptLevel?: string; latencyMs?: number }[]
) {
  const res = await fetch("/smart-steps/api/trials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, trials }),
  });
  if (!res.ok) throw new Error("Failed to save trials");
  return res.json();
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function SessionNewPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = String(params.clientId ?? "");
  const queryClient = useQueryClient();

  /* ABA store for offline-first persistence */
  const storeStartSession = useABAStore((s) => s.startSession);
  const storeSetServerId = useABAStore((s) => s.setSessionServerId);
  const storeAddTrial = useABAStore((s) => s.addTrial);
  const storeAddABC = useABAStore((s) => s.addABCEvent);
  const storeMarkSaved = useABAStore((s) => s.markSessionSaved);
  const storeClear = useABAStore((s) => s.clearActiveSession);
  const storeActiveSession = useABAStore((s) => s.activeSession);
  const storeTargets = useABAStore((s) => s.targets.filter((t) => t.clientId === clientId && t.isActive));
  const [storeLocalSessionId, setStoreLocalSessionId] = useState<string | null>(null);

  /* session state */
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null); // epoch ms
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const pausedAccumulatedRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* DTT state */
  const [selectedTargetIndex, setSelectedTargetIndex] = useState(0);
  const [trials, setTrials] = useState<TrialEntry[]>([]);
  const [undoStack, setUndoStack] = useState<TrialEntry[]>([]);
  const [showPromptLevel, setShowPromptLevel] = useState(false);

  /* interval recording */
  const [mode, setMode] = useState<RecordingMode>("DTT");
  const [intervalType, setIntervalType] = useState<IntervalType>("FREQUENCY");
  const [intervalDuration, setIntervalDuration] = useState(10); // seconds
  const [intervalTimeLeft, setIntervalTimeLeft] = useState(0);
  const [intervalCount, setIntervalCount] = useState(0);
  const [isIntervalRunning, setIsIntervalRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [behaviorCount, setBehaviorCount] = useState(0);

  /* ABC state */
  const [abcEntries, setAbcEntries] = useState<AbcEntry[]>([]);
  const [abcForm, setAbcForm] = useState({
    antecedent: "",
    behavior: "",
    consequence: "",
    intensity: "mild",
  });
  const [showAbcForm, setShowAbcForm] = useState(false);

  /* load all targets for this client (from goals + programs) */
  const { data: targetData } = useQuery<{
    groups: Array<{
      groupId: string;
      groupLabel: string;
      groupType: "goal" | "program";
      domain?: string | null;
      targets: Array<{ id: string; definition: string; targetType: string; phase: string; subGoalTitle?: string | null }>;
    }>;
    totalTargets: number;
  }>({
    queryKey: ["client-targets", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/targets`);
      if (!res.ok) return { groups: [], totalTargets: 0 };
      return res.json();
    },
    enabled: !!clientId,
  });

  const [showTargetPicker, setShowTargetPicker] = useState(false);

  const serverTargets: Target[] = (targetData?.groups ?? []).flatMap((g) =>
    g.targets.map((t) => ({
      id: t.id,
      definition: t.definition,
      targetType: t.targetType,
      phase: t.phase,
    }))
  );

  // Merge: local store targets first (may not be synced yet), then server targets not already in store
  const storeTargetsAsMapped: Target[] = storeTargets.map((t) => ({
    id: t.serverId ?? t.id,
    definition: t.title,
    targetType: t.targetType,
    phase: t.phase,
  }));
  const storeIds = new Set(storeTargets.map((t) => t.serverId ?? t.id));
  const mergedTargets: Target[] = [
    ...storeTargetsAsMapped,
    ...serverTargets.filter((t) => !storeIds.has(t.id)),
  ];

  const targets: Target[] = mergedTargets.length > 0 ? mergedTargets : serverTargets;
  const hasNoTargets = targets.length === 0;

  const currentTarget = targets[selectedTargetIndex] ?? targets[0];

  /* ─── Session init ─────────────────────────────────────────────────────── */

  const createSession = useCallback(async () => {
    // Check if there's an unfinished active session in the store for this client
    const stored = useABAStore.getState().activeSession;
    if (stored && stored.clientId === clientId && !stored.saved) {
      // Restore existing in-progress session
      const localId = storeStartSession(clientId, stored.serverId);
      setStoreLocalSessionId(localId);
      setSessionId(stored.serverId ?? localId);
      setStartedAt(stored.startedAt);
      // Restore trials — map store shape → page TrialEntry shape
      // Store uses numeric promptLevel; page uses string union — drop promptLevel on restore
      const restoredTrials: TrialEntry[] = stored.trials.map((t) => ({
        targetId: t.targetId,
        targetLabel: t.targetTitle,
        result: t.result as TrialEntry["result"],
        promptLevel: undefined as PromptLevel | undefined,
        latencyMs: t.latencyMs,
        at: t.recordedAt,
      }));
      if (restoredTrials.length > 0) {
        setTrials(restoredTrials);
        toast.info(`Restored ${restoredTrials.length} trial${restoredTrials.length !== 1 ? "s" : ""} from last session`);
      }
      return;
    }

    // Start fresh session in store first (offline-first)
    const localSessionId = storeStartSession(clientId, null);
    setStoreLocalSessionId(localSessionId);

    try {
      const res = await fetch("/smart-steps/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json().catch(() => ({}));
      const realId = data?.id;
      if (realId && !realId.startsWith("mock-")) {
        setSessionId(realId);
        storeSetServerId(localSessionId, realId);
      } else {
        setSessionId(localSessionId);
        toast.info("Working offline — session saved locally", { duration: 3000 });
      }
    } catch {
      setSessionId(localSessionId);
      toast.info("Offline mode — trials saved locally", { duration: 3000 });
    }
    setStartedAt(Date.now());
  }, [clientId, storeStartSession, storeSetServerId]);

  useEffect(() => {
    if (!sessionId) createSession();
  }, [sessionId, createSession]);

  /* ─── Session timer (no reset on pause) ────────────────────────────────── */

  useEffect(() => {
    if (!startedAt) return;
    if (isPaused) {
      pauseStartRef.current = Date.now();
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    // Adjust accumulated offset on resume
    if (pauseStartRef.current !== null) {
      pausedAccumulatedRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt - pausedAccumulatedRef.current) / 1000);
      setElapsedSec(Math.max(0, elapsed));
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startedAt, isPaused]);

  /* ─── Interval timer ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isIntervalRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    setIntervalTimeLeft(intervalDuration);
    intervalRef.current = setInterval(() => {
      setIntervalTimeLeft((t) => {
        if (t <= 1) {
          // Interval elapsed — vibrate
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setIntervalCount((c) => c + 1);
          return intervalDuration;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isIntervalRunning, intervalDuration]);

  /* ─── DTT trial entry ───────────────────────────────────────────────────── */

  const addTrial = useCallback(
    (result: TrialResult, promptLevel?: PromptLevel) => {
      if (!currentTarget) return;
      const now = Date.now();
      const entry: TrialEntry = {
        targetId: currentTarget.id,
        targetLabel: currentTarget.definition,
        result,
        promptLevel,
        at: now,
      };
      setTrials((prev) => {
        const next = [...prev, entry];
        setUndoStack((u) => [entry, ...u].slice(0, MAX_UNDO));
        return next;
      });
      // Persist to store immediately (offline-first)
      // Map string prompt level to numeric index for the store
      if (storeLocalSessionId) {
        const promptIdx = promptLevel != null ? PROMPT_LEVELS.indexOf(promptLevel) : undefined;
        storeAddTrial(storeLocalSessionId, {
          targetId: currentTarget.id,
          targetTitle: currentTarget.definition,
          result: result as import("@/store/abaStore").TrialResultKey,
          promptLevel: promptIdx !== undefined && promptIdx >= 0 ? promptIdx : undefined,
          recordedAt: now,
        });
      }
      setShowPromptLevel(false);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    },
    [currentTarget, storeLocalSessionId, storeAddTrial]
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const last = stack[0];
      if (!last) return stack;
      setTrials((t) => t.filter((x) => x.at !== last.at));
      return stack.slice(1);
    });
  }, []);

  /* ─── ABC entry ─────────────────────────────────────────────────────────── */

  const addAbcEntry = useCallback(() => {
    if (!abcForm.behavior.trim()) {
      toast.warning("Please describe the behavior.");
      return;
    }
    const now = Date.now();
    const entry: AbcEntry = { ...abcForm, at: now };
    setAbcEntries((prev) => [...prev, entry]);
    // Persist to store immediately
    if (storeLocalSessionId) {
      storeAddABC(storeLocalSessionId, {
        antecedent: abcForm.antecedent,
        behavior: abcForm.behavior,
        consequence: abcForm.consequence,
        intensity: abcForm.intensity as import("@/store/abaStore").ActiveABCEntry["intensity"],
        recordedAt: now,
      });
    }
    // Queue offline
    if (sessionId) {
      queueBehavior({
        sessionId,
        type: "ABC",
        antecedent: abcForm.antecedent,
        behavior: abcForm.behavior,
        consequence: abcForm.consequence,
        intensity: abcForm.intensity,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }
    setAbcForm({ antecedent: "", behavior: "", consequence: "", intensity: "mild" });
    setShowAbcForm(false);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
    toast.success("ABC entry recorded.");
  }, [abcForm, sessionId, storeLocalSessionId, storeAddABC]);

  /* ─── Save ──────────────────────────────────────────────────────────────── */

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session ID");

      // Always mark session as ended
      const endedAt = new Date().toISOString();
      const patchPromise = fetch(`/smart-steps/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt }),
      }).catch(() => {}); // non-fatal

      // Save DTT trials
      const trialsPromise = trials.length > 0
        ? postTrials(sessionId, trials.map((t) => ({
            targetId: t.targetId,
            result: t.result,
            promptLevel: t.promptLevel,
            latencyMs: t.latencyMs,
          }))).catch((e: unknown) => { throw e; })
        : Promise.resolve({});

      // Save ABC events to database
      const abcPromise = abcEntries.length > 0
        ? fetch("/smart-steps/api/behaviors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              events: abcEntries.map((e) => ({
                type: "ABC",
                antecedent: e.antecedent,
                behavior: e.behavior,
                consequence: e.consequence,
                intensity: e.intensity,
              })),
            }),
          }).catch(() => {})
        : Promise.resolve();

      await Promise.all([patchPromise, trialsPromise, abcPromise]);
      return { trials: trials.length, abc: abcEntries.length };
    },
    onSuccess: (data) => {
      // Mark as saved in store + clear active session
      if (storeLocalSessionId) storeMarkSaved(storeLocalSessionId);
      storeClear();

      // Bust all relevant caches so client page shows fresh data immediately
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.removeQueries({ queryKey: ["client", clientId] });
      queryClient.removeQueries({ queryKey: ["sessions", clientId] });
      queryClient.removeQueries({ queryKey: ["sessions-list", clientId] });

      const parts: string[] = [];
      if (data && typeof data === "object" && "trials" in data && Number(data.trials) > 0)
        parts.push(`${data.trials} trial${Number(data.trials) !== 1 ? "s" : ""}`);
      if (data && typeof data === "object" && "abc" in data && Number(data.abc) > 0)
        parts.push(`${data.abc} ABC event${Number(data.abc) !== 1 ? "s" : ""}`);

      toast.success(`Session saved! ${parts.length > 0 ? `(${parts.join(", ")})` : ""}`, {
        duration: 2500,
      });

      // Redirect to client profile → Sessions tab after a short delay so toast is visible
      setTimeout(() => {
        router.push(`/clients/${clientId}?tab=sessions`);
      }, 1500);
    },
    onError: (e) => {
      // Data is already in the store (localStorage) — it won't be lost
      toast.error(`Server unreachable — data saved locally, will sync when online.`, {
        duration: 4000,
        description: String(e),
      });
      // Also queue to Dexie
      if (sessionId) {
        trials.forEach((t) => queueTrial({
          sessionId: sessionId!,
          targetId: t.targetId,
          result: t.result,
          promptLevel: t.promptLevel,
          latencyMs: t.latencyMs,
          createdAt: new Date(t.at).toISOString(),
        }).catch(() => {}));
      }
    },
  });

  const recordToOffline = useCallback(async () => {
    if (!sessionId) return;
    for (const t of trials) {
      await queueTrial({
        sessionId,
        targetId: t.targetId,
        result: t.result,
        promptLevel: t.promptLevel,
        latencyMs: t.latencyMs,
        createdAt: new Date(t.at).toISOString(),
      });
    }
    toast.success("Queued for offline sync.");
  }, [sessionId, trials]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  /* ─── Counters for this session ─────────────────────────────────────────── */

  const correctCount = trials.filter((t) => t.result === "CORRECT" && t.targetId === currentTarget?.id).length;
  const totalCount = trials.filter((t) => t.targetId === currentTarget?.id).length;
  const pct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : null;

  /* ─── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-dvh bg-[var(--background)] pb-safe">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--glass-border)] bg-[var(--background)]/90 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href={`/clients/${clientId}`}
            className="tap-target rounded-xl p-2 text-zinc-400 hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="tap-target flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-[var(--accent-cyan)]"
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {isPaused ? "Resume" : "Pause"}
            </button>
            <div className="flex items-center gap-1.5 rounded-xl bg-[var(--glass-bg)] px-3 py-1.5">
              <Timer className="h-4 w-4 text-zinc-500" />
              <span className="font-mono text-lg font-semibold tabular-nums text-[var(--foreground)]">
                {formatTime(elapsedSec)}
              </span>
            </div>
          </div>

          <div className="w-10" />
        </div>

        {/* Mode tabs */}
        <div className="flex gap-0.5 px-4 pb-3">
          {(["DTT", "INTERVAL", "ABC"] as RecordingMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`tap-target flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
                mode === m
                  ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {m === "DTT" ? "Discrete Trial" : m === "INTERVAL" ? "Interval" : "ABC"}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {/* No targets state */}
        {hasNoTargets && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-300 font-medium">No active targets found</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Create goals &amp; targets for this client first, then return to record session data.
            </p>
            <Link
              href={`/clients/${clientId}/goals`}
              className="mt-2 inline-block text-xs text-amber-300 underline"
            >
              Go to Goals &amp; Targets &rarr;
            </Link>
          </div>
        )}

        {/* Target picker button */}
        {!hasNoTargets && mode === "DTT" && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowTargetPicker(true)}
              className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-sm text-left text-zinc-400 hover:text-[var(--foreground)] hover:border-[var(--accent-cyan)]/40 transition-colors"
            >
              {currentTarget
                ? <span className="text-[var(--foreground)]">Target: {currentTarget.definition.length > 45 ? currentTarget.definition.slice(0, 43) + "…" : currentTarget.definition}</span>
                : "Select a target…"
              }
              {" "}<span className="text-zinc-600">({targets.length} available)</span>
            </button>
          </div>
        )}

        {/* Target picker modal */}
        <AnimatePresence>
          {showTargetPicker && (
            <motion.div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTargetPicker(false)}
            >
              <motion.div
                className="w-full max-w-lg rounded-t-3xl bg-[var(--background)] border-t border-[var(--glass-border)] p-4 pb-8 max-h-[80vh] overflow-y-auto"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold text-[var(--foreground)]">Select target</h2>
                  <button type="button" onClick={() => setShowTargetPicker(false)} className="text-zinc-500 hover:text-[var(--foreground)]">✕</button>
                </div>
                <div className="space-y-4">
                  {(targetData?.groups ?? []).map((group) => (
                    <div key={group.groupId}>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 px-1">
                        {group.groupType === "goal" ? "Goal: " : "Program: "}{group.groupLabel}
                        {group.domain && ` · ${group.domain}`}
                      </p>
                      <div className="space-y-1.5">
                        {group.targets.map((t) => {
                          const globalIdx = targets.findIndex((x) => x.id === t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setSelectedTargetIndex(globalIdx >= 0 ? globalIdx : 0);
                                setShowTargetPicker(false);
                                setShowPromptLevel(false);
                              }}
                              className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-all ${
                                globalIdx === selectedTargetIndex
                                  ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/40"
                                  : "bg-[var(--glass-bg)] text-[var(--foreground)] hover:bg-[var(--glass-border)]"
                              }`}
                            >
                              <span className="block font-medium">{t.definition}</span>
                              <span className="text-xs text-zinc-500">
                                {t.subGoalTitle && `${t.subGoalTitle} · `}{t.phase}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── DTT Mode ─────────────────────────────────────────────────────── */}
        {mode === "DTT" && (
          <>
            {/* Target carousel */}
            <div className="mb-5 flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
              {targets.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setSelectedTargetIndex(i); setShowPromptLevel(false); }}
                  className={`tap-target shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    i === selectedTargetIndex
                      ? "bg-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] ring-1 ring-[var(--accent-cyan)]/50"
                      : "bg-[var(--glass-bg)] text-zinc-400 hover:text-[var(--foreground)]"
                  }`}
                >
                  {t.definition.length > 20 ? t.definition.slice(0, 18) + "…" : t.definition}
                </button>
              ))}
            </div>

            {/* Current target info */}
            <motion.div
              key={currentTarget?.id}
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mb-2 rounded-2xl bg-[var(--glass-bg)] p-4 text-center"
            >
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Current target</p>
              <p className="text-lg font-bold text-[var(--foreground)]">{currentTarget?.definition}</p>
              {pct !== null && (
                <p className="mt-1 text-sm text-[var(--accent-cyan)]">{pct}% correct this session</p>
              )}
            </motion.div>

            {/* Trial counters */}
            <div className="mb-6 grid grid-cols-4 gap-2 text-center">
              {TRIAL_RESULTS.map((r) => {
                const cnt = trials.filter((t) => t.targetId === currentTarget?.id && t.result === r.key).length;
                return (
                  <div key={r.key} className="rounded-xl bg-[var(--glass-bg)] py-2">
                    <div className="text-xs" style={{ color: r.color }}>{r.short}</div>
                    <div className="text-lg font-bold tabular-nums" style={{ color: r.color }}>{cnt}</div>
                  </div>
                );
              })}
            </div>

            {/* Big trial buttons */}
            <div className="grid grid-cols-2 gap-4">
              <AnimatePresence mode="wait">
                {!showPromptLevel ? (
                  TRIAL_RESULTS.map((r) => (
                    <motion.button
                      key={r.key}
                      type="button"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.94 }}
                      onClick={() =>
                        r.key === "PROMPTED" ? setShowPromptLevel(true) : addTrial(r.key as TrialResult)
                      }
                      className="tap-target flex min-h-[80px] flex-col items-center justify-center rounded-2xl border-2 text-[var(--foreground)] transition-all"
                      style={{
                        background: `linear-gradient(135deg, ${r.color}22, ${r.color}06)`,
                        borderColor: `color-mix(in srgb, ${r.color} 35%, transparent)`,
                      }}
                    >
                      <span className="text-3xl">{r.emoji}</span>
                      <span className="mt-1 text-sm font-semibold">{r.label}</span>
                    </motion.button>
                  ))
                ) : (
                  <motion.div
                    key="prompt-levels"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="col-span-2 grid grid-cols-2 gap-2"
                  >
                    <p className="col-span-2 text-center text-xs text-zinc-500 mb-1">Select prompt level</p>
                    {PROMPT_LEVELS.map((level) => (
                      <motion.button
                        key={level}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => addTrial("PROMPTED", level)}
                        className="tap-target rounded-xl bg-[var(--accent-purple)]/20 py-3 text-xs font-medium text-[var(--accent-purple)]"
                      >
                        {level.replace(/_/g, " ")}
                      </motion.button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowPromptLevel(false)}
                      className="col-span-2 tap-target rounded-xl bg-[var(--glass-bg)] py-2.5 text-sm text-zinc-400"
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Undo */}
            {undoStack.length > 0 && (
              <div className="mt-5 flex items-center justify-between rounded-xl bg-[var(--glass-bg)] px-4 py-2.5">
                <p className="text-xs text-zinc-500 truncate">
                  Last: <span className="text-zinc-300">{undoStack[0]?.targetLabel}</span> → {undoStack[0]?.result}
                </p>
                <button
                  type="button"
                  onClick={undo}
                  className="tap-target ml-3 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10"
                >
                  Undo
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Interval Mode ─────────────────────────────────────────────────── */}
        {mode === "INTERVAL" && (
          <div className="space-y-5">
            {/* Type selector */}
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Recording type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INTERVAL_TYPES.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => setIntervalType(it.key)}
                    className={`tap-target rounded-xl py-2.5 text-xs font-medium transition-all ${
                      intervalType === it.key
                        ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                        : "bg-[var(--glass-bg)] text-zinc-400"
                    }`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration control */}
            <div className="glass-card rounded-2xl p-4">
              <p className="mb-3 text-xs uppercase tracking-wider text-zinc-500">Interval duration</p>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIntervalDuration((d) => Math.max(5, d - 5))}
                  className="tap-target rounded-xl bg-[var(--glass-bg)] p-3"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-3xl font-bold tabular-nums text-[var(--foreground)]">{intervalDuration}s</span>
                <button
                  type="button"
                  onClick={() => setIntervalDuration((d) => Math.min(300, d + 5))}
                  className="tap-target rounded-xl bg-[var(--glass-bg)] p-3"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Interval timer display */}
            {isIntervalRunning && (
              <div className="glass-card rounded-2xl p-6 text-center">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Next interval in</p>
                <div className="text-5xl font-bold tabular-nums text-[var(--accent-cyan)]">{intervalTimeLeft}s</div>
                <div className="mt-3 h-2 rounded-full bg-[var(--glass-border)]">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] transition-all"
                    style={{ width: `${((intervalDuration - intervalTimeLeft) / intervalDuration) * 100}%` }}
                  />
                </div>
                <p className="mt-3 text-zinc-400">Interval #{intervalCount + 1}</p>
              </div>
            )}

            {/* Start/stop interval + behavior counter */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setIsIntervalRunning((r) => !r)}
                className={`tap-target flex min-h-[72px] flex-col items-center justify-center rounded-2xl font-semibold transition-all ${
                  isIntervalRunning
                    ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                    : "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                }`}
              >
                {isIntervalRunning ? <><RefreshCcw className="h-6 w-6 mb-1" />Stop timer</> : <><Timer className="h-6 w-6 mb-1" />Start timer</>}
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => {
                  setBehaviorCount((c) => c + 1);
                  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
                }}
                className="tap-target flex min-h-[72px] flex-col items-center justify-center rounded-2xl bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
              >
                <span className="text-3xl font-bold">{behaviorCount}</span>
                <span className="text-xs font-semibold mt-1">Tap to record</span>
              </motion.button>
            </div>

            <p className="text-center text-xs text-zinc-500">
              {intervalType} recording · {intervalCount} intervals completed
            </p>
          </div>
        )}

        {/* ── ABC Mode ──────────────────────────────────────────────────────── */}
        {mode === "ABC" && (
          <div className="space-y-5">
            {/* Quick-record button */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowAbcForm(true)}
              className="tap-target w-full rounded-2xl bg-[var(--accent-pink)]/20 py-5 text-center text-[var(--accent-pink)]"
            >
              <Plus className="mx-auto mb-1 h-8 w-8" />
              <span className="font-semibold">Record behavior event</span>
            </motion.button>

            {/* ABC form */}
            <AnimatePresence>
              {showAbcForm && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="glass-card rounded-2xl p-5 space-y-4"
                >
                  <h3 className="font-semibold text-[var(--foreground)]">ABC entry</h3>
                  {[
                    { key: "antecedent", label: "Antecedent (what happened before)", placeholder: "Demand presented, transition, peer approach…" },
                    { key: "behavior", label: "Behavior *", placeholder: "Screaming, hitting, running away…" },
                    { key: "consequence", label: "Consequence (what happened after)", placeholder: "Escape, attention, item provided…" },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-xs text-zinc-400">{f.label}</label>
                      <input
                        type="text"
                        value={abcForm[f.key as keyof typeof abcForm]}
                        onChange={(e) => setAbcForm({ ...abcForm, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-zinc-600"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">Intensity</label>
                    <div className="flex gap-2">
                      {INTENSITIES.map((intensity) => (
                        <button
                          key={intensity}
                          type="button"
                          onClick={() => setAbcForm({ ...abcForm, intensity })}
                          className={`tap-target flex-1 rounded-xl py-2 text-xs font-medium capitalize transition-all ${
                            abcForm.intensity === intensity
                              ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                              : "bg-[var(--glass-bg)] text-zinc-400"
                          }`}
                        >
                          {intensity}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAbcForm(false)}
                      className="tap-target flex-1 rounded-xl border border-[var(--glass-border)] py-2.5 text-sm text-zinc-400"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addAbcEntry}
                      className="btn-primary tap-target flex-1 rounded-xl py-2.5 text-sm"
                    >
                      Record
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ABC timeline */}
            {abcEntries.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Session timeline</p>
                <div className="space-y-2">
                  {[...abcEntries].reverse().map((e, i) => (
                    <motion.div
                      key={e.at}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="rounded-xl bg-[var(--glass-bg)] p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5 text-xs">
                          {e.antecedent && <p><span className="text-zinc-500">A: </span>{e.antecedent}</p>}
                          <p><span className="text-zinc-500">B: </span><span className="text-[var(--foreground)] font-medium">{e.behavior}</span></p>
                          {e.consequence && <p><span className="text-zinc-500">C: </span>{e.consequence}</p>}
                        </div>
                        <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${
                          e.intensity === "severe" || e.intensity === "extreme"
                            ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                            : "bg-zinc-700/60 text-zinc-400"
                        }`}>
                          {e.intensity}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Save bar (always visible) ─────────────────────────────────────── */}
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={recordToOffline}
            className="tap-target flex items-center justify-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-sm text-zinc-400 hover:text-[var(--foreground)]"
          >
            <CloudOff className="h-4 w-4" />
            Offline
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (mode === "DTT" && trials.length === 0)}
            className="btn-primary tap-target flex-1 flex items-center justify-center gap-2 rounded-xl py-3 font-bold text-base disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Saving…" : "Save & End Session"}
          </button>
        </div>

        <p className="mt-2 text-center text-xs text-zinc-600">
          {mode === "DTT" && `${trials.length} trial${trials.length !== 1 ? "s" : ""} · `}
          {mode === "ABC" && `${abcEntries.length} ABC event${abcEntries.length !== 1 ? "s" : ""} · `}
          {mode === "INTERVAL" && `${intervalCount} intervals · `}
          {formatTime(elapsedSec)} elapsed
          {storeLocalSessionId && (
            <span className="ml-1 text-emerald-500">· auto-saved locally ✓</span>
          )}
        </p>
      </main>
    </div>
  );
}
