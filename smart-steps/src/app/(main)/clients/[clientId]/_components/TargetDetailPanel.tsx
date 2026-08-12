"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, AreaChart, Area, BarChart, Bar,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from "recharts";
import {
  X, ChevronDown, Download, Settings2, SplitSquareHorizontal, TrendingUp,
  Pencil, CheckCircle2, Clock, Calendar, Activity, Zap, BarChart2,
  Plus, Check, Info, Trophy, Table2, ChevronUp, Trash2, ArrowUpDown,
  Save, FileDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  type LocalTarget, type MasteryCriteria, type PromptLevel,
  useABAStore,
  lifecycleDisplayLabel,
  isNewPhase,
} from "@/store/abaStore";
import {
  LOW_TRIAL_COUNT_THRESHOLD,
  applyMovingAverage,
  applyStandardDeviation,
  buildChartPoints,
  computeTrend,
  mergeComparisonPoints,
  normalizeResult,
  resolveTargetStatus,
  type ChartPoint,
  type TargetAnalyticsAnnotation,
  type TargetAnalyticsResponse,
  type TargetAnalyticsTrial,
  type TargetStatus,
} from "@/lib/targetAnalytics";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type ApiTrial = TargetAnalyticsTrial;

type GraphType =
  | "% Correct Responding"
  | "Prompt % Distribution"
  | "Prompt Counts"
  | "Trials by Prompts"
  | "Daily Prompt %"
  | "Time of Day";
type TimeRange = "1d" | "5d" | "1m" | "3m" | "6m" | "ytd" | "all";
type MaWindow = 0 | 25;
type PanelTab = "analytics" | "rawData" | "notes";
type Annotation = TargetAnalyticsAnnotation;

export interface TargetPanelData {
  id: string;
  serverId?: string;
  title: string;
  operationalDefinition?: string;
  description?: string;
  targetType: string;
  phase: string;
  masteryCriteria: MasteryCriteria;
  promptLevels: PromptLevel[];
  baselineLevel?: string;
  requiredPrompts?: string;
  status?: "active" | "mastered" | "paused" | "new";
  isActive?: boolean;
  dateMastered?: string | null;
  createdAt?: string;
  initialTab?: PanelTab;
}

interface Props {
  target: TargetPanelData;
  clientId: string;
  onClose: () => void;
}

/* ─── Helper fns ─────────────────────────────────────────────────────────── */

const PHASE_STYLE: Record<string, string> = {
  NEW: "bg-amber-400/15 text-amber-300",
  BASELINE: "bg-zinc-500/15 text-zinc-300",
  ACQUISITION: "bg-cyan-400/15 text-cyan-300",
  MAINTENANCE: "bg-amber-400/15 text-amber-300",
  GENERALIZATION: "bg-purple-400/15 text-purple-300",
  MASTERED: "bg-emerald-400/15 text-emerald-300",
};

