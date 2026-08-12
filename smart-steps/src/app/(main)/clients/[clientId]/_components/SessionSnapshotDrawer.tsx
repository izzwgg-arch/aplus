"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Clock, Target as TargetIcon, X, FileText, Sparkles,
  ChevronDown, ChevronUp, Pencil, Trash2, Check, AlertTriangle, CalendarClock,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/* ─── Types ────────────────────────────────────────────────────────────────── */

type SessionTargetSummary = {
  targetId: string;
  targetTitle: string;
  targetType: string;
  phase: string;
  parentGoalId: string | null;
  parentGoalTitle: string | null;
  subGoalId: string | null;
  subGoalTitle: string | null;
  programId: string | null;
  programName: string | null;
  providerId: string | null;
  providerName: string | null;
  sessionKind: string;
  trialCount: number;
  correctCount: number;
  promptedCount: number;
  incorrectCount: number;
  noResponseCount: number;
  maintenanceCount: number;
  promptCodes: Record<string, number>;
  notes: string[];
  percentage: number;
};

type TrialRecord = {
  id: string;
  targetId: string;
  result: string;
  promptLevel: string | null;
  latencyMs: number | null;
  notes: string | null;
  createdAt: string;
  target: {
    id: string;
    definition: string;
    targetType: string;
    phase: string;
  };
};

type SessionDetail = {
  id: string;
  clientId: string;
  userId: string | null;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  notes: string | null;
  voiceNotes: string | null;
  user?: { id?: string | null; name?: string | null; email?: string | null } | null;
  trialCount: number;
  trials: TrialRecord[];
  sessionTargets: SessionTargetSummary[];
};

/* ─── Result badge ─────────────────────────────────────────────────────────── */

const RESULT_STYLES: Record<string, { label: string; className: string }> = {
  CORRECT:     { label: "Correct",     className: "bg-emerald-500/20 text-emerald-300" },
  INDEPENDENT: { label: "Independent", className: "bg-emerald-500/20 text-emerald-300" },
  INCORRECT:   { label: "Incorrect",   className: "bg-rose-500/20 text-rose-300" },
  PROMPTED:    { label: "Prompted",    className: "bg-purple-500/20 text-purple-300" },
  NO_RESPONSE: { label: "No Response", className: "bg-zinc-500/20 text-zinc-400" },
};

