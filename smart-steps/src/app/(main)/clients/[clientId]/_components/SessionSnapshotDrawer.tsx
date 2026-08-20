"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Clock, Target as TargetIcon, X, FileText, Sparkles,
  ChevronDown, ChevronUp, Pencil, Trash2, Check, AlertTriangle, CalendarClock,
  Plus, Search, FileCheck2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { formatSessionHours } from "@/lib/formatDuration";

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
  /** Attached to the session by hand rather than derived from trials. */
  addedManually?: boolean;
  addedNote?: string | null;
  addedByName?: string | null;
};

type SessionNoteRef = {
  id: string;
  title: string | null;
  type: string;
  isGenerated: boolean;
  createdAt: string;
};

type TargetGroup = {
  groupId: string;
  groupLabel: string;
  groupType: "goal" | "program";
  targets: Array<{ id: string; definition: string; phase: string; subGoalTitle?: string | null }>;
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
  notesGenerated?: SessionNoteRef[];
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
 * Human-readable session duration, in hours. `formatSessionHours` guards against
 * implausible values (a session left open, a bad end timestamp) so the UI never
 * shows a runaway figure like "374 hrs".
 */
function formatSessionDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "In progress";
  return formatSessionHours(startedAt, endedAt) ?? "—";
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
  const { can } = usePermissions();
  const canDeleteSession = can("smartsteps.sessions.delete");
  const canEditSession   = can("smartsteps.sessions.edit");
  const [generating, setGenerating]   = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [showTrials, setShowTrials]   = useState(false);
  const [editingTrial, setEditingTrial] = useState<TrialRecord | null>(null);
  const [deletingTrialId, setDeletingTrialId] = useState<string | null>(null);

  // Session-header editing (date / time in / time out / provider)
  const [editingSession, setEditingSession] = useState(false);
  const [savingSession, setSavingSession]   = useState(false);
  const [sessForm, setSessForm] = useState({ date: "", timeIn: "", timeOut: "", providerId: "" });

  // Adding a goal that was worked on without trial data
  const [addingGoal, setAddingGoal]   = useState(false);
  const [goalSearch, setGoalSearch]   = useState("");
  const [goalNote, setGoalNote]       = useState("");
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [removingGoalId, setRemovingGoalId] = useState<string | null>(null);

  async function handleGenerateNote() {
    if (!sessionId) return;
    // Generating twice creates a SECOND note rather than replacing the first —
    // make that explicit instead of silently duplicating the write-up.
    const existing = data?.notesGenerated ?? [];
    if (existing.length > 0) {
      const ok = window.confirm(
        `A session note already exists for this session (${existing.length} on file).

` +
        `Generating again creates an additional note; the existing one is not replaced. Continue?`
      );
      if (!ok) return;
    }
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

  async function handleDeleteSession() {
    if (!sessionId || !data) return;
    const when = new Date(data.startedAt).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    const ok = window.confirm(
      `Delete the session on ${when}?

` +
      `Its ${data.trialCount} trial${data.trialCount !== 1 ? "s" : ""} will be removed from graphs and reports. ` +
      `The record is kept in the database and can be restored by an administrator.`
    );
    if (!ok) return;

    setDeletingSession(true);
    try {
      const res = await fetch(`/smart-steps/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to delete session");
      }
      toast.success("Session deleted");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["client", data.clientId] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingSession(false);
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

  /* The client's goals, for attaching one that was worked on without data.
     Loaded only while the picker is open so opening the drawer stays cheap. */
  const { data: targetData } = useQuery<{ groups: TargetGroup[] }>({
    queryKey: ["client-targets-picker", data?.clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${data!.clientId}/targets`);
      if (!res.ok) return { groups: [] };
      return res.json();
    },
    enabled: addingGoal && !!data?.clientId,
    staleTime: 5 * 60 * 1000,
  });

  /* Goals already on the session — whether from trials or attached by hand —
     are not offered again by the picker. */
  const alreadyOnSession = new Set((data?.sessionTargets ?? []).map((t) => t.targetId));
  const search = goalSearch.trim().toLowerCase();
  const pickerGroups = (targetData?.groups ?? [])
    .map((g) => ({
      ...g,
      targets: g.targets.filter(
        (t) =>
          !alreadyOnSession.has(t.id) &&
          (search === "" ||
            t.definition.toLowerCase().includes(search) ||
            g.groupLabel.toLowerCase().includes(search))
      ),
    }))
    .filter((g) => g.targets.length > 0);

  async function handleAddGoal(targetId: string) {
    if (!sessionId) return;
    setSavingGoalId(targetId);
    try {
      const res = await fetch(`/smart-steps/api/sessions/${sessionId}/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, note: goalNote.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to add goal");
      }
      toast.success("Goal added to this session — it will appear on the session note.");
      setGoalNote("");
      qc.invalidateQueries({ queryKey: ["session-snapshot", sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingGoalId(null);
    }
  }

  async function handleRemoveGoal(targetId: string) {
    if (!sessionId) return;
    setRemovingGoalId(targetId);
    try {
      const res = await fetch(
        `/smart-steps/api/sessions/${sessionId}/targets?targetId=${encodeURIComponent(targetId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to remove goal");
      }
      toast.success("Goal removed from this session");
      qc.invalidateQueries({ queryKey: ["session-snapshot", sessionId] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingGoalId(null);
    }
  }

  // Reset the edit panel whenever a different session is opened.
  useEffect(() => {
    setEditingSession(false);
    setAddingGoal(false);
    setGoalSearch("");
    setGoalNote("");
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
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={startEditSession}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-border)] px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit date / time / provider
                        </button>
                        {canDeleteSession && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteSession()}
                            disabled={deletingSession}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--glass-border)] px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:border-[var(--accent-pink)]/50 hover:text-[var(--accent-pink)] transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingSession ? "Deleting…" : "Delete session"}
                          </button>
                        )}
                      </div>
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
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goals Worked</div>
                      {canEditSession && (
                        <button
                          type="button"
                          onClick={() => setAddingGoal((v) => !v)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-colors"
                        >
                          {addingGoal ? <><X className="h-3.5 w-3.5" /> Done</> : <><Plus className="h-3.5 w-3.5" /> Add goal</>}
                        </button>
                      )}
                    </div>

                    {/* Attach a goal that was worked on without trial data. It
                        joins the snapshot and the generated session note. */}
                    <AnimatePresence>
                      {addingGoal && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 rounded-2xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5 p-4">
                            <p className="text-xs text-zinc-400">
                              Add a goal that was worked on during this session but has no trial data.
                              It appears in the session note under <span className="text-zinc-300">Goals Addressed</span>.
                            </p>

                            <div className="relative">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                              <input
                                type="text"
                                value={goalSearch}
                                onChange={(e) => setGoalSearch(e.target.value)}
                                placeholder="Search goals…"
                                className="field-input w-full pl-9 text-sm"
                              />
                            </div>

                            <input
                              type="text"
                              value={goalNote}
                              onChange={(e) => setGoalNote(e.target.value)}
                              placeholder="Optional note (e.g. “ran in natural environment, no data taken”)"
                              className="field-input w-full text-sm"
                            />

                            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                              {pickerGroups.length === 0 ? (
                                <p className="py-4 text-center text-xs text-zinc-500">
                                  {targetData ? "No other goals available for this client." : "Loading goals…"}
                                </p>
                              ) : (
                                pickerGroups.map((g) => (
                                  <div key={g.groupId} className="space-y-1">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                      {g.groupLabel}
                                    </div>
                                    {g.targets.map((t) => (
                                      <button
                                        key={t.id}
                                        type="button"
                                        disabled={savingGoalId === t.id}
                                        onClick={() => handleAddGoal(t.id)}
                                        className="flex w-full items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 px-3 py-2 text-left text-xs text-zinc-300 hover:border-[var(--accent-cyan)]/40 hover:text-zinc-100 disabled:opacity-50 transition-colors"
                                      >
                                        <Plus className="h-3.5 w-3.5 shrink-0 text-[var(--accent-cyan)]" />
                                        <span className="min-w-0 flex-1 truncate">
                                          {t.definition}
                                          {t.subGoalTitle ? <span className="text-zinc-500"> · {t.subGoalTitle}</span> : null}
                                        </span>
                                        <span className="shrink-0 text-[10px] text-zinc-500">{t.phase}</span>
                                      </button>
                                    ))}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

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
                                <div className="flex shrink-0 items-center gap-2">
                                  {item.trialCount === 0 ? (
                                    <span className="rounded-full bg-[var(--glass-bg)] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                                      No data
                                    </span>
                                  ) : (
                                    <span className={`text-sm font-bold ${item.percentage >= 80 ? "text-emerald-300" : item.percentage >= 60 ? "text-amber-300" : "text-rose-300"}`}>
                                      {item.percentage}%
                                    </span>
                                  )}
                                  {/* Only hand-attached goals can be detached here;
                                      a trial-backed goal leaves by deleting its trials. */}
                                  {canEditSession && item.addedManually && (
                                    <button
                                      type="button"
                                      title="Remove this goal from the session"
                                      disabled={removingGoalId === item.targetId}
                                      onClick={() => handleRemoveGoal(item.targetId)}
                                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40 transition-colors"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {item.addedManually && (
                                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent-cyan)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-cyan)]">
                                  <Plus className="h-3 w-3" />
                                  Added to session{item.addedByName ? ` by ${item.addedByName}` : ""}
                                </div>
                              )}
                              <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-4">
                                <div><span className="text-zinc-500">Trials:</span> {item.trialCount}</div>
                                <div><span className="text-zinc-500">Prompts:</span> {Object.keys(item.promptCodes).join(", ") || "Independent"}</div>
                                <div><span className="text-zinc-500">Therapist:</span> {item.providerName || "—"}</div>
                                <div><span className="text-zinc-500">Status:</span> {item.phase}</div>
                              </div>
                              {item.addedNote && (
                                <div className="mt-3 rounded-xl border border-[var(--glass-border)] bg-black/10 p-3 text-xs text-zinc-300">
                                  {item.addedNote}
                                </div>
                              )}
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
              <div className="flex min-w-0 items-center gap-2 text-xs">
                {(data?.notesGenerated?.length ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Note {data!.notesGenerated![0].isGenerated ? "generated" : "written"}{" "}
                      {new Date(data!.notesGenerated![0].createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-400">
                    <Clock className="h-3.5 w-3.5 shrink-0" /> No session note yet
                  </span>
                )}
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
                    : <><FileText className="h-3.5 w-3.5" /> {(data.notesGenerated?.length ?? 0) > 0 ? "Generate Again" : "Generate BT Note"}</>
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
