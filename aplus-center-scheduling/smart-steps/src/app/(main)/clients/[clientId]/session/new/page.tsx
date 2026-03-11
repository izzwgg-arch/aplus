"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/dexie";

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

type TrialEntry = {
  targetId: string;
  targetLabel: string;
  result: (typeof TRIAL_RESULTS)[number]["key"];
  promptLevel?: (typeof PROMPT_LEVELS)[number];
  latencyMs?: number;
  at: number;
};

// Mock targets for this client
function getMockTargets() {
  return [
    { id: "t1", label: "Touch nose" },
    { id: "t2", label: "Point to blue" },
    { id: "t3", label: "Say 'more'" },
  ];
}

async function postTrials(sessionId: string, trials: { targetId: string; result: string; promptLevel?: string; latencyMs?: number }[]) {
  const res = await fetch("/api/trials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, trials }),
  });
  if (!res.ok) throw new Error("Failed to save trials");
  return res.json();
}

const MAX_UNDO = 5;

export default function SessionNewPage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [selectedTargetIndex, setSelectedTargetIndex] = useState(0);
  const [trials, setTrials] = useState<TrialEntry[]>([]);
  const [undoStack, setUndoStack] = useState<TrialEntry[]>([]);
  const [showPromptLevel, setShowPromptLevel] = useState(false);
  const [behaviorCount, setBehaviorCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targets = getMockTargets();
  const currentTarget = targets[selectedTargetIndex];

  const createSession = useCallback(async () => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, userId: "mock-user-1" }),
    });
    const data = await res.json().catch(() => ({}));
    setSessionId(data?.id ?? `local-${Date.now()}`);
    setStartedAt(new Date());
  }, [clientId]);

  useEffect(() => {
    if (!sessionId) createSession();
  }, [sessionId, createSession]);

  useEffect(() => {
    if (!startedAt || isPaused) return;
    setElapsedSec(0);
    timerRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startedAt, isPaused]);

  const addTrial = useCallback(
    (result: (typeof TRIAL_RESULTS)[number]["key"], promptLevel?: (typeof PROMPT_LEVELS)[number]) => {
      if (!currentTarget) return;
      const entry: TrialEntry = {
        targetId: currentTarget.id,
        targetLabel: currentTarget.label,
        result,
        promptLevel,
        at: Date.now(),
      };
      setTrials((prev) => {
        const next = [...prev, entry];
        setUndoStack((u) => [entry, ...u].slice(0, MAX_UNDO));
        return next;
      });
      setShowPromptLevel(false);
      // Haptic if available
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    },
    [currentTarget]
  );

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const last = stack[0];
      if (!last) return stack;
      setTrials((t) => t.filter((x) => x.at !== last.at));
      return stack.slice(1);
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId || trials.length === 0) return {};
      const payload = trials.map((t) => ({
        targetId: t.targetId,
        result: t.result,
        promptLevel: t.promptLevel,
        latencyMs: t.latencyMs,
      }));
      return postTrials(sessionId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
    },
  });

  const recordToOffline = useCallback(async () => {
    if (!sessionId) return;
    const payload = trials.map((t) => ({
      sessionId,
      targetId: t.targetId,
      result: t.result,
      promptLevel: t.promptLevel ?? undefined,
      latencyMs: t.latencyMs,
      createdAt: new Date(t.at).toISOString(),
      synced: false,
    }));
    for (const p of payload) {
      await db.syncQueue.add({ table: "trials", payload: p, createdAt: new Date().toISOString() });
    }
  }, [sessionId, trials]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-dvh bg-[var(--background)] pb-safe">
      <header className="sticky top-0 z-10 border-b border-[var(--glass-border)] bg-[var(--background)]/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href={`/clients/${clientId}`}
            className="tap-target rounded-xl p-2 text-zinc-400 hover:text-[var(--foreground)]"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="tap-target rounded-xl px-3 py-2 text-sm font-medium text-[var(--accent-cyan)]"
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <span className="font-mono text-lg tabular-nums text-[var(--foreground)]">
              {formatTime(elapsedSec)}
            </span>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {/* Target carousel */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {targets.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTargetIndex(i)}
              className={`tap-target shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                i === selectedTargetIndex
                  ? "bg-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] ring-1 ring-[var(--accent-cyan)]/50"
                  : "bg-[var(--glass-bg)] text-zinc-400 hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mb-4 text-center text-xs uppercase tracking-wider text-zinc-500">
          Current target
        </p>
        <motion.p
          key={currentTarget?.id}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-8 text-center text-xl font-bold text-[var(--foreground)]"
        >
          {currentTarget?.label}
        </motion.p>

        {/* Trial buttons — big, one-handed */}
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="wait">
            {!showPromptLevel ? (
              TRIAL_RESULTS.map((r) => (
                <motion.button
                  key={r.key}
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() =>
                    r.key === "PROMPTED" ? setShowPromptLevel(true) : addTrial(r.key)
                  }
                  className="tap-target flex min-h-[72px] flex-col items-center justify-center rounded-2xl border-2 border-[var(--glass-border)] text-[var(--foreground)] transition-all active:opacity-90"
                  style={{
                    background: `linear-gradient(135deg, ${r.color}22, ${r.color}08)`,
                    borderColor: `color-mix(in srgb, ${r.color} 40%, transparent)`,
                  }}
                >
                  <span className="text-2xl">{r.emoji}</span>
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
                {PROMPT_LEVELS.map((level) => (
                  <motion.button
                    key={level}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => addTrial("PROMPTED", level)}
                    className="tap-target rounded-xl bg-[var(--accent-purple)]/20 py-3 text-sm font-medium text-[var(--accent-purple)]"
                  >
                    {level.replace(/_/g, " ")}
                  </motion.button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowPromptLevel(false)}
                  className="col-span-2 tap-target rounded-xl bg-[var(--glass-bg)] py-2 text-sm text-zinc-400"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Behavior tap counter */}
        <div className="mt-8">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Behavior count</p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setBehaviorCount((c) => c + 1);
              if (navigator.vibrate) navigator.vibrate(15);
            }}
            className="tap-target w-full rounded-2xl bg-[var(--accent-pink)]/20 py-4 text-2xl font-bold text-[var(--accent-pink)]"
          >
            +1 · Total: {behaviorCount}
          </motion.button>
        </div>

        {/* Undo */}
        {undoStack.length > 0 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-zinc-500">Last entry: {undoStack[0]?.targetLabel} → {undoStack[0]?.result}</p>
            <button
              type="button"
              onClick={undo}
              className="tap-target rounded-xl bg-[var(--glass-bg)] px-4 py-2 text-sm font-medium text-[var(--foreground)]"
            >
              Undo
            </button>
          </div>
        )}

        {/* Save / sync */}
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => recordToOffline()}
            className="btn-ghost tap-target flex-1 rounded-xl border border-[var(--glass-border)] py-3"
          >
            Queue offline
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || trials.length === 0}
            className="btn-primary tap-target flex-1 rounded-xl py-3 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save session"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Trials this session: {trials.length}
        </p>
      </main>
    </div>
  );
}