function filterByRange(data: ChartPoint[], range: TimeRange): ChartPoint[] {
  if (range === "all") return data;
  const now = new Date();
  const cutoff = new Date(now);
  if (range === "1d") cutoff.setDate(now.getDate() - 1);
  else if (range === "5d") cutoff.setDate(now.getDate() - 5);
  else if (range === "1m") cutoff.setDate(now.getDate() - 30);
  else if (range === "3m") cutoff.setDate(now.getDate() - 90);
  else if (range === "6m") cutoff.setDate(now.getDate() - 180);
  else if (range === "ytd") cutoff.setMonth(0, 1);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

function promptLabel(promptLevel: string | null | undefined, promptLevels: PromptLevel[]) {
  if (!promptLevel) return "Independent";
  const normalized = String(promptLevel);
  const numeric = Number(normalized);
  if (!Number.isNaN(numeric)) {
    return promptLevels.find((p) => p.level === numeric)?.name ?? `L${numeric}`;
  }
  const lower = normalized.toLowerCase();
  const match = promptLevels.find((p) => p.name.toLowerCase() === lower);
  if (match) return match.name;
  return normalized.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}


function exportCSV(data: ChartPoint[], targetTitle: string) {
  const header = "Date,Session,Correct,Total,% Correct";
  const rows = data.map((d) => `${d.date},${d.sessionLabel},${d.correct},${d.total},${d.pct}%`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${targetTitle.replace(/\s+/g, "_")}_data.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Confetti ───────────────────────────────────────────────────────────── */

function launchConfetti() {
  const colors = ["#06b6d4","#a855f7","#ec4899","#34d399","#f59e0b","#fff","#60a5fa"];
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  document.body.appendChild(host);

  for (let i = 0; i < 100; i++) {
    const el = document.createElement("div");
    const size = Math.random() * 9 + 4;
    const x    = Math.random() * 100;
    const dur  = (Math.random() * 2 + 1.5).toFixed(2);
    const del  = (Math.random() * 0.6).toFixed(2);
    const rot  = Math.floor(Math.random() * 720);
    const clr  = colors[Math.floor(Math.random() * colors.length)];
    el.style.cssText = `position:absolute;left:${x}%;top:-12px;width:${size}px;height:${size}px;background:${clr};border-radius:${Math.random()>0.5?"50%":"2px"};animation:ss-confetti-fall ${dur}s ${del}s ease-in forwards;`;
    host.appendChild(el);
  }

  const style = document.createElement("style");
  style.textContent = "@keyframes ss-confetti-fall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(105vh) rotate(720deg);opacity:0}}";
  document.head.appendChild(style);
  setTimeout(() => { host.remove(); style.remove(); }, 4200);
}

/* ─── Result badge ───────────────────────────────────────────────────────── */

const RESULT_BADGE: Record<string, { label: string; cls: string }> = {
  CORRECT:     { label: "Correct ✓",     cls: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
  INCORRECT:   { label: "Incorrect ✗",   cls: "bg-red-400/15 text-red-300 border-red-400/30" },
  PROMPTED:    { label: "Prompted 👆",    cls: "bg-purple-400/15 text-purple-300 border-purple-400/30" },
  NO_RESPONSE: { label: "No Response —", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  SKIP:        { label: "Skip",          cls: "bg-zinc-600/15 text-zinc-500 border-zinc-600/30" },
};

/* ─── Read Data Table ────────────────────────────────────────────────────── */

type SortKey = "createdAt" | "result" | "promptLevel";

function ReadDataTable({
  trials,
  promptLevels,
  onDelete,
  onReplace,
  availableUsers,
  availableSessionTypes,
  availablePromptCodes,
}: {
  trials: ApiTrial[];
  promptLevels: { level: number; name: string }[];
  onDelete: (id: string) => void;
  onReplace: (rows: ApiTrial[]) => void;
  availableUsers: string[];
  availableSessionTypes: string[];
  availablePromptCodes: string[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftFilters, setDraftFilters] = useState({
    dateFrom: "",
    dateTo: "",
    userFilter: "all",
    sessionFilter: "all",
    promptFilter: "all",
    minPercentage: "",
    maxPercentage: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
    userFilter: "all",
    sessionFilter: "all",
    promptFilter: "all",
    minPercentage: "",
    maxPercentage: "",
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draftRows, setDraftRows] = useState<ApiTrial[]>(trials);
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);

  useEffect(() => {
    setDraftRows(trials);
    setDirtyIds([]);
    setSelectedIds([]);
  }, [trials]);

  function handleRunFilters() {
    setAppliedFilters(draftFilters);
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(false); }
  }

  const filtered = useMemo(() => {
    return draftRows.filter((trial) => {
      const day = trial.createdAt.slice(0, 10);
      const percentage = normalizeResult(trial.result) === "CORRECT" ? 100 : normalizeResult(trial.result) === "PROMPTED" ? 50 : 0;
      if (appliedFilters.dateFrom && day < appliedFilters.dateFrom) return false;
      if (appliedFilters.dateTo && day > appliedFilters.dateTo) return false;
      if (appliedFilters.userFilter !== "all" && (trial.session?.user?.name || "—") !== appliedFilters.userFilter) return false;
      if (appliedFilters.sessionFilter !== "all" && (trial.sessionKind || trial.session?.mode || "DTT") !== appliedFilters.sessionFilter) return false;
      if (appliedFilters.promptFilter !== "all" && (trial.promptCode || trial.promptLevel || "INDEPENDENT") !== appliedFilters.promptFilter) return false;
      if (appliedFilters.minPercentage && percentage < Number(appliedFilters.minPercentage)) return false;
      if (appliedFilters.maxPercentage && percentage > Number(appliedFilters.maxPercentage)) return false;
      return true;
    });
  }, [appliedFilters, draftRows]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av: string | number = a[sortKey] ?? "";
      let bv: string | number = b[sortKey] ?? "";
      if (sortKey === "promptLevel") { av = a.promptLevel ?? ""; bv = b.promptLevel ?? ""; }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  function markDirty(id: string) {
    setDirtyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function updateRow(id: string, patch: Partial<ApiTrial>) {
    setDraftRows((prev) => prev.map((trial) => (
      trial.id === id
        ? { ...trial, ...patch, updatedAt: new Date().toISOString() }
        : trial
    )));
    markDirty(id);
  }

  async function handleSaveEdits() {
    if (!dirtyIds.length) {
      toast.message("No raw-data edits to save.");
      return;
    }
    setSaving(true);
    try {
      const changedRows = draftRows.filter((row) => dirtyIds.includes(row.id));
      await Promise.all(changedRows.map(async (row) => {
        await fetch(`/smart-steps/api/trials/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            result: row.result,
            promptLevel: row.promptLevel,
            createdAt: row.createdAt,
            notes: row.notes ?? "",
          }),
        });
      }));
      onReplace(draftRows);
      setDirtyIds([]);
      toast.success("Raw trial edits saved.");
    } catch {
      toast.error("Unable to save raw-data edits.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSelected() {
    if (!selectedIds.length) {
      toast.message("Select at least one trial to delete.");
      return;
    }
    if (!confirm(`Delete ${selectedIds.length} selected trial${selectedIds.length === 1 ? "" : "s"}?`)) return;
    setSaving(true);
    try {
      await Promise.all(selectedIds.map(async (id) => {
        await fetch(`/smart-steps/api/trials/${id}`, { method: "DELETE" });
      }));
      const remaining = draftRows.filter((trial) => !selectedIds.includes(trial.id));
      onReplace(remaining);
      selectedIds.forEach(onDelete);
      setDraftRows(remaining);
      setSelectedIds([]);
      setDirtyIds((prev) => prev.filter((id) => !selectedIds.includes(id)));
      toast.success("Selected trials deleted.");
    } catch {
      toast.error("Unable to delete selected trials.");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    const header = "Date,User,Session Type,Prompt Code,Percentage,Result,Notes";
    const rows = sorted.map((trial) => {
      const pct = normalizeResult(trial.result) === "CORRECT" ? 100 : normalizeResult(trial.result) === "PROMPTED" ? 50 : 0;
      return [
        trial.createdAt,
        trial.session?.user?.name || "",
        trial.session?.mode || "DTT",
        promptLabel(trial.promptLevel, promptLevels),
        pct,
        normalizeResult(trial.result),
        (trial.notes || "").replaceAll(",", ";"),
      ].join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "target_raw_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortBtn({ k, children }: { k: SortKey; children: React.ReactNode }) {
    return (
      <button
        type="button" onClick={() => toggleSort(k)}
        className="flex items-center gap-1 hover:text-[var(--accent-cyan)] transition-colors"
      >
        {children}
        {sortKey === k
          ? sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    );
  }

  if (draftRows.length === 0) {
    return (
      <p className="text-center text-zinc-600 text-sm py-8">No trial records yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Date from</span>
          <input value={draftFilters.dateFrom} onChange={(e) => setDraftFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} type="date" className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200" />
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Date to</span>
          <input value={draftFilters.dateTo} onChange={(e) => setDraftFilters((prev) => ({ ...prev, dateTo: e.target.value }))} type="date" className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200" />
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">User</span>
          <select value={draftFilters.userFilter} onChange={(e) => setDraftFilters((prev) => ({ ...prev, userFilter: e.target.value }))} className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200">
            <option value="all">All users</option>
            {availableUsers.map((user) => <option key={user} value={user}>{user}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Session Kind</span>
          <select value={draftFilters.sessionFilter} onChange={(e) => setDraftFilters((prev) => ({ ...prev, sessionFilter: e.target.value }))} className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200">
            <option value="all">All sessions</option>
            {availableSessionTypes.map((session) => <option key={session} value={session}>{session}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Prompt Code</span>
          <select value={draftFilters.promptFilter} onChange={(e) => setDraftFilters((prev) => ({ ...prev, promptFilter: e.target.value }))} className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200">
            <option value="all">All prompts</option>
            {availablePromptCodes.map((promptCode) => <option key={promptCode} value={promptCode}>{promptLabel(promptCode, promptLevels)}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Min %</span>
          <input value={draftFilters.minPercentage} onChange={(e) => setDraftFilters((prev) => ({ ...prev, minPercentage: e.target.value }))} type="number" min="0" max="100" className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200" />
        </label>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Max %</span>
          <input value={draftFilters.maxPercentage} onChange={(e) => setDraftFilters((prev) => ({ ...prev, maxPercentage: e.target.value }))} type="number" min="0" max="100" className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={handleRunFilters} className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)]">
          <Table2 className="h-3.5 w-3.5" /> Run
        </button>
        <button type="button" onClick={handleSaveEdits} disabled={saving || !dirtyIds.length} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-50">
          <Save className="h-3.5 w-3.5" /> Save Edits
        </button>
        <button type="button" onClick={handleDeleteSelected} disabled={saving || !selectedIds.length} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-300 disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" /> Delete Selected
        </button>
        <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-xs font-semibold text-zinc-300">
          <FileDown className="h-3.5 w-3.5" /> Export
        </button>
        <span className="text-xs text-zinc-500">{sorted.length} visible row{sorted.length === 1 ? "" : "s"}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--glass-border)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--glass-border)] bg-[var(--glass-bg)]/40">
            <th className="px-3 py-2.5">
              <input
                type="checkbox"
                checked={sorted.length > 0 && sorted.every((trial) => selectedIds.includes(trial.id))}
                onChange={(e) => setSelectedIds(e.target.checked ? sorted.map((trial) => trial.id) : [])}
                className="accent-[var(--accent-cyan)]"
              />
            </th>
            <th className="text-left px-3 py-2.5 text-zinc-400 font-semibold">
              <SortBtn k="createdAt">Date</SortBtn>
            </th>
            <th className="text-left px-3 py-2.5 text-zinc-400 font-semibold">Provider</th>
            <th className="text-left px-3 py-2.5 text-zinc-400 font-semibold">Session Type</th>
            <th className="text-left px-3 py-2.5 text-zinc-400 font-semibold">
              <SortBtn k="promptLevel">Prompt Code</SortBtn>
            </th>
            <th className="text-left px-3 py-2.5 text-zinc-400 font-semibold">Percentage</th>
            <th className="text-left px-3 py-2.5 text-zinc-400 font-semibold">
              <SortBtn k="result">Result</SortBtn>
            </th>
            <th className="text-left px-3 py-2.5 text-zinc-400 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((trial, i) => {
            const dt      = new Date(trial.createdAt);
            const date    = dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            const time    = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
            const pName = promptLabel(trial.promptLevel, promptLevels);
            const normalizedResult = normalizeResult(trial.result);
            const rBadge  = RESULT_BADGE[trial.result] ?? { label: normalizedResult, cls: "bg-zinc-700 text-zinc-400" };
            const provider = trial.session?.user?.name ?? "—";
            const percentage = normalizedResult === "CORRECT" ? 100 : normalizedResult === "PROMPTED" ? 50 : 0;

            return (
              <tr
                key={trial.id}
                className={`border-b border-[var(--glass-border)]/50 transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.015]"} hover:bg-white/[0.03]`}
              >
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(trial.id)}
                    onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, trial.id] : prev.filter((id) => id !== trial.id))}
                    className="accent-[var(--accent-cyan)]"
                  />
                </td>
                <td className="px-3 py-2.5 text-zinc-300 whitespace-nowrap">
                  <input
                    type="datetime-local"
                    value={trial.createdAt.slice(0, 16)}
                    onChange={(e) => updateRow(trial.id, { createdAt: new Date(e.target.value).toISOString() })}
                    className="rounded-lg border border-[var(--glass-border)] bg-[var(--background)] px-2 py-1 text-zinc-200"
                  />
                  <div className="mt-1 text-zinc-600">{date} {time}</div>
                </td>
                <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{provider}</td>
                <td className="px-3 py-2.5">
                  <span className="text-zinc-400">{trial.session?.mode || "DTT"}</span>
                </td>
                <td className="px-3 py-2.5">
                  <select value={trial.promptLevel || ""} onChange={(e) => updateRow(trial.id, { promptLevel: e.target.value || null })} className="rounded-lg border border-[var(--glass-border)] bg-[var(--background)] px-2 py-1 text-zinc-200">
                    <option value="">Independent</option>
                    {promptLevels.map((level) => (
                      <option key={level.name} value={level.name}>{level.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-zinc-500">
                  {percentage}%
                </td>
                <td className="px-3 py-2.5">
                  <select value={trial.result} onChange={(e) => updateRow(trial.id, { result: e.target.value })} className={`rounded-lg border px-2 py-1 font-medium ${rBadge.cls}`}>
                    {Object.keys(RESULT_BADGE).map((result) => (
                      <option key={result} value={result}>{RESULT_BADGE[result].label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <input
                    value={trial.notes || ""}
                    onChange={(e) => updateRow(trial.id, { notes: e.target.value })}
                    placeholder="Add note"
                    className="w-full min-w-[180px] rounded-lg border border-[var(--glass-border)] bg-[var(--background)] px-2 py-1 text-zinc-200"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ─── Custom Tooltip ─────────────────────────────────────────────────────── */

function CustomTooltip({ active, payload, label }: {
  active?: boolean; payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card rounded-xl border border-[var(--glass-border)] p-3 text-xs shadow-xl min-w-[140px]">
      <p className="font-semibold text-zinc-200 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span className="text-zinc-400">{p.name}</span>
          <span className="font-bold" style={{ color: p.color }}>{p.value}{typeof p.value === "number" && p.name.includes("%") ? "%" : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Dropdown Button ────────────────────────────────────────────────────── */
/*
 * Menus are rendered via createPortal into document.body at position:fixed.
 * This completely escapes any overflow:hidden/auto ancestor (the toolbar has
 * overflow-x:auto which forces overflow-y:auto and clips absolutely-positioned
 * children — the classic dropdown-clipped-by-overflow bug).
 */

function DropButton({
  label, icon: Icon, children,
}: {
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Only render portal after client-side mount (avoids SSR document access)
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  function openDrop() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuWidth = 248;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8));
    setCoords({ top: r.bottom + 6, left });
    setOpen(true);
  }

  function closeDrop() {
    setOpen(false);
  }

  // Click-outside: only active while menu is open
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      // Clicks on the trigger or inside the menu are not "outside"
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeDrop();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const menuStyle: React.CSSProperties = coords
    ? { position: "fixed", top: coords.top, left: coords.left, zIndex: 9999 }
    : {};

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeDrop() : openDrop())}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
          open
            ? "border-[var(--accent-cyan)]/60 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
            : "border-[var(--glass-border)] text-zinc-400 hover:border-[var(--glass-border)]/80 hover:text-zinc-200"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Portal: renders outside all overflow containers */}
      {mounted && createPortal(
        <AnimatePresence>
          {open && coords && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              style={menuStyle}
              className="glass-card rounded-2xl border border-[var(--glass-border)] p-3 shadow-2xl min-w-[220px]"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

/* ─── Log Trial Modal ────────────────────────────────────────────────────── */

function LogTrialModal({
  target, clientId, onClose, onLogged,
}: {
  target: TargetPanelData; clientId: string; onClose: () => void; onLogged: () => void;
}) {
  const [result, setResult] = useState<string>("CORRECT");
  const [promptIdx, setPromptIdx] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const RESULTS = [
    { key: "CORRECT", label: "Correct", color: "#06b6d4", emoji: "✅" },
    { key: "INCORRECT", label: "Incorrect", color: "#ec4899", emoji: "❌" },
    { key: "PROMPTED", label: "Prompted", color: "#a855f7", emoji: "👆" },
    { key: "NO_RESPONSE", label: "No Response", color: "#71717a", emoji: "—" },
  ];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const targetServerId = target.serverId ?? (target.id.startsWith("local-") ? null : target.id);
    if (!targetServerId) {
      toast.info("Target not yet synced — trial saved locally");
      setSaving(false);
      onLogged();
      onClose();
      return;
    }
    try {
      // We need a session ID — create a quick single-trial session
      const sRes = await fetch("/smart-steps/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const sData = await sRes.json().catch(() => ({}));
      const sessionId = sData?.id;
      if (sessionId && !sessionId.startsWith("mock-")) {
        await fetch("/smart-steps/api/trials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            targetId: targetServerId,
            result,
            promptLevel: promptIdx,
            notes: note.trim() || null,
          }),
        });
        // End the quick session
        await fetch(`/smart-steps/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endedAt: new Date().toISOString() }),
        }).catch(() => {});
      }
      if (target.phase === "NEW" && targetServerId) {
        await fetch(`/smart-steps/api/targets/${targetServerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "ACQUISITION" }),
        }).catch(() => {});
        useABAStore.getState().setTargetPhase(target.id, "ACQUISITION");
      }
    } catch { /* offline — data already noted */ }
    toast.success(`Trial logged: ${result}`);
    setSaving(false);
    onLogged();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.93, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 10 }}
        className="glass-card w-full max-w-sm rounded-2xl border border-[var(--accent-cyan)]/40 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--foreground)] flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--accent-cyan)]" />
            Log Quick Trial
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{target.title}</p>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {RESULTS.map((r) => (
              <button
                key={r.key} type="button"
                onClick={() => setResult(r.key)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-all ${
                  result === r.key
                    ? "border-transparent text-white"
                    : "border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
                }`}
                style={result === r.key ? { background: r.color, borderColor: r.color } : {}}
              >
                <span className="text-lg leading-none">{r.emoji}</span>
                {r.label}
              </button>
            ))}
          </div>

          {result === "PROMPTED" && target.promptLevels.length > 0 && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Prompt level used</label>
              <div className="flex flex-wrap gap-1.5">
                {target.promptLevels.map((pl) => (
                  <button
                    key={pl.level} type="button"
                    onClick={() => setPromptIdx(pl.level)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                      promptIdx === pl.level
                        ? "border-[var(--accent-purple)] bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]"
                        : "border-[var(--glass-border)] text-zinc-500"
                    }`}
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Note (optional)</label>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. strong verbal prompt needed"
              className="field-input w-full text-sm"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit" disabled={saving}
              className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60"
            >
              {saving ? "Logging…" : "Log Trial ✓"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-4 py-3">
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main Panel ─────────────────────────────────────────────────────────── */

export function TargetDetailPanel({ target, clientId, onClose }: Props) {
  const allTargets = useABAStore((s) => s.targets);
  const [activeTab, setActiveTab] = useState<PanelTab>(target.initialTab || "analytics");
  const [graphType, setGraphType] = useState<GraphType>("% Correct Responding");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [showAsPercentage, setShowAsPercentage] = useState(true);
  const [groupByDate, setGroupByDate] = useState(true);
  const [showBaseline, setShowBaseline] = useState(false);
  const [showMastery, setShowMastery] = useState(true);
  const [showTrendline, setShowTrendline] = useState(false);
  const [maWindow, setMaWindow] = useState<MaWindow>(0);
  const [showSD, setShowSD] = useState(false);
  const [showAverage, setShowAverage] = useState(false);
  const [showTrialCount, setShowTrialCount] = useState(false);
  const [showUniqueTherapistCount, setShowUniqueTherapistCount] = useState(false);
  const [showIoaOverlay, setShowIoaOverlay] = useState(false);
  const [splitByTherapist, setSplitByTherapist] = useState(false);
  const [splitAmPm, setSplitAmPm] = useState(false);
  const [showDataLabels, setShowDataLabels] = useState(false);
  const [excludeMaintenance, setExcludeMaintenance] = useState(false);
  const [excludeLowTrials, setExcludeLowTrials] = useState(false);
  const [plotFirstTrialOnly, setPlotFirstTrialOnly] = useState(false);
  const [bwMode, setBwMode] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAnnotationComposer, setShowAnnotationComposer] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showConditionLines, setShowConditionLines] = useState(true);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [selectedCompareGoalIds, setSelectedCompareGoalIds] = useState<string[]>([]);
  const [compareSearch, setCompareSearch] = useState("");
  const [mergeComparisonSeries, setMergeComparisonSeries] = useState(false);
  const [logRefetch, setLogRefetch] = useState(0);
  const [localTrials, setLocalTrials] = useState<ApiTrial[] | null>(null);
  const [localAnnotations, setLocalAnnotations] = useState<Annotation[] | null>(null);
  const [masteryFired, setMasteryFired] = useState(false);
  const [savingMastered, setSavingMastered] = useState(false);
  const [reopening, setReopening] = useState(false);

  const targetApiId = target.serverId ?? (target.id.startsWith("local-") ? null : target.id);

  const { data: apiTarget, refetch } = useQuery<TargetAnalyticsResponse>({
    queryKey: ["target-trials", targetApiId, logRefetch],
    queryFn: async () => {
      if (!targetApiId) {
        return {
          id: target.id,
          definition: target.title,
          targetType: target.targetType,
          phase: target.phase,
          isActive: target.isActive ?? true,
          dateMastered: target.dateMastered ?? null,
          createdAt: target.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          trials: [],
          annotations: [],
        } satisfies TargetAnalyticsResponse;
      }
      const res = await fetch(`/smart-steps/api/targets/${targetApiId}?clientId=${clientId}`);
      if (!res.ok) throw new Error("Failed to load target analytics");
      return res.json();
    },
    enabled: true,
    staleTime: 30_000,
  });
  const comparisonTargets = useMemo(
    () => (allTargets ?? []).filter((item) => selectedCompareGoalIds.includes(item.id) && item.clientId === clientId && item.id !== target.id),
    [allTargets, selectedCompareGoalIds]
  );
  const { data: comparisonSeries = [] } = useQuery<Array<{ id: string; title: string; data: ChartPoint[] }>>({
    queryKey: [
      "target-comparisons",
      comparisonTargets.map((item) => item.serverId ?? item.id).join(","),
      timeRange,
      groupByDate,
      plotFirstTrialOnly,
      excludeLowTrials,
      excludeMaintenance,
    ],
    queryFn: async () => {
      const loaded = await Promise.all(
        comparisonTargets.map(async (item) => {
          const apiId = item.serverId ?? (item.id.startsWith("local-") ? null : item.id);
          if (!apiId) return null;
          const query = new URLSearchParams({ clientId });
          if (excludeMaintenance) query.set("excludeMaintenance", "true");
          const res = await fetch(`/smart-steps/api/targets/${apiId}?${query.toString()}`);
          if (!res.ok) return null;
          const json = await res.json() as TargetAnalyticsResponse;
          return {
            id: item.id,
            title: item.title,
            data: filterByRange(
              buildChartPoints(json.trials ?? [], {
                groupByDate,
                plotFirstTrialOnly,
                excludeLowTrialCounts: excludeLowTrials,
              }),
              timeRange
            ),
          };
        })
      );
      return loaded.filter(Boolean) as Array<{ id: string; title: string; data: ChartPoint[] }>;
    },
    enabled: comparisonTargets.length > 0 && activeTab === "analytics",
    staleTime: 30_000,
  });

  // Keep localTrials in sync with server data (so delete works without refetch)
  useEffect(() => {
    if (apiTarget?.trials) setLocalTrials(apiTarget.trials);
    if (apiTarget?.annotations) setLocalAnnotations(apiTarget.annotations);
  }, [apiTarget]);

  const activeTrials = useMemo(() => {
    let rows = localTrials ?? apiTarget?.trials ?? [];
    if (excludeMaintenance) {
      rows = rows.filter((trial) => !trial.isMaintenance);
    }
    return rows;
  }, [apiTarget?.trials, excludeMaintenance, localTrials]);
  const annotations = localAnnotations ?? apiTarget?.annotations ?? [];

  const handleTrialDelete = useCallback((id: string) => {
    setLocalTrials((prev) => (prev ?? []).filter((t) => t.id !== id));
  }, []);

  const handleTrialsReplace = useCallback((rows: ApiTrial[]) => {
    setLocalTrials(rows);
  }, []);

  const rawChartData = useMemo(
    () =>
      buildChartPoints(activeTrials, {
        groupByDate,
        plotFirstTrialOnly,
        excludeLowTrialCounts: excludeLowTrials,
      }),
    [activeTrials, excludeLowTrials, groupByDate, plotFirstTrialOnly]
  );
  const therapistSeries = useMemo(() => {
    const grouped = new Map<string, ApiTrial[]>();
    activeTrials.forEach((trial) => {
      const therapist = trial.session?.user?.name || "Unknown";
      if (!grouped.has(therapist)) grouped.set(therapist, []);
      grouped.get(therapist)!.push(trial);
    });
    return Array.from(grouped.entries()).map(([therapist, entries]) => ({
      therapist,
      data: filterByRange(
        buildChartPoints(entries, {
          groupByDate,
          plotFirstTrialOnly,
          excludeLowTrialCounts: excludeLowTrials,
        }),
        timeRange
      ),
    }));
  }, [activeTrials, excludeLowTrials, groupByDate, plotFirstTrialOnly, timeRange]);
  const amPmSeries = useMemo(() => {
    return filterByRange(rawChartData, timeRange);
  }, [rawChartData, timeRange]);

  const processedData = useMemo(() => {
    let data = filterByRange(rawChartData, timeRange);
    if (maWindow === 25) data = applyMovingAverage(data, 25);
    if (showSD) data = applyStandardDeviation(data);
    if (showTrendline) data = computeTrend(data);
    return data;
  }, [rawChartData, timeRange, maWindow, showSD, showTrendline]);

  const { percentage: masteryPct = 80, masteryType = "AUTOMATIC" } = target.masteryCriteria;
  const averagePct = processedData.length ? Math.round(processedData.reduce((sum, row) => sum + row.pct, 0) / processedData.length) : 0;
  const averageIoa = processedData.filter((row) => row.averageIoa != null).length
    ? Math.round(processedData.filter((row) => row.averageIoa != null).reduce((sum, row) => sum + Number(row.averageIoa || 0), 0) / processedData.filter((row) => row.averageIoa != null).length)
    : null;
  const availableUsers = useMemo(
    () => Array.from(new Set(activeTrials.map((trial) => trial.session?.user?.name).filter(Boolean))) as string[],
    [activeTrials]
  );
  const availableSessionTypes = useMemo(
    () => Array.from(new Set(activeTrials.map((trial) => trial.sessionKind || trial.session?.mode || "DTT"))),
    [activeTrials]
  );
  const availablePromptCodes = useMemo(
    () => Array.from(new Set(activeTrials.map((trial) => trial.promptCode).filter(Boolean))) as string[],
    [activeTrials]
  );
  const visibleComparisonTargets = useMemo(
    () =>
      (allTargets ?? [])
        .filter((candidate) => candidate.clientId === clientId && candidate.id !== target.id)
        .filter((candidate) => candidate.title.toLowerCase().includes(compareSearch.trim().toLowerCase()))
        .slice(0, 20),
    [allTargets, clientId, compareSearch, target.id]
  );
  const mergedComparisonData = useMemo(
    () => (mergeComparisonSeries && comparisonSeries.length > 0 ? mergeComparisonPoints(comparisonSeries) : []),
    [comparisonSeries, mergeComparisonSeries]
  );

  const latestPct = processedData.at(-1)?.pct ?? 0;
  const targetStatus: TargetStatus = resolveTargetStatus(apiTarget ?? {
    phase: target.phase,
    isActive: target.isActive ?? true,
  });
  const isMastered = targetStatus === "mastered";
  const nearMastery = !isMastered && latestPct >= masteryPct - 5;
  const uniqueTherapistCount = Array.from(new Set(activeTrials.map((trial) => trial.provider?.name || trial.session?.user?.name).filter(Boolean))).length;
  const openedDate = target.masteryCriteria.openedDate || apiTarget?.createdAt?.slice(0, 10) || target.createdAt?.slice(0, 10) || null;

  const TIME_RANGES: { key: TimeRange; label: string }[] = [
    { key: "1d", label: "1D" },
    { key: "5d", label: "5D" },
    { key: "1m", label: "1 Month" },
    { key: "3m", label: "3 Months" },
    { key: "6m", label: "6 Months" },
    { key: "ytd", label: "YTD" },
    { key: "all", label: "All" },
  ];

  async function handleMarkAsMastered() {
    if (!targetApiId) {
      useABAStore.getState().setTargetPhase(target.id, "MASTERED");
      useABAStore.getState().updateTarget(target.id, {
        status: "mastered",
        masteryCriteria: {
          ...target.masteryCriteria,
          masteredDate: new Date().toISOString().slice(0, 10),
        },
      });
      toast.success("Goal marked as mastered locally.");
      return;
    }
    if (!confirm("Mark this goal as mastered and set Date Mastered to today?")) return;
    setSavingMastered(true);
    try {
      const today = new Date().toISOString();
      await fetch(`/smart-steps/api/targets/${targetApiId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: "MASTERED",
          status: "mastered",
          dateMastered: today,
        }),
      });
      if (!masteryFired) {
        launchConfetti();
        setMasteryFired(true);
      }
      useABAStore.getState().setTargetPhase(target.id, "MASTERED");
      useABAStore.getState().updateTarget(target.id, {
        status: "mastered",
        masteryCriteria: {
          ...target.masteryCriteria,
          masteredDate: today.slice(0, 10),
        },
      });
      toast.success("Goal marked as mastered.");
      refetch();
    } catch {
      toast.error("Unable to update mastery.");
    } finally {
      setSavingMastered(false);
    }
  }

  async function handleReopenTarget() {
    setReopening(true);
    try {
      if (targetApiId) {
        await fetch(`/smart-steps/api/targets/${targetApiId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "ACQUISITION",
            isActive: true,
          }),
        });
      }
      useABAStore.getState().updateTarget(target.id, {
        status: "active",
        phase: "ACQUISITION",
        isActive: true,
      });
      toast.success("Goal reopened. Historical mastery date was preserved.");
      refetch();
    } catch {
      toast.error("Unable to reopen goal.");
    } finally {
      setReopening(false);
    }
  }

  async function handleCreateAnnotation() {
    if (!targetApiId || !annotationDraft.trim()) return;
    try {
      const res = await fetch(`/smart-steps/api/targets/${targetApiId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: annotationDraft.trim(),
          annotatedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("annotation");
      const created = await res.json();
      setLocalAnnotations((prev) => [created, ...(prev ?? [])]);
      setAnnotationDraft("");
      setShowAnnotationComposer(false);
      toast.success("Annotation added.");
    } catch {
      toast.error("Unable to add annotation.");
    }
  }

  function renderChart() {
    const commonProps = {
      data: processedData,
      margin: { top: 8, right: 12, left: -10, bottom: 0 },
    };
    const maKey = maWindow === 25 ? "ma25" : null;
    const axisProps = {
      xDataKey: "date",
      yDomain: [0, 100] as [number, number],
    };

    const masteryLine = showConditionLines && showMastery ? (
      <ReferenceLine y={masteryPct} stroke="#06b6d4" strokeDasharray="6 3" strokeWidth={1.5}
        label={{ value: `Goal ${masteryPct}%`, position: "insideTopRight", fill: "#06b6d4", fontSize: 10 }} />
    ) : null;

    const baselineLine = showConditionLines && showBaseline ? (
      <ReferenceLine y={0} stroke="#71717a" strokeDasharray="4 2" strokeWidth={1} />
    ) : null;

    const sdBands = showSD && processedData[0]?.sdUpper !== undefined ? (
      <>
        <Area dataKey="sdUpper" stroke="transparent" fill="#a855f7" fillOpacity={0.08} />
        <Area dataKey="sdLower" stroke="transparent" fill="transparent" fillOpacity={0} />
      </>
    ) : null;

    const maLine = maKey ? (
      <Line dataKey={maKey} name={`MA(${maWindow})`} stroke="#f59e0b" strokeWidth={2}
        dot={false} strokeDasharray="5 3" />
    ) : null;
    const annotationLines = showConditionLines
      ? annotations
          .filter((annotation) => annotation.isVisible)
          .map((annotation) => (
            <ReferenceLine
              key={annotation.id}
              x={annotation.annotatedAt.slice(0, 10)}
              stroke={bwMode ? "#a1a1aa" : "#f59e0b"}
              strokeDasharray="4 4"
              label={{ value: annotation.note.slice(0, 18), fill: bwMode ? "#d4d4d8" : "#f59e0b", fontSize: 10 }}
            />
          ))
      : null;
    const comparisonLines = mergeComparisonSeries
      ? mergedComparisonData.length > 0
        ? (
          <Line
            type="monotone"
            data={mergedComparisonData}
            dataKey="pct"
            name="Merged Comparison"
            stroke={bwMode ? "#a1a1aa" : "#f97316"}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        )
        : null
      : comparisonSeries.map((series, idx) => (
          <Line
            key={series.id}
            type="monotone"
            data={series.data}
            dataKey="pct"
            name={`Compare: ${series.title}`}
            stroke={bwMode ? ["#fafafa", "#d4d4d8", "#a1a1aa", "#71717a"][idx % 4] : ["#f97316", "#14b8a6", "#8b5cf6", "#ef4444"][idx % 4]}
            strokeWidth={1.75}
            strokeDasharray="6 4"
            dot={false}
          />
        ));
    const ioaLine = showIoaOverlay && processedData.some((point) => point.averageIoa != null)
      ? <Line type="monotone" dataKey="averageIoa" name="IOA %" stroke={bwMode ? "#fafafa" : "#22c55e"} strokeWidth={2} dot={false} strokeDasharray="3 3" />
      : null;

    if (graphType === "% Correct Responding") {
      return (
        <ComposedChart {...commonProps} data={processedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
          <XAxis dataKey={axisProps.xDataKey} tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis domain={axisProps.yDomain} tick={{ fill: "#71717a", fontSize: 10 }} unit="%" />
          {(showTrialCount || showUniqueTherapistCount) && <YAxis yAxisId="meta" orientation="right" tick={{ fill: "#71717a", fontSize: 10 }} />}
          <Tooltip content={<CustomTooltip />} />
          {sdBands}{masteryLine}{baselineLine}{annotationLines}
          {showAverage && <ReferenceLine y={averagePct} stroke="#a855f7" strokeDasharray="4 4" label={{ value: `Avg ${averagePct}%`, fill: "#a855f7", fontSize: 10 }} />}
          {showTrialCount && (
            <Bar yAxisId="meta" dataKey="total" name="Trial Count" fill={bwMode ? "#71717a" : "#94a3b8"} fillOpacity={0.18} radius={[4, 4, 0, 0]} />
          )}
          {showUniqueTherapistCount && (
            <Line yAxisId="meta" type="monotone" dataKey="uniqueTherapists" name="Unique Therapist Count" stroke={bwMode ? "#d4d4d8" : "#8b5cf6"} strokeWidth={1.75} dot={false} />
          )}
          <Line type="monotone" dataKey="pct" name="% Correct" stroke={bwMode ? "#e4e4e7" : "var(--accent-cyan)"}
            strokeWidth={2.5} dot={showDataLabels ? { r: 3.5, fill: bwMode ? "#e4e4e7" : "var(--accent-cyan)", strokeWidth: 0 } : false}
            activeDot={{ r: 5 }} />
          {splitAmPm && (
            <>
              <Line type="monotone" dataKey="amPct" name="AM %" data={amPmSeries} stroke={bwMode ? "#d4d4d8" : "#a855f7"} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pmPct" name="PM %" data={amPmSeries} stroke={bwMode ? "#71717a" : "#f59e0b"} strokeWidth={2} dot={false} />
            </>
          )}
          {splitByTherapist && therapistSeries.map((series, idx) => (
            <Line
              key={series.therapist}
              type="monotone"
              data={series.data}
              dataKey="pct"
              name={series.therapist}
              stroke={bwMode ? ["#fafafa", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46"][idx % 6] : ["#06b6d4", "#a855f7", "#f59e0b", "#34d399", "#ec4899", "#60a5fa"][idx % 6]}
              strokeWidth={2}
              dot={false}
            />
          ))}
          {comparisonLines}
          {maLine}
          {showTrendline && <Line type="linear" dataKey="trend" name="Trend" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="8 4" dot={false} />}
          {ioaLine}
          <Legend />
        </ComposedChart>
      );
    }

    if (graphType === "Prompt Counts" || graphType === "Trials by Prompts") {
      const promptKeys = Array.from(new Set(activeTrials.map((trial) => promptLabel(trial.promptLevel, target.promptLevels))));
      const promptData = processedData.map((row) => {
        const total = Object.values(row.byPrompt || {}).reduce((sum, count) => sum + Number(count || 0), 0) || 1;
        const counts: Record<string, number | string> = { date: row.date };
        for (const key of promptKeys) counts[key] = 0;
        Object.entries(row.byPrompt || {}).forEach(([key, count]) => {
          counts[promptLabel(key, target.promptLevels)] = showAsPercentage ? Math.round((Number(count || 0) / total) * 100) : count;
        });
        return counts;
      });
      return (
        <BarChart data={promptData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} domain={showAsPercentage ? [0, 100] : undefined} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {promptKeys.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              stackId={graphType === "Trials by Prompts" ? "prompts" : undefined}
              name={key}
              fill={bwMode ? ["#fafafa", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46"][idx % 6] : ["#06b6d4", "#a855f7", "#f59e0b", "#34d399", "#ec4899", "#60a5fa"][idx % 6]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      );
    }

    if (graphType === "Prompt % Distribution" || graphType === "Daily Prompt %") {
      const promptKeys = Array.from(new Set(activeTrials.map((trial) => promptLabel(trial.promptLevel, target.promptLevels))));
      const pctData = processedData.map((row) => {
        const total = Object.values(row.byPrompt || {}).reduce((sum, count) => sum + Number(count || 0), 0) || 1;
        const next: Record<string, number | string> = { date: row.date };
        const countsByLabel = Object.entries(row.byPrompt || {}).reduce<Record<string, number>>((acc, [key, count]) => {
          acc[promptLabel(key, target.promptLevels)] = Number(count || 0);
          return acc;
        }, {});
        for (const key of promptKeys) {
          next[key] = Math.round(((countsByLabel[key] || 0) / total) * 100);
        }
        return next;
      });
      return (
        <AreaChart data={pctData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 10 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {promptKeys.map((key, idx) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={key}
              stackId="promptPct"
              stroke={bwMode ? ["#fafafa", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46"][idx % 6] : ["#06b6d4", "#a855f7", "#f59e0b", "#34d399", "#ec4899", "#60a5fa"][idx % 6]}
              fill={bwMode ? ["#fafafa", "#d4d4d8", "#a1a1aa", "#71717a", "#52525b", "#3f3f46"][idx % 6] : ["#06b6d4", "#a855f7", "#f59e0b", "#34d399", "#ec4899", "#60a5fa"][idx % 6]}
              fillOpacity={0.22}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      );
    }

    if (graphType === "Time of Day") {
      const scatterData = processedData.map((row) => ({
        date: row.date,
        amCount: showAsPercentage ? row.amPct || 0 : row.amCount || 0,
        pmCount: showAsPercentage ? row.pmPct || 0 : row.pmCount || 0,
      }));
      return (
        <ScatterChart data={scatterData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} />
          <YAxis tick={{ fill: "#71717a", fontSize: 10 }} domain={showAsPercentage ? [0, 100] : undefined} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Scatter name="AM" data={scatterData} fill={bwMode ? "#e4e4e7" : "#06b6d4"} dataKey="amCount" />
          <Scatter name="PM" data={scatterData} fill={bwMode ? "#a1a1aa" : "#a855f7"} dataKey="pmCount" />
        </ScatterChart>
      );
    }

    return (
      <LineChart data={processedData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
        <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 10 }} />
        <Tooltip content={<CustomTooltip />} />
        <Line type="monotone" dataKey="pct" name="% Correct" stroke={bwMode ? "#e4e4e7" : "var(--accent-cyan)"} strokeWidth={2} dot={false} />
      </LineChart>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]/95 backdrop-blur-xl overflow-hidden"
    >
      {/* Near-mastery glow */}
      {nearMastery && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent-cyan)] to-transparent animate-pulse" />
      )}

      {/* Header */}
      <div className="flex items-center gap-4 border-b border-[var(--glass-border)] px-5 py-3 shrink-0">
        <button
          onClick={onClose}
          className="rounded-xl p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-[var(--foreground)] text-base leading-tight truncate">{target.title}</h2>
          {target.operationalDefinition && (
            <p className="text-xs text-zinc-500 truncate">{target.operationalDefinition}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            targetStatus === "mastered"
              ? "bg-emerald-400/15 text-emerald-300"
              : targetStatus === "closed"
                ? "bg-zinc-700 text-zinc-300"
                : isNewPhase(target.phase)
                  ? "bg-amber-400/15 text-amber-300 border border-amber-400/30"
                  : PHASE_STYLE[target.phase] ?? "bg-zinc-800 text-zinc-300"
          }`}>
            {targetStatus === "closed" ? "Closed" : lifecycleDisplayLabel(target.phase)}
          </span>
          {processedData.length > 0 && (
            <span className="text-xl font-black" style={{
              color: latestPct >= masteryPct ? "#34d399" : latestPct >= masteryPct - 20 ? "#06b6d4" : "#ec4899",
            }}>
              {latestPct}%
            </span>
          )}
          {targetStatus !== "mastered" && (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              disabled={savingMastered}
              onClick={handleMarkAsMastered}
              className="tap-target flex items-center gap-1.5 rounded-xl bg-emerald-400/15 border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/25"
            >
              <Trophy className="h-3.5 w-3.5" /> Mark as Mastered
            </motion.button>
          )}
          {(targetStatus === "mastered" || targetStatus === "closed") && (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              disabled={reopening}
              onClick={handleReopenTarget}
              className="tap-target flex items-center gap-1.5 rounded-xl bg-amber-400/15 border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/25"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> {reopening ? "Reopening…" : "Reopen"}
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowLogModal(true)}
            className="tap-target flex items-center gap-1.5 rounded-xl bg-[var(--accent-cyan)]/15 border border-[var(--accent-cyan)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25"
          >
            <Plus className="h-3.5 w-3.5" /> Log Trial
          </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[var(--glass-border)] px-5 py-3 bg-[var(--glass-bg)]/18 shrink-0 sm:grid-cols-4 xl:grid-cols-6">
        {[
          { label: "Opened", value: openedDate || "—", tone: "text-zinc-300" },
          { label: "Mastered", value: (apiTarget?.dateMastered || target.masteryCriteria.masteredDate || "").slice(0, 10) || "—", tone: "text-emerald-300" },
          { label: "Latest", value: `${latestPct}%`, tone: latestPct >= masteryPct ? "text-emerald-300" : "text-[var(--accent-cyan)]" },
          { label: "Average", value: `${averagePct}%`, tone: "text-zinc-200" },
          { label: "Sessions", value: String(processedData.length), tone: "text-zinc-200" },
          { label: "Therapists", value: String(uniqueTherapistCount), tone: "text-zinc-200" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-3">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">{item.label}</div>
            <div className={`mt-1 text-sm font-semibold ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Mastery criteria bar */}
      <div className="flex items-center gap-6 border-b border-[var(--glass-border)] px-5 py-2.5 text-xs text-zinc-500 bg-[var(--glass-bg)]/30 overflow-x-auto shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent-cyan)]" />
          <span>Goal: <strong className="text-zinc-300">{masteryPct}%</strong></span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Calendar className="h-3.5 w-3.5" />
          <span><strong className="text-zinc-300">{target.masteryCriteria.consecutiveDays}</strong> consec. days</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Activity className="h-3.5 w-3.5" />
          <span><strong className="text-zinc-300">{target.masteryCriteria.consecutiveSessions}</strong> sessions</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Zap className="h-3.5 w-3.5" />
          <span>Min <strong className="text-zinc-300">{target.masteryCriteria.minTrialsPerSession}</strong> trials</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Info className="h-3.5 w-3.5" />
          <span>First trial: <strong className="text-zinc-300">{target.masteryCriteria.firstTrialMustBe === "INDEPENDENT" ? "Independent" : target.masteryCriteria.firstTrialMustBe === "ANY" ? "Any" : "Prompted"}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Clock className="h-3.5 w-3.5" />
          <span>{masteryType === "MANUAL" ? "Manual mastery" : "Auto-mastery"}</span>
        </div>
        {openedDate && (
          <div className="shrink-0 text-zinc-600">Opened: {openedDate}</div>
        )}
        {(apiTarget?.dateMastered || target.masteryCriteria.masteredDate) && (
          <div className="shrink-0 text-emerald-400">Mastered: {(apiTarget?.dateMastered || target.masteryCriteria.masteredDate || "").slice(0, 10)}</div>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-5 py-2.5 bg-[var(--glass-bg)]/20 overflow-x-auto shrink-0">
        {([
          { key: "analytics", label: "Analytics" },
          { key: "rawData", label: "Raw Data" },
          { key: "notes", label: "Notes" },
        ] as { key: PanelTab; label: string }[]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/40"
                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto text-xs text-zinc-500">
          {rawChartData.reduce((sum, row) => sum + row.total, 0)} trials · {processedData.length} data points
        </div>
      </div>

      {activeTab === "analytics" && (
        <>
          <div className="flex items-center gap-2 border-b border-[var(--glass-border)] px-5 py-2.5 bg-[var(--glass-bg)]/20 overflow-x-auto shrink-0 flex-wrap">
            <DropButton label={graphType} icon={BarChart2}>
              {([
                "% Correct Responding",
                "Prompt % Distribution",
                "Prompt Counts",
                "Trials by Prompts",
                "Daily Prompt %",
                "Time of Day",
              ] as GraphType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGraphType(option)}
                  className={`flex items-center justify-between w-full rounded-lg px-3 py-2 text-xs text-left transition-colors hover:bg-white/5 ${graphType === option ? "text-[var(--accent-cyan)]" : "text-zinc-300"}`}
                >
                  {option}
                  {graphType === option && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </DropButton>

            <DropButton label="Chart Settings" icon={Settings2}>
              {[
                ["Show as Percentage", showAsPercentage, setShowAsPercentage],
                ["Group by Therapist", splitByTherapist, setSplitByTherapist],
                ["Group by Date", groupByDate, setGroupByDate],
                ["Split by AM / PM", splitAmPm, setSplitAmPm],
                ["Split by Therapist", splitByTherapist, setSplitByTherapist],
                ["Exclude Maintenance", excludeMaintenance, setExcludeMaintenance],
                [`Exclude Low Trial Counts (< ${LOW_TRIAL_COUNT_THRESHOLD})`, excludeLowTrials, setExcludeLowTrials],
                ["Plot First Trial Only", plotFirstTrialOnly, setPlotFirstTrialOnly],
                ["Black & White Graph", bwMode, setBwMode],
                ["Show Data Point Values", showDataLabels, setShowDataLabels],
              ].map(([label, checked, setter]) => (
                <label key={String(label)} className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer px-1 py-1.5">
                  {String(label)}
                  <input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)} className="accent-[var(--accent-cyan)]" />
                </label>
              ))}
            </DropButton>

            <DropButton label="Indicators" icon={TrendingUp}>
              {([
                { v: 0, label: "None" },
                { v: 25, label: "25-Day Moving Average" },
              ] as { v: MaWindow; label: string }[]).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMaWindow(v)}
                  className={`flex items-center justify-between w-full rounded-lg px-3 py-2 text-xs text-left transition-colors hover:bg-white/5 ${maWindow === v ? "text-[var(--accent-cyan)]" : "text-zinc-300"}`}
                >
                  {label}
                  {maWindow === v && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
              {[
                ["Average", showAverage, setShowAverage],
                ["Trend Line", showTrendline, setShowTrendline],
                ["Standard Deviation", showSD, setShowSD],
                ["Trial Count", showTrialCount, setShowTrialCount],
                ["Unique Therapist Count", showUniqueTherapistCount, setShowUniqueTherapistCount],
                ["Overlay IOA Data", showIoaOverlay, setShowIoaOverlay],
              ].map(([label, checked, setter]) => (
                <label key={String(label)} className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer px-1 py-1.5">
                  {String(label)}
                  <input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)} className="accent-[var(--accent-purple)]" />
                </label>
              ))}
            </DropButton>

            <DropButton label="Comparisons" icon={SplitSquareHorizontal}>
              <p className="px-1 pb-1 text-xs text-zinc-500">Compare with other goals from this client.</p>
              <input
                value={compareSearch}
                onChange={(e) => setCompareSearch(e.target.value)}
                placeholder="Search targets..."
                className="mb-2 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-xs text-zinc-200"
              />
              {visibleComparisonTargets.map((candidate) => (
                <label key={candidate.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-white/5">
                  <span className="truncate">{candidate.title}</span>
                  <input
                    type="checkbox"
                    checked={selectedCompareGoalIds.includes(candidate.id)}
                    onChange={(e) => setSelectedCompareGoalIds((prev) => e.target.checked ? [...prev, candidate.id] : prev.filter((id) => id !== candidate.id))}
                    className="accent-[var(--accent-cyan)]"
                  />
                </label>
              ))}
              <label className="mt-2 flex items-center justify-between text-xs text-zinc-300 cursor-pointer px-3 py-2 border-t border-[var(--glass-border)]">
                Merge Data Into Single Series
                <input type="checkbox" checked={mergeComparisonSeries} onChange={(e) => setMergeComparisonSeries(e.target.checked)} className="accent-[var(--accent-cyan)]" />
              </label>
              <div className="border-t border-[var(--glass-border)] mt-2 pt-2 px-1 text-xs text-zinc-500">
                {selectedCompareGoalIds.length} comparison goal{selectedCompareGoalIds.length === 1 ? "" : "s"} selected
              </div>
            </DropButton>

            <DropButton label="Annotations" icon={Pencil}>
              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer px-3 py-2">
                Hide Condition Lines
                <input type="checkbox" checked={!showConditionLines} onChange={(e) => setShowConditionLines(!e.target.checked)} className="accent-[var(--accent-cyan)]" />
              </label>
              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer px-3 py-2">
                Hide Notes
                <input type="checkbox" checked={!showAnnotations} onChange={(e) => setShowAnnotations(!e.target.checked)} className="accent-[var(--accent-cyan)]" />
              </label>
              <button
                type="button"
                onClick={() => setActiveTab("notes")}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
              >
                <Info className="h-3.5 w-3.5" />
                View Annotations
              </button>
              <button
                type="button"
                onClick={() => setShowAnnotationComposer((value) => !value)}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Annotation
              </button>
              <div className="px-3 py-2 text-xs text-zinc-500">{annotations.length} saved annotations</div>
            </DropButton>

            <DropButton label="Export" icon={Download}>
              <button
                type="button"
                onClick={() => { exportCSV(processedData, target.title); }}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ graphType, processedData, annotations }, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${target.title.replace(/\s+/g, "_")}_analytics.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <FileDown className="h-3.5 w-3.5" />
                Download JSON
              </button>
            </DropButton>

            <div className="flex-1" />
            {rawChartData.length > 0 && (
              <span className="text-xs text-zinc-500 shrink-0">
                {rawChartData.reduce((s, d) => s + d.total, 0)} total trials · {rawChartData.length} sessions
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-b border-[var(--glass-border)] px-5 py-2 overflow-x-auto shrink-0">
            {TIME_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setTimeRange(r.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                  timeRange === r.key
                    ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/40"
                    : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex-1 overflow-hidden p-4 sm:p-6 min-h-0">
        {activeTab === "analytics" && processedData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <BarChart2 className="h-14 w-14 text-zinc-700 mb-4" />
            <p className="text-zinc-400 font-semibold text-lg mb-2">No trial data yet</p>
            <p className="text-zinc-600 text-sm max-w-xs">
              Start a session and record trials for this target to see the performance graph.
            </p>
            <button
              onClick={() => setShowLogModal(true)}
              className="mt-6 tap-target flex items-center gap-2 rounded-xl bg-[var(--accent-cyan)]/15 border border-[var(--accent-cyan)]/30 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)]"
            >
              <Plus className="h-4 w-4" /> Log First Trial
            </button>
          </div>
        ) : activeTab === "analytics" ? (
          <div className="flex h-full flex-col gap-4">
            {showAnnotationComposer && (
              <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <label className="flex-1 text-xs text-zinc-400">
                    <span className="mb-1 block">Annotation</span>
                    <textarea value={annotationDraft} onChange={(e) => setAnnotationDraft(e.target.value)} rows={3} className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-zinc-200" placeholder="Add chart note or milestone..." />
                  </label>
                  <button type="button" onClick={handleCreateAnnotation} className="rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-4 py-2 text-xs font-semibold text-[var(--accent-cyan)]">
                    Save Annotation
                  </button>
                </div>
              </div>
            )}
            {!targetApiId && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                <p className="font-semibold text-amber-300">Goal not yet synced to server</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Open the <strong>Data Entry</strong> tab once to sync this goal, then chart data will appear here.
                </p>
              </div>
            )}
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart()}
              </ResponsiveContainer>
            </div>
            {showAnnotations && annotations.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {annotations.map((annotation) => (
                  <div key={annotation.id} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-3">
                    <div className="text-xs font-semibold text-zinc-200">{annotation.note}</div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      {annotation.annotatedAt.slice(0, 10)} {annotation.user?.name ? `· ${annotation.user.name}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === "rawData" ? (
          <div className="h-full overflow-auto">
            <ReadDataTable
              trials={activeTrials}
              promptLevels={target.promptLevels}
              onDelete={handleTrialDelete}
              onReplace={handleTrialsReplace}
              availableUsers={availableUsers}
              availableSessionTypes={availableSessionTypes}
              availablePromptCodes={availablePromptCodes}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Operational Definition</div>
              <div className="mt-2 text-sm text-zinc-200">{target.operationalDefinition || "No operational definition recorded."}</div>
            </div>
            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">Notes</div>
              <div className="mt-2 text-sm text-zinc-300">{target.description || "No notes yet."}</div>
            </div>
            {annotations.length > 0 && (
              <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/20 p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Annotations</div>
                <div className="mt-3 space-y-2">
                  {annotations.map((annotation) => (
                    <div key={annotation.id} className="rounded-xl border border-[var(--glass-border)] px-3 py-2 text-sm text-zinc-300">
                      {annotation.note}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {processedData.length > 0 && activeTab === "analytics" && (
        <div className="flex gap-6 border-t border-[var(--glass-border)] px-5 py-3 text-xs text-zinc-500 bg-[var(--glass-bg)]/20 overflow-x-auto shrink-0">
          <div>Latest: <strong className="text-zinc-300">{latestPct}%</strong></div>
          <div>Peak: <strong className="text-[var(--accent-cyan)]">{Math.max(...processedData.map((d) => d.pct))}%</strong></div>
          <div>Average: <strong className="text-zinc-300">{averagePct}%</strong></div>
          <div>Sessions shown: <strong className="text-zinc-300">{processedData.length}</strong></div>
          <div>Total trials: <strong className="text-zinc-300">{processedData.reduce((s, d) => s + d.total, 0)}</strong></div>
          <div>Unique therapists: <strong className="text-zinc-300">{uniqueTherapistCount}</strong></div>
          {averageIoa != null && <div>Avg IOA: <strong className="text-emerald-300">{averageIoa}%</strong></div>}
          {showTrialCount && <div>Trial count overlay active</div>}
          {splitByTherapist && <div>Split by therapist active</div>}
          {splitAmPm && <div>Split AM/PM active</div>}
          {mergeComparisonSeries && comparisonSeries.length > 0 && <div>Merged comparison series active</div>}
          {nearMastery && <div className="text-[var(--accent-cyan)] font-semibold animate-pulse">Near mastery threshold</div>}
          {isMastered && <div className="text-emerald-400 font-semibold">Mastered</div>}
        </div>
      )}

      {/* Log trial modal */}
      <AnimatePresence>
        {showLogModal && (
          <LogTrialModal
            target={target}
            clientId={clientId}
            onClose={() => setShowLogModal(false)}
            onLogged={() => { setLogRefetch((n) => n + 1); refetch(); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