function ResultBadge({ result }: { result: string }) {
  const style = RESULT_STYLES[result] ?? { label: result, className: "bg-zinc-500/20 text-zinc-400" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}

/* ─── Trial edit modal ─────────────────────────────────────────────────────── */

const RESULTS = ["CORRECT", "INCORRECT", "PROMPTED", "NO_RESPONSE"] as const;
const PROMPT_LEVELS = ["FULL_PHYSICAL", "PARTIAL_PHYSICAL", "GESTURAL", "VERBAL", "MODEL", "INDEPENDENT"] as const;

function TrialEditModal({
  trial,
  onSave,
  onCancel,
}: {
  trial: TrialRecord;
  onSave: (result: string, promptLevel: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [result, setResult]           = useState(trial.result);
  const [promptLevel, setPromptLevel] = useState<string>(trial.promptLevel ?? "");
  const [saving, setSaving]           = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(result, promptLevel || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="rounded-2xl border border-[var(--glass-border)] bg-[var(--background)] p-4 space-y-3 shadow-xl"
    >
      <div className="text-sm font-semibold text-zinc-200">Edit Trial</div>
      <div className="text-xs text-zinc-500 truncate">{trial.target.definition}</div>

      {/* Result picker */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Result</div>
        <div className="grid grid-cols-2 gap-1.5">
          {RESULTS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResult(r)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                result === r
                  ? "bg-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] ring-1 ring-[var(--accent-cyan)]/50"
                  : "bg-[var(--glass-bg)] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {r.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt level (shown when PROMPTED) */}
      {result === "PROMPTED" && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1.5">Prompt Level</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PROMPT_LEVELS.map((pl) => (
              <button
                key={pl}
                type="button"
                onClick={() => setPromptLevel(pl)}
                className={`rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all ${
                  promptLevel === pl
                    ? "bg-[var(--accent-purple)]/30 text-[var(--accent-purple)]"
                    : "bg-[var(--glass-bg)] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {pl.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-[var(--glass-border)] py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-cyan)]/20 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 disabled:opacity-60 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Duration formatting ──────────────────────────────────────────────────── */

/**
 * Human-readable session duration. Guards against implausible values (e.g. a
 * session left open, or a bad end timestamp) so the UI never shows a runaway
 * minute count like "22,458 minutes".
 */
function formatSessionDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "In progress";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60000);
  // A single clinical session realistically caps out around 8 hours; anything
  // beyond that indicates bad data, so we avoid displaying a misleading number.
  if (minutes > 8 * 60) return "—";
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rem   = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

/* ─── Session edit helpers ─────────────────────────────────────────────────── */

type ProviderOption = { id: string; name: string | null; role: string; displayRole: string | null };

/** ISO → "YYYY-MM-DD" in local time (for <input type="date">). */
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y   = d.getFullYear();
  const mth = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mth}-${day}`;
}

/** ISO → "HH:mm" in local time (for <input type="time">). */
function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combines a local date ("YYYY-MM-DD") and time ("HH:mm") into an ISO string. */
function combineToIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const dt = new Date(`${dateStr}T${timeStr}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/* ─── Main component ────────────────────────────────────────────────────────── */

export function SessionSnapshotDrawer({
  sessionId,
  onClose,
  onNoteGenerated,
}: {
  sessionId: string | null;
  onClose: () => void;
  onNoteGenerated?: () => void;
}) {
  const qc = useQueryClient();
  const [generating, setGenerating]   = useState(false);
  const [showTrials, setShowTrials]   = useState(false);
  const [editingTrial, setEditingTrial] = useState<TrialRecord | null>(null);
  const [deletingTrialId, setDeletingTrialId] = useState<string | null>(null);

  // Session-header editing (date / time in / time out / provider)
  const [editingSession, setEditingSession] = useState(false);
  const [savingSession, setSavingSession]   = useState(false);
  const [sessForm, setSessForm] = useState({ date: "", timeIn: "", timeOut: "", providerId: "" });

  async function handleGenerateNote() {
    if (!sessionId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/smart-steps/api/sessions/${sessionId}/generate-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to generate note");
      }
      toast.success("BT Session Note generated — open the Notes tab to view and edit it.");
      onNoteGenerated?.();
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleEditTrial(trial: TrialRecord, result: string, promptLevel: string | null) {
    try {
      const res = await fetch(`/smart-steps/api/trials/${trial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, promptLevel }),
      });
      if (!res.ok) throw new Error("Failed to update trial");
      toast.success("Trial updated");
      setEditingTrial(null);
      qc.invalidateQueries({ queryKey: ["session-snapshot", sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function handleDeleteTrial(trialId: string) {
    setDeletingTrialId(trialId);
    try {
      const res = await fetch(`/smart-steps/api/trials/${trialId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete trial");
      toast.success("Trial removed");
      qc.invalidateQueries({ queryKey: ["session-snapshot", sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeletingTrialId(null);
    }
  }

  const { data, isLoading } = useQuery<SessionDetail>({
    queryKey: ["session-snapshot", sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error("Missing session id");
      const res = await fetch(`/smart-steps/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Failed to load session snapshot");
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: 30_000,
  });

  // Provider list for the session-edit selector (active staff, any role).
  const { data: providers = [] } = useQuery<ProviderOption[]>({
    queryKey: ["providers-dropdown"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/users?forDropdown=1");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  // Reset the edit panel whenever a different session is opened.
  useEffect(() => {
    setEditingSession(false);
  }, [sessionId]);

  function startEditSession() {
    if (!data) return;
    setSessForm({
      date:       toDateInputValue(data.startedAt),
      timeIn:     toTimeInputValue(data.startedAt),
      timeOut:    toTimeInputValue(data.endedAt),
      providerId: data.user?.id ?? data.userId ?? "",
    });
    setEditingSession(true);
  }

  async function handleSaveSession() {
    if (!sessionId || !data) return;

    if (!sessForm.date || !sessForm.timeIn) {
      toast.error("Session date and time in are required.");
      return;
    }
    const startedAt = combineToIso(sessForm.date, sessForm.timeIn);
    if (!startedAt) {
      toast.error("Invalid session date or time in.");
      return;
    }
    // Time out is optional (session may still be in progress); when provided it
    // must be after time in on the same service date.
    let endedAt: string | undefined;
    if (sessForm.timeOut) {
      const iso = combineToIso(sessForm.date, sessForm.timeOut);
      if (!iso) { toast.error("Invalid time out."); return; }
      if (new Date(iso).getTime() <= new Date(startedAt).getTime()) {
        toast.error("Time out must be after time in.");
        return;
      }
      endedAt = iso;
    }

    setSavingSession(true);
    try {
      const res = await fetch(`/smart-steps/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt,
          ...(endedAt ? { endedAt } : {}),
          ...(sessForm.providerId ? { providerId: sessForm.providerId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to update session");
      }
      toast.success("Session updated");
      setEditingSession(false);
      qc.invalidateQueries({ queryKey: ["session-snapshot", sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["client-schedule"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSession(false);
    }
  }

  // Backdated badge: service date differs from when the record was created
  const isBackdated = data
    ? new Date(data.startedAt).toDateString() !== new Date(data.createdAt).toDateString()
    : false;

  return (
    <AnimatePresence>
      {sessionId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
        >
          <motion.div
            initial={{ x: 360 }}
            animate={{ x: 0 }}
            exit={{ x: 360 }}
            className="flex h-full w-full max-w-2xl flex-col border-l border-[var(--glass-border)] bg-[var(--background)]/95"
          >
            {/* ── Header ── */}
            <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-5 py-4">
              <div className="rounded-xl bg-[var(--accent-cyan)]/10 p-2 text-[var(--accent-cyan)]">
                <Activity className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-semibold text-[var(--foreground)]">Session Snapshot</div>
                  {isBackdated && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      Backdated Entry
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
                  {data ? (
                    <>
                      Service date:{" "}
                      <span className="text-zinc-300">
                        {new Date(data.startedAt).toLocaleString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                          year: "numeric", hour: "numeric", minute: "2-digit",
                        })}
                      </span>
                      {isBackdated && (
                        <> · Entered: {new Date(data.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>
                      )}
                    </>
                  ) : (
                    "Loading session details…"
                  )}
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto p-5">
              {isLoading || !data ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="h-24 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20" />
                  ))}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* ── Session details header + edit toggle ── */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Session Details</div>
                    {!editingSession && (
                      <button
                        type="button"
                        onClick={startEditSession}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-border)] px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit date / time / provider
                      </button>
                    )}
                  </div>

                  {/* ── Edit session panel ── */}
                  <AnimatePresence>
                    {editingSession && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 rounded-2xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/[0.04] p-4">
                          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-cyan)]">
                            <CalendarClock className="h-4 w-4" />
                            Edit Session
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-[11px] text-zinc-400">Session Date</label>
                              <input
                                type="date"
                                value={sessForm.date}
                                onChange={(e) => setSessForm((f) => ({ ...f, date: e.target.value }))}
                                className="field-input w-full text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-zinc-400">Time In</label>
                              <input
                                type="time"
                                value={sessForm.timeIn}
                                onChange={(e) => setSessForm((f) => ({ ...f, timeIn: e.target.value }))}
                                className="field-input w-full text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-zinc-400">Time Out</label>
                              <input
                                type="time"
                                value={sessForm.timeOut}
                                onChange={(e) => setSessForm((f) => ({ ...f, timeOut: e.target.value }))}
                                className="field-input w-full text-sm"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] text-zinc-400">Provider</label>
                            <select
                              value={sessForm.providerId}
                              onChange={(e) => setSessForm((f) => ({ ...f, providerId: e.target.value }))}
                              className="field-input w-full text-sm"
                            >
                              <option value="">— Select provider —</option>
                              {providers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name || "(no name)"}{p.displayRole ? ` · ${p.displayRole}` : ` · ${p.role}`}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-[11px] leading-relaxed text-zinc-500">
                            Updating these fields edits this session in place — trials, notes, behaviors, and reports are preserved. No duplicate session is created.
                          </p>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingSession(false)}
                              disabled={savingSession}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-border)] px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/5 disabled:opacity-50 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveSession}
                              disabled={savingSession}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 disabled:opacity-60 transition-colors"
                            >
                              {savingSession
                                ? <><Sparkles className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                                : <><Check className="h-3.5 w-3.5" /> Save Changes</>}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Metadata cards ── */}
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      { label: "Mode",     value: data.mode },
                      { label: "Provider", value: data.user?.name || "—" },
                      { label: "Trials",   value: String(data.trialCount) },
                      {
                        label: "Duration",
                        value: formatSessionDuration(data.startedAt, data.endedAt),
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-zinc-500">{item.label}</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-200">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── Audit info ── */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-zinc-500">Service Date</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-200">
                        {new Date(data.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-3">
                      <div className="text-[11px] uppercase tracking-wide text-zinc-500">Record Created</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-200">
                        {new Date(data.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>

                  {/* ── Session notes ── */}
                  {(data.notes || data.voiceNotes) && (
                    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Session Notes</div>
                      {data.notes && <div className="mt-2 text-sm text-zinc-200">{data.notes}</div>}
                      {data.voiceNotes && <div className="mt-2 text-sm text-zinc-400">{data.voiceNotes}</div>}
                    </div>
                  )}

                  {/* ── Goals Worked ── */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goals Worked</div>
                    {data.sessionTargets.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--glass-border)] p-6 text-sm text-zinc-500">
                        No target-level work was recorded for this session.
                      </div>
                    ) : (
                      data.sessionTargets.map((item) => (
                        <div key={item.targetId} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-[var(--accent-cyan)]/10 p-2 text-[var(--accent-cyan)]">
                              <TargetIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-zinc-100">{item.targetTitle}</div>
                                  <div className="text-xs text-zinc-500">
                                    {item.parentGoalTitle || item.programName || "Unassigned"}{item.subGoalTitle ? ` / ${item.subGoalTitle}` : ""}
                                  </div>
                                </div>
                                <div className={`text-sm font-bold ${item.percentage >= 80 ? "text-emerald-300" : item.percentage >= 60 ? "text-amber-300" : "text-rose-300"}`}>
                                  {item.percentage}%
                                </div>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-4">
                                <div><span className="text-zinc-500">Trials:</span> {item.trialCount}</div>
                                <div><span className="text-zinc-500">Prompts:</span> {Object.keys(item.promptCodes).join(", ") || "Independent"}</div>
                                <div><span className="text-zinc-500">Therapist:</span> {item.providerName || "—"}</div>
                                <div><span className="text-zinc-500">Status:</span> {item.phase}</div>
                              </div>
                              {item.notes.length > 0 && (
                                <div className="mt-3 rounded-xl border border-[var(--glass-border)] bg-black/10 p-3 text-xs text-zinc-300">
                                  {item.notes.join(" | ")}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* ── Trial History ── */}
                  {data.trials.length > 0 && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowTrials((v) => !v)}
                        className="w-full flex items-center justify-between rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <span className="uppercase tracking-wide">Trial History ({data.trials.length})</span>
                        {showTrials ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>

                      <AnimatePresence>
                        {showTrials && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-1.5 pt-1">
                              {[...data.trials].reverse().map((trial) => (
                                <div key={trial.id}>
                                  {editingTrial?.id === trial.id ? (
                                    <TrialEditModal
                                      trial={trial}
                                      onSave={(r, pl) => handleEditTrial(trial, r, pl)}
                                      onCancel={() => setEditingTrial(null)}
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 px-3 py-2">
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="truncate text-xs font-medium text-zinc-300">
                                          {trial.target.definition}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <ResultBadge result={trial.result} />
                                          {trial.promptLevel && (
                                            <span className="text-[10px] text-zinc-500">
                                              {trial.promptLevel.replace(/_/g, " ")}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-zinc-600">
                                            {new Date(trial.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          title="Edit trial"
                                          onClick={() => setEditingTrial(trial)}
                                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-[var(--accent-cyan)]/10 hover:text-[var(--accent-cyan)] transition-colors"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          title="Delete trial"
                                          disabled={deletingTrialId === trial.id}
                                          onClick={() => handleDeleteTrial(trial.id)}
                                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40 transition-colors"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between border-t border-[var(--glass-border)] px-5 py-3 gap-3">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Clock className="h-3.5 w-3.5" />
                {data?.trials?.length ? "Edit the session details or individual trials above." : "Use “Edit” above to update the date, time, or provider."}
              </div>
              {data && (
                <button
                  type="button"
                  onClick={handleGenerateNote}
                  disabled={generating}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors disabled:opacity-60"
                >
                  {generating
                    ? <><Sparkles className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                    : <><FileText className="h-3.5 w-3.5" /> Generate BT Note</>
                  }
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
