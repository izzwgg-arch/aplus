"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ChevronRight, Plus, Target, Trash2, X, Layers, CheckCircle2,
  Clock, Settings2, Info, Calendar, Sliders, AlertCircle, Pencil, ChevronDown,
  BarChart2, Zap, Lightbulb, BookOpen, Search, Star,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import {
  useABAStore, defaultMastery, defaultPromptLevels,
  type LocalCategory, type LocalProgram, type LocalTarget,
  type MasteryCriteria, type PromptLevel, type TargetType, type Phase,
  GOAL_LIFECYCLE_OPTIONS, lifecycleFromPhase, lifecycleDisplayLabel,
  phaseFromLifecycle, isNewPhase, isMasteredPhase, type GoalLifecycleKey,
  sortByCreatedAt, CATEGORY_COLOR_PALETTE, categoryColor,
} from "@/store/abaStore";
import { replaceClientNamePlaceholders } from "@/lib/sanitizeHtml";

/* ─── Goal Library import types ──────────────────────────────────────────── */

/** A Goal Library template item as returned by /api/goals/search (goalItems). */
type LibraryTargetItem = {
  id: string;
  title: string;
  operationalDefinition?: string | null;
  targetType?: string | null;
  masteryRule?: unknown;
  promptHierarchy?: string[] | null;
  baseline?: string | null;
  category?: string | null;
  skillArea?: string | null;
  usageCount?: number;
  isFavoriteForUser?: boolean;
  isRecentlyUsed?: boolean;
};

type TargetSuggestion = LibraryTargetItem & { source: "library" | "client" };

/* ─── Constants ─────────────────────────────────────────────────────────── */

const TARGET_TYPES: { value: TargetType; label: string }[] = [
  { value: "DISCRETE_TRIAL", label: "Discrete Trial Training (DTT)" },
  { value: "TASK_ANALYSIS_FWD", label: "Task Analysis — Forward Chaining" },
  { value: "TASK_ANALYSIS_BWD", label: "Task Analysis — Backward Chaining" },
  { value: "TASK_ANALYSIS_TOTAL", label: "Task Analysis — Total Task" },
  { value: "DURATION", label: "Duration Recording" },
  { value: "LATENCY", label: "Latency Recording" },
  { value: "FREQUENCY", label: "Frequency / Event Recording" },
  { value: "PARTIAL_INTERVAL", label: "Partial Interval Recording" },
  { value: "WHOLE_INTERVAL", label: "Whole Interval Recording" },
  { value: "MOMENTARY_TIME_SAMPLE", label: "Momentary Time Sampling (MTS)" },
  { value: "COLD_PROBE", label: "Cold Probe" },
  { value: "OTHER", label: "Other" },
];

const PHASES: Phase[] = ["NEW", "BASELINE", "ACQUISITION", "MAINTENANCE", "GENERALIZATION", "MASTERED"];

const PHASE_STYLE: Record<Phase, string> = {
  NEW: "bg-amber-400/15 text-amber-300 border-amber-400/40",
  BASELINE: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  ACQUISITION: "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30",
  MAINTENANCE: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  GENERALIZATION: "bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border-[var(--accent-purple)]/30",
  MASTERED: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
};

const PHASE_DOT: Record<Phase, string> = {
  NEW: "bg-amber-400",
  BASELINE: "bg-zinc-400",
  ACQUISITION: "bg-[var(--accent-cyan)]",
  MAINTENANCE: "bg-amber-400",
  GENERALIZATION: "bg-[var(--accent-purple)]",
  MASTERED: "bg-emerald-400",
};

const CATEGORY_PRESETS = [
  "Language & Communication",
  "Social Skills",
  "Manding (Requesting)",
  "Tacting (Labeling)",
  "Intraverbal",
  "Self-Care / Daily Living",
  "Fine Motor Skills",
  "Gross Motor Skills",
  "Academic / Pre-Academic",
  "Behavior Reduction",
  "Play & Leisure",
  "Cognitive Skills",
];

function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Persisted / legacy store rows may omit masteryCriteria or use unknown phase strings from the API. */
function safePhase(p: string | undefined | null): Phase {
  if (p && PHASES.includes(p as Phase)) return p as Phase;
  return "BASELINE";
}

function safeMastery(mc: MasteryCriteria | undefined | null): MasteryCriteria {
  if (!mc || typeof mc !== "object") return defaultMastery();
  return { ...defaultMastery(), ...mc };
}

/* ─── Mastery Criteria Form ──────────────────────────────────────────────── */

interface MasteryCriteriaFormProps {
  value: MasteryCriteria;
  promptLevels: PromptLevel[];
  onChange: (m: MasteryCriteria) => void;
}

function MasteryCriteriaForm({ value, promptLevels, onChange }: MasteryCriteriaFormProps) {
  function set(patch: Partial<MasteryCriteria>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--background)]/60 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--accent-cyan)]" />
          Mastery Criteria
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => set({ masteryType: "AUTOMATIC" })}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              value.masteryType === "AUTOMATIC"
                ? "bg-[var(--accent-cyan)] text-black"
                : "border border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Automatic
          </button>
          <button
            type="button"
            onClick={() => set({ masteryType: "MANUAL" })}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              value.masteryType === "MANUAL"
                ? "bg-[var(--accent-purple)] text-white"
                : "border border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Manual
          </button>
        </div>
      </div>

      {value.masteryType === "AUTOMATIC" && (
        <div className="space-y-4">
          {/* Percentage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-zinc-400">% Correct to master</label>
              <span className="text-lg font-bold text-[var(--accent-cyan)]">{value.percentage}%</span>
            </div>
            <input
              type="range" min={50} max={100} step={5}
              value={value.percentage}
              onChange={(e) => set({ percentage: Number(e.target.value) })}
              className="w-full h-2 accent-[var(--accent-cyan)] cursor-pointer"
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Consecutive days</label>
              <input
                type="number" min={1} max={30}
                value={value.consecutiveDays}
                onChange={(e) => set({ consecutiveDays: Number(e.target.value) })}
                className="field-input w-full text-sm text-center"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Consecutive sessions</label>
              <input
                type="number" min={1} max={30}
                value={value.consecutiveSessions}
                onChange={(e) => set({ consecutiveSessions: Number(e.target.value) })}
                className="field-input w-full text-sm text-center"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Min trials/session</label>
              <input
                type="number" min={1} max={50}
                value={value.minTrialsPerSession}
                onChange={(e) => set({ minTrialsPerSession: Number(e.target.value) })}
                className="field-input w-full text-sm text-center"
              />
            </div>
          </div>

          {/* First trial rule */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">First trial of each session must be</label>
            <select
              value={value.firstTrialMustBe}
              onChange={(e) => set({ firstTrialMustBe: e.target.value as MasteryCriteria["firstTrialMustBe"] })}
              className="field-input w-full text-sm"
            >
              <option value="ANY">Any result</option>
              <option value="INDEPENDENT">Independent (no prompt)</option>
              <option value="SPECIFIC_PROMPT">Specific prompt level or lower</option>
            </select>
          </div>

          {value.firstTrialMustBe === "SPECIFIC_PROMPT" && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">
                Prompt level ≤ (first trial)
              </label>
              <select
                value={value.firstTrialPromptLevel ?? 0}
                onChange={(e) => set({ firstTrialPromptLevel: Number(e.target.value) })}
                className="field-input w-full text-sm"
              >
                {promptLevels.map((pl) => (
                  <option key={pl.level} value={pl.level}>
                    {pl.level} — {pl.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Prompt level to master */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              Prompt level to achieve mastery at
            </label>
            <select
              value={value.promptLevelToMaster}
              onChange={(e) => set({ promptLevelToMaster: Number(e.target.value) })}
              className="field-input w-full text-sm"
            >
              {promptLevels.map((pl) => (
                <option key={pl.level} value={pl.level}>
                  Level {pl.level} — {pl.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Dates — always shown */}
      <div className="border-t border-[var(--glass-border)] pt-4">
        <p className="text-xs text-zinc-500 mb-3 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {value.masteryType === "MANUAL" ? "Set all dates manually" : "Optional dates"}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Opened</label>
            <input
              type="date"
              value={value.openedDate ?? ""}
              onChange={(e) => set({ openedDate: e.target.value || null })}
              className="field-input w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Baseline</label>
            <input
              type="date"
              value={value.baselineDate ?? ""}
              onChange={(e) => set({ baselineDate: e.target.value || null })}
              className="field-input w-full text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              {value.masteryType === "MANUAL" ? "Mastered *" : "Mastered (auto)"}
            </label>
            <input
              type="date"
              value={value.masteredDate ?? ""}
              onChange={(e) => set({ masteredDate: e.target.value || null })}
              className="field-input w-full text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Prompt Levels Editor ───────────────────────────────────────────────── */

function PromptLevelsEditor({
  value,
  onChange,
}: {
  value: PromptLevel[];
  onChange: (v: PromptLevel[]) => void;
}) {
  function update(idx: number, patch: Partial<PromptLevel>) {
    const next = value.map((pl, i) => (i === idx ? { ...pl, ...patch } : pl));
    onChange(next);
  }
  function addRow() {
    onChange([...value, { level: value.length, name: "" }]);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5" />
          Prompt hierarchy ({value.length} levels)
        </p>
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-[var(--accent-cyan)] hover:underline"
        >
          + Add level
        </button>
      </div>
      {value.map((pl, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 text-center text-xs text-zinc-500 shrink-0">{pl.level}</span>
          <input
            type="text"
            value={pl.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder={`Level ${pl.level} name…`}
            className="field-input flex-1 text-sm py-1.5"
          />
          {value.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Target Modal ───────────────────────────────────────────────────────── */

interface TargetModalProps {
  clientId: string;
  categoryId: string;
  programId: string;
  programName: string;
  editTarget?: LocalTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

function TargetModal({
  clientId, categoryId, programId, programName, editTarget, onClose, onSaved,
}: TargetModalProps) {
  const { data: session } = useSession();
  const canWrite = ["ADMIN", "BCBA"].includes((session?.user as { role?: string } | undefined)?.role ?? "");
  const addTarget = useABAStore((s) => s.addTarget);
  const updateTarget = useABAStore((s) => s.updateTarget);
  const allStoreTargets = useABAStore((s) => s.targets);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"basic" | "mastery" | "prompts">("basic");

  // Client name — used to substitute (Client)/[Client]/{{client}} placeholders in
  // imported Goal Library templates. Shares the cache key with GoalsPage, so this
  // reuses the already-fetched value rather than making a second request.
  const { data: clientInfo } = useQuery<{ name: string }>({
    queryKey: ["client-name", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
  const clientName = clientInfo?.name ?? "";

  // Smart search state
  const [suggestions, setSuggestions]   = useState<TargetSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [sourceLibraryId, setSourceLibraryId] = useState<string | null>(null);

  // Duplicate warning state
  const [dupWarning, setDupWarning]   = useState<{ match: string } | null>(null);
  const [pendingSave, setPendingSave] = useState<React.FormEvent | null>(null);

  const [form, setForm] = useState({
    title: editTarget?.title ?? "",
    operationalDefinition: editTarget?.operationalDefinition ?? "",
    targetType: (editTarget?.targetType ?? "DISCRETE_TRIAL") as TargetType,
    phase: (editTarget ? safePhase(editTarget.phase) : "NEW") as Phase,
  });
  const [mastery, setMastery] = useState<MasteryCriteria>(
    safeMastery(editTarget?.masteryCriteria)
  );
  const [promptLevels, setPromptLevels] = useState<PromptLevel[]>(
    Array.isArray(editTarget?.promptLevels) && editTarget.promptLevels.length > 0
      ? editTarget.promptLevels
      : defaultPromptLevels()
  );

  // Debounced search while typing; show recently used when empty
  useEffect(() => {
    const q = form.title.trim();

    // When field is empty: load recently used from the API
    if (!q) {
      const ctrl = new AbortController();
      fetch(`/smart-steps/api/goal-library/recently-used?type=GOAL`, { signal: ctrl.signal })
        .then((r) => r.ok ? r.json() : [])
        .then((logs: Array<{ goalItem?: LibraryTargetItem }>) => {
          const items: TargetSuggestion[] = logs
            .filter((l) => l.goalItem)
            .map((l) => ({
              ...(l.goalItem as LibraryTargetItem),
              source: "library" as const,
              isRecentlyUsed: true,
            }));
          setSuggestions(items);
          setShowSuggestions(items.length > 0);
        })
        .catch(() => {});
      return () => ctrl.abort();
    }

    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const id = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, clientId, type: "GOAL" });
        const res = await fetch(`/smart-steps/api/goals/search?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        const libItems: TargetSuggestion[] = (data.goalItems ?? []).slice(0, 6).map((i: LibraryTargetItem) => ({
          ...i,
          source: "library" as const,
        }));
        const clientItems: TargetSuggestion[] = (data.clientGoals ?? []).slice(0, 3).map((i: { id: string; definition: string }) => ({
          id: `client-${i.id}`, title: i.definition, source: "client" as const,
        }));
        const combined = [...libItems, ...clientItems];
        setSuggestions(combined);
        setShowSuggestions(combined.length > 0);
      } catch { /* ignore search errors */ }
    }, 250);
    return () => clearTimeout(id);
  }, [form.title, clientId]);

  /**
   * Copies a Goal Library template into the editable form. The copy is fully
   * editable and saving it creates a brand-new client Target (see performSave) —
   * the original library template is never modified. (Client)/[Client]/{{client}}
   * placeholders are replaced with the client's name on the copy only.
   */
  function importLibraryTarget(item: LibraryTargetItem) {
    const validType: TargetType = TARGET_TYPES.some((t) => t.value === item.targetType)
      ? (item.targetType as TargetType)
      : form.targetType;
    const opDef = item.operationalDefinition ?? item.baseline ?? "";

    setForm((p) => ({
      ...p,
      title:                 replaceClientNamePlaceholders(item.title, clientName),
      operationalDefinition: replaceClientNamePlaceholders(opDef, clientName),
      targetType:            validType,
    }));

    if (Array.isArray(item.promptHierarchy) && item.promptHierarchy.length > 0) {
      setPromptLevels(item.promptHierarchy.map((name, i) => ({ level: i, name })));
    }
    if (item.masteryRule && typeof item.masteryRule === "object") {
      setMastery(safeMastery(item.masteryRule as MasteryCriteria));
    }

    // Track which library item was selected — usage count incremented only after save
    setSourceLibraryId(item.id);
    setShowSuggestions(false);
    setShowLibraryPicker(false);
  }

  function applysuggestion(sugg: TargetSuggestion) {
    if (sugg.source === "library") {
      importLibraryTarget(sugg);
      return;
    }
    // Existing client goal — copy the wording only, as a fresh independent goal.
    setForm((p) => ({ ...p, title: sugg.title }));
    setSourceLibraryId(null);
    setShowSuggestions(false);
  }

  // Duplicate detection — normalize and compare word tokens
  function checkDuplicate(title: string): string | null {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
    const tokenize = (s: string) => normalize(s).split(" ").filter(Boolean);
    const newToks = tokenize(title);
    if (newToks.length === 0) return null;

    const clientTargets = allStoreTargets.filter(
      (t) => t.clientId === clientId && t.isActive && (!editTarget || t.id !== editTarget.id)
    );

    for (const t of clientTargets) {
      const existToks = tokenize(t.title);
      const shorter   = Math.min(newToks.length, existToks.length);
      const intersect = newToks.filter((tok) => existToks.includes(tok)).length;
      if (shorter > 0 && intersect / shorter >= 0.70) {
        return t.title;
      }
    }
    return null;
  }

  async function performSave() {
    setSaving(true);
    const now = new Date().toISOString();
    const id  = editTarget?.id ?? localId();

    const targetData: LocalTarget = {
      id, programId, categoryId, clientId,
      title:                 form.title.trim(),
      operationalDefinition: form.operationalDefinition.trim(),
      targetType:            form.targetType,
      phase:                 form.phase,
      masteryCriteria:       mastery,
      promptLevels,
      isActive:              true,
      createdAt:             editTarget?.createdAt ?? now,
      updatedAt:             now,
      synced:                false,
      serverId:              editTarget?.serverId,
    };

    if (editTarget) updateTarget(id, targetData);
    else            addTarget(targetData);

    try {
      const res = await fetch("/smart-steps/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition:            form.title.trim(),
          operationalDefinition: form.operationalDefinition.trim(),
          targetType:            form.targetType,
          phase:                 form.phase,
          masteryRule:           mastery,
          promptHierarchy:       promptLevels.map((p) => p.name),
          parentGoalId:          programId.startsWith("local-") ? null : programId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) useABAStore.getState().setTargetServerId(id, data.id);
        updateTarget(id, { synced: true });

        // Record library usage ONLY after confirmed successful save
        if (sourceLibraryId) {
          fetch("/smart-steps/api/goal-library/recently-used", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: sourceLibraryId, itemType: "GOAL" }),
          }).catch(() => {});
        }
      }
    } catch { /* Offline — will sync later */ }

    toast.success(editTarget ? "Target updated ✓" : "Target added ✓");
    setSaving(false);
    onSaved();
    onClose();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Target title required");

    // Check for duplicate
    if (!editTarget) {
      const dupMatch = checkDuplicate(form.title.trim());
      if (dupMatch) {
        setPendingSave(e);
        setDupWarning({ match: dupMatch });
        return;
      }
    }

    await performSave();
  }

  async function saveToLibrary() {
    if (!form.title.trim()) return toast.error("Enter a title first");
    try {
      const res = await fetch("/smart-steps/api/goal-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:                 form.title.trim(),
          operationalDefinition: form.operationalDefinition.trim() || null,
          targetType:            form.targetType,
          baseline:              null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved to Goal Library ✓");
    } catch {
      toast.error("Failed to save to library");
    }
  }

  const tabs = [
    { id: "basic", label: "Target", icon: Target },
    { id: "mastery", label: "Mastery", icon: CheckCircle2 },
    { id: "prompts", label: "Prompts", icon: Sliders },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] sm:border-[var(--accent-purple)]/40 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div>
            <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
              <Target className="h-4.5 w-4.5 text-[var(--accent-purple)]" />
              {editTarget ? "Edit Target" : "+ New Goals and Targets"}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">under: <span className="text-zinc-300">{programName}</span></p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 shrink-0">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                  tab === t.id
                    ? "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <form onSubmit={save} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === "basic" && (
            <>
              {/* ── Duplicate warning ─────────────────────────────────────── */}
              <AnimatePresence>
                {dupWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-300">This client already has a similar goal.</p>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">Existing: &ldquo;{dupWarning.match}&rdquo;</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button"
                        onClick={() => { setDupWarning(null); setPendingSave(null); onClose(); }}
                        className="rounded-lg border border-[var(--glass-border)] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors">
                        Use Existing
                      </button>
                      <button type="button"
                        onClick={() => {
                          setDupWarning(null);
                          setPendingSave(null);
                          performSave();
                        }}
                        className="rounded-lg bg-amber-400/20 border border-amber-400/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/30 transition-colors">
                        Create New Copy
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Title with smart search ────────────────────────────────── */}
              <div className="relative">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-zinc-300">
                    Target title <span className="text-[var(--accent-pink)]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLibraryPicker(true)}
                    title="Browse the Goal Library and copy an existing goal template"
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Search Goal Library
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                  <input
                    autoFocus
                    type="text"
                    value={form.title}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, title: e.target.value }));
                      setSourceLibraryId(null);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="e.g. Responds to name when called (3/3 trials)"
                    className="field-input w-full pl-9"
                    required
                  />
                </div>

                {/* Search suggestions dropdown */}
                <AnimatePresence>
                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                      className="absolute top-full left-0 right-0 z-50 mt-1 glass-card rounded-xl border border-[var(--glass-border)] shadow-xl overflow-hidden max-h-72 overflow-y-auto"
                    >
                      {suggestions[0]?.isRecentlyUsed && !form.title.trim() && (
                        <div className="px-3 py-1.5 border-b border-[var(--glass-border)]">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recently Used</span>
                        </div>
                      )}
                      {suggestions.map((sugg) => (
                        <button
                          key={sugg.id}
                          type="button"
                          onMouseDown={() => applysuggestion(sugg)}
                          className="w-full flex flex-col px-3 py-2.5 text-left hover:bg-white/10 transition-colors border-b border-[var(--glass-border)]/40 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            {sugg.isFavoriteForUser && <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />}
                            <span className="flex-1 text-zinc-200 text-sm font-medium truncate">{sugg.title}</span>
                            <span className={`text-[10px] shrink-0 rounded-full px-2 py-0.5 font-medium ${
                              sugg.source === "library"
                                ? sugg.isRecentlyUsed
                                  ? "bg-amber-400/10 text-amber-400"
                                  : "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                                : "bg-zinc-700/60 text-zinc-400"
                            }`}>
                              {sugg.isRecentlyUsed ? "recently used" : sugg.source === "library" ? "library" : "client"}
                            </span>
                          </div>
                          {(sugg.category || sugg.skillArea || (sugg.usageCount ?? 0) > 0) && (
                            <div className="flex items-center gap-2 mt-0.5 ml-0.5">
                              {sugg.category && (
                                <span className="text-[10px] text-zinc-500">{sugg.category}</span>
                              )}
                              {sugg.category && sugg.skillArea && (
                                <span className="text-[10px] text-zinc-600">·</span>
                              )}
                              {sugg.skillArea && (
                                <span className="text-[10px] text-zinc-500">{sugg.skillArea}</span>
                              )}
                              {(sugg.usageCount ?? 0) > 0 && (
                                <>
                                  <span className="text-[10px] text-zinc-600">·</span>
                                  <span className="text-[10px] text-zinc-500">Used {sugg.usageCount}×</span>
                                </>
                              )}
                            </div>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Operational definition
                  <span className="ml-1 text-xs text-zinc-500">(observable, measurable)</span>
                </label>
                <textarea
                  rows={4}
                  value={form.operationalDefinition}
                  onChange={(e) => setForm((p) => ({ ...p, operationalDefinition: e.target.value }))}
                  placeholder="When [antecedent], the client will [behavior] with [criteria]…"
                  className="field-input w-full resize-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Target type</label>
                  <select
                    value={form.targetType}
                    onChange={(e) => setForm((p) => ({ ...p, targetType: e.target.value as TargetType }))}
                    className="field-input w-full"
                  >
                    {TARGET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Current phase</label>
                  <div className="grid grid-cols-5 gap-1">
                    {PHASES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, phase: p }))}
                        className={`rounded-lg py-2 text-xs font-medium border transition-all ${
                          form.phase === p
                            ? PHASE_STYLE[p]
                            : "border-[var(--glass-border)] text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {p.charAt(0) + p.slice(1, 3).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "mastery" && (
            <MasteryCriteriaForm
              value={mastery}
              promptLevels={promptLevels}
              onChange={setMastery}
            />
          )}

          {tab === "prompts" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--background)]/60 p-4">
                <PromptLevelsEditor value={promptLevels} onChange={setPromptLevels} />
              </div>
              <p className="text-xs text-zinc-500 flex items-start gap-2 px-1">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--accent-cyan)]" />
                Level 0 should always be "Independent". Higher numbers = more restrictive prompts.
                These levels appear as tap buttons during session recording.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2 pb-1 sticky bottom-0 bg-[var(--glass-bg)] -mx-5 px-5 py-3 border-t border-[var(--glass-border)] mt-4">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 rounded-xl py-3 font-bold text-base disabled:opacity-60"
            >
              {saving ? "Saving…" : editTarget ? "Update Target" : "Add Target ✓"}
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={saveToLibrary}
                title="Save as reusable template in Goal Library"
                className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-3 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors shrink-0"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Save to Library
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary rounded-xl px-5 py-3"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>

      <AnimatePresence>
        {showLibraryPicker && (
          <LibraryGoalPicker
            clientId={clientId}
            clientName={clientName}
            onSelect={importLibraryTarget}
            onClose={() => setShowLibraryPicker(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Goal Library Picker ────────────────────────────────────────────────── */

function LibraryGoalPicker({
  clientId,
  clientName,
  onSelect,
  onClose,
}: {
  clientId: string;
  clientName: string;
  onSelect: (item: LibraryTargetItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery]     = useState("");
  const [items, setItems]     = useState<LibraryTargetItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), clientId, type: "GOAL" });
        const res = await fetch(`/smart-steps/api/goals/search?${params}`, { signal: ctrl.signal });
        if (!res.ok) { setItems([]); return; }
        const data = await res.json();
        setItems((data.goalItems ?? []) as LibraryTargetItem[]);
      } catch {
        /* aborted or failed — keep prior list */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [query, clientId]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8 }}
        className="glass-card flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--accent-cyan)]/40 p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--foreground)]">
            <BookOpen className="h-4.5 w-4.5 text-[var(--accent-cyan)]" />
            Goal Library
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search goal templates…"
            className="field-input w-full pl-9"
          />
        </div>

        {clientName && (
          <p className="mb-3 text-[11px] text-zinc-500">
            Selected goals are copied into a new, fully-editable client goal. Placeholders like{" "}
            <span className="text-zinc-400">(Client)</span> become{" "}
            <span className="text-zinc-300">{clientName}</span>. The library template is not changed.
          </p>
        )}

        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {loading && items.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-xl border border-[var(--glass-border)] bg-white/[0.02] animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-600">
              {query.trim() ? "No matching goal templates." : "No goal templates in the library yet."}
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className="w-full rounded-xl border border-[var(--glass-border)]/50 px-3 py-2.5 text-left hover:border-[var(--accent-cyan)]/50 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {item.isFavoriteForUser && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                  <span className="flex-1 truncate text-sm font-medium text-zinc-200">{item.title}</span>
                  {(item.usageCount ?? 0) > 0 && (
                    <span className="shrink-0 text-[10px] text-zinc-500">Used {item.usageCount}×</span>
                  )}
                </div>
                {(item.operationalDefinition || item.category || item.skillArea) && (
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                    {item.operationalDefinition
                      || [item.category, item.skillArea].filter(Boolean).join(" · ")}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Category Modal ─────────────────────────────────────────────────────── */

function CategoryModal({
  clientId,
  onClose,
  onSaved,
  editCat,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
  editCat?: LocalCategory | null;
}) {
  const addCategory = useABAStore((s) => s.addCategory);
  const updateCategory = useABAStore((s) => s.updateCategory);
  const [name, setName] = useState(editCat?.name ?? "");
  const [color, setColor] = useState(editCat?.color ?? categoryColor(editCat?.serverId ?? editCat?.id ?? ""));
  const [description, setDescription] = useState(editCat?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Category name required");
    setSaving(true);

    const now = new Date().toISOString();
    const id = editCat?.id ?? localId();

    const catData: LocalCategory = {
      id,
      clientId,
      name: name.trim(),
      color,
      description: description.trim(),
      createdAt: editCat?.createdAt ?? now,
      synced: false,
      serverId: editCat?.serverId,
    };

    if (editCat) {
      updateCategory(id, catData);
    } else {
      addCategory(catData);
    }

    // Sync to server (Programs = Categories in DB)
    try {
      const res = await fetch("/smart-steps/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name: name.trim(), domain: name.trim(), description: description.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) useABAStore.getState().setCategoryServerId(id, data.id);
      }
    } catch { /* offline — that's fine */ }

    toast.success(editCat ? `"${name}" updated ✓` : `Category "${name}" created ✓`);
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 8 }}
        className="glass-card w-full max-w-md rounded-2xl p-6 border border-[var(--accent-cyan)]/40"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
            <Layers className="h-5 w-5 text-[var(--accent-cyan)]" />
            {editCat ? "Edit Category" : "+ Category (Skill Area)"}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Category / Skill Area name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Language & Communication"
              className="field-input w-full" required
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-2">Quick presets</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_PRESETS.map((p) => (
                <button
                  key={p} type="button" onClick={() => setName(p)}
                  className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_COLOR_PALETTE.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-xl transition-all ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--background)] scale-110" : "hover:scale-105"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description (optional)</label>
            <textarea
              rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this skill area…"
              className="field-input w-full resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Creating…" : editCat ? "Save Changes" : "Create Category"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Program Modal (Goal Name under a Category) ─────────────────────────── */

function ProgramModal({
  clientId,
  categoryId,
  categoryName,
  onClose,
  onSaved,
}: {
  clientId: string;
  categoryId: string;
  categoryName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: session } = useSession();
  const canWrite = ["ADMIN", "BCBA"].includes((session?.user as { role?: string } | undefined)?.role ?? "");
  const addProgram = useABAStore((s) => s.addProgram);
  const { data: clientInfo } = useQuery<{ name: string }>({
    queryKey: ["client-name", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });
  const clientName = clientInfo?.name ?? "";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Smart search for parent goal library — recently used on empty, live search while typing
  const [pgSuggestions, setPgSuggestions]     = useState<Array<{
    id: string; title: string; isFavoriteForUser?: boolean;
    isRecentlyUsed?: boolean; domain?: string | null; usageCount?: number;
  }>>([]);
  const [showPgSuggestions, setShowPgSuggestions] = useState(false);

  useEffect(() => {
    const q = name.trim();

    if (!q) {
      const ctrl = new AbortController();
      fetch(`/smart-steps/api/goal-library/recently-used?type=PARENT_GOAL`, { signal: ctrl.signal })
        .then((r) => r.ok ? r.json() : [])
        .then((logs: Array<{ parentItem?: { id: string; title: string; domain?: string | null; usageCount?: number } }>) => {
          const items = logs
            .filter((l) => l.parentItem)
            .map((l) => ({
              id: l.parentItem!.id,
              title: l.parentItem!.title,
              isRecentlyUsed: true,
              domain: l.parentItem!.domain ?? null,
              usageCount: l.parentItem!.usageCount ?? 0,
            }));
          setPgSuggestions(items);
          setShowPgSuggestions(items.length > 0);
        })
        .catch(() => {});
      return () => ctrl.abort();
    }

    if (q.length < 2) {
      setPgSuggestions([]);
      setShowPgSuggestions(false);
      return;
    }

    const id = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, type: "PARENT_GOAL" });
        const res  = await fetch(`/smart-steps/api/goals/search?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        const items = (data.parentItems ?? []).slice(0, 6).map((i: {
          id: string; title: string; isFavoriteForUser?: boolean;
          isRecentlyUsed?: boolean; domain?: string | null; usageCount?: number;
        }) => ({
          id: i.id, title: i.title, isFavoriteForUser: i.isFavoriteForUser,
          isRecentlyUsed: i.isRecentlyUsed, domain: i.domain ?? null,
          usageCount: i.usageCount ?? 0,
        }));
        setPgSuggestions(items);
        setShowPgSuggestions(items.length > 0);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(id);
  }, [name]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const id  = localId();
    const now = new Date().toISOString();

    addProgram({ id, categoryId, clientId, name: name.trim(), description: description.trim(), createdAt: now, synced: false });

    try {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim(), description: description.trim(), domain: categoryName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) useABAStore.getState().setProgramServerId(id, data.id);
      }
    } catch { /* offline */ }

    toast.success(`"${name}" added ✓`);
    setSaving(false);
    onSaved();
    onClose();
  }

  async function saveAsParentGoalTemplate() {
    if (!name.trim()) return toast.error("Enter a name first");
    try {
      const res = await fetch("/smart-steps/api/parent-goal-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       name.trim(),
          description: description.trim() || null,
          domain:      categoryName || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved as Parent Goal Template ✓");
    } catch {
      toast.error("Failed to save template");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 8 }}
        className="glass-card w-full max-w-md rounded-2xl p-6 border border-[var(--accent-purple)]/40"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">New Program / Goal</h2>
            <p className="text-xs text-zinc-500">under: <span className="text-zinc-300">{categoryName}</span></p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Goal / Program name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              <input
                autoFocus required type="text" value={name}
                onChange={(e) => { setName(e.target.value); }}
                onFocus={() => setShowPgSuggestions(true)}
                onBlur={() => setTimeout(() => setShowPgSuggestions(false), 150)}
                placeholder="e.g. Listening Skills, Manding for items"
                className="field-input w-full pl-9"
              />
              <AnimatePresence>
                {showPgSuggestions && pgSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                    className="absolute top-full left-0 right-0 z-50 mt-1 glass-card rounded-xl border border-[var(--glass-border)] shadow-xl overflow-hidden max-h-64 overflow-y-auto"
                  >
                    {pgSuggestions[0]?.isRecentlyUsed && !name.trim() && (
                      <div className="px-3 py-1.5 border-b border-[var(--glass-border)]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recently Used</span>
                      </div>
                    )}
                    {pgSuggestions.map((s) => (
                      <button key={s.id} type="button"
                        onMouseDown={() => { setName(replaceClientNamePlaceholders(s.title, clientName)); setShowPgSuggestions(false); }}
                        className="w-full flex flex-col px-3 py-2.5 text-left hover:bg-white/10 transition-colors border-b border-[var(--glass-border)]/40 last:border-b-0">
                        <div className="flex items-center gap-2">
                          {s.isFavoriteForUser && <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />}
                          <span className="flex-1 text-zinc-200 text-sm font-medium truncate">{s.title}</span>
                          <span className={`text-[10px] shrink-0 rounded-full px-2 py-0.5 font-medium ${
                            s.isRecentlyUsed
                              ? "bg-amber-400/10 text-amber-400"
                              : "bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]"
                          }`}>
                            {s.isRecentlyUsed ? "recently used" : "library"}
                          </span>
                        </div>
                        {(s.domain || (s.usageCount ?? 0) > 0) && (
                          <div className="flex items-center gap-2 mt-0.5">
                            {s.domain && <span className="text-[10px] text-zinc-500">{s.domain}</span>}
                            {s.domain && (s.usageCount ?? 0) > 0 && <span className="text-[10px] text-zinc-600">·</span>}
                            {(s.usageCount ?? 0) > 0 && <span className="text-[10px] text-zinc-500">Used {s.usageCount}×</span>}
                          </div>
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea
              rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Long-term goal or program description…"
              className="field-input w-full resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Adding…" : "Create Program"}
            </button>
            {canWrite && (
              <button type="button"
                onClick={saveAsParentGoalTemplate}
                title="Save as reusable Parent Goal Template"
                className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-3 py-3 text-xs font-semibold text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 transition-colors shrink-0">
                <BookOpen className="h-3.5 w-3.5" />
                Save Template
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Target Card ────────────────────────────────────────────────────────── */

function TargetCard({
  target,
  onEdit,
  onRemove,
  onPhaseChange,
}: {
  target: LocalTarget;
  onEdit: () => void;
  onRemove: () => void;
  onPhaseChange: (p: Phase) => void;
}) {
  const [showPhaseMenu, setShowPhaseMenu] = useState(false);
  const phase: Phase = safePhase(target.phase);
  const mc = safeMastery(target.masteryCriteria);
  const lifecycle = lifecycleFromPhase(phase);
  const cardClass = isNewPhase(phase)
    ? "border-amber-400/45 bg-amber-400/[0.06]"
    : isMasteredPhase(phase)
      ? "border-emerald-400/30 bg-emerald-400/[0.04]"
      : "border-[var(--glass-border)] bg-[var(--background)]/50";

  return (
    <motion.div
      layout
      className={`relative rounded-2xl border p-4 group hover:border-[var(--glass-border)]/80 transition-colors ${cardClass}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${PHASE_DOT[phase]}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--foreground)] text-sm leading-snug">{target.title}</p>
          {target.operationalDefinition && (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{target.operationalDefinition}</p>
          )}

          {/* Mastery summary */}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--glass-border)]/60 px-2 py-0.5 text-xs text-zinc-400">
              {TARGET_TYPES.find((t) => t.value === target.targetType)?.label?.split(" ")[0] ?? target.targetType}
            </span>
            <span className="rounded-full bg-[var(--glass-border)]/60 px-2 py-0.5 text-xs text-zinc-400">
              {mc.percentage}% · {mc.consecutiveDays}d · {mc.consecutiveSessions} sessions
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${PHASE_STYLE[phase]}`}>
              {isNewPhase(phase) && <Lightbulb className="h-3 w-3" />}
              {lifecycleDisplayLabel(phase)}
            </span>
            {mc.masteryType === "MANUAL" && (
              <span className="rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 px-2 py-0.5 text-xs">
                Manual mastery
              </span>
            )}
          </div>

          {/* Dates */}
          {(mc.openedDate || mc.baselineDate || mc.masteredDate) && (
            <div className="mt-1.5 flex gap-3 text-xs text-zinc-600">
              {mc.openedDate && <span>Opened: {mc.openedDate}</span>}
              {mc.baselineDate && <span>Baseline: {mc.baselineDate}</span>}
              {mc.masteredDate && <span className="text-emerald-400">Mastered: {mc.masteredDate}</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-start gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <select
            value={lifecycle}
            onChange={(e) => onPhaseChange(phaseFromLifecycle(e.target.value as GoalLifecycleKey))}
            className="rounded-lg border border-[var(--glass-border)] bg-[var(--background)] px-2 py-1 text-xs text-zinc-300 max-w-[7.5rem]"
            aria-label="Goal status"
          >
            {GOAL_LIFECYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPhaseMenu((v) => !v)}
              className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
              title="Change phase"
            >
              <BarChart2 className="h-3.5 w-3.5" />
            </button>
            <AnimatePresence>
              {showPhaseMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  className="absolute right-0 top-8 z-20 glass-card rounded-xl border border-[var(--glass-border)] p-1 min-w-[140px] shadow-xl"
                >
                  {PHASES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { onPhaseChange(p); setShowPhaseMenu(false); }}
                      className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-left transition-colors hover:bg-white/10 ${phase === p ? "text-[var(--accent-cyan)]" : "text-zinc-300"}`}
                    >
                      <div className={`h-2 w-2 rounded-full ${PHASE_DOT[p]}`} />
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Not synced indicator */}
      {!target.synced && (
        <div className="absolute top-2 right-2">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Pending sync" />
        </div>
      )}
    </motion.div>
  );
}

/* ─── Program Row ────────────────────────────────────────────────────────── */

function ProgramRow({
  program,
  clientId,
  onRefresh,
  onRemove,
}: {
  program: LocalProgram;
  clientId: string;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [editTarget, setEditTarget] = useState<LocalTarget | null>(null);

  const rawProgramTargets = useABAStore((s) => s.targets);
  const targets = useMemo(
    () => sortByCreatedAt(rawProgramTargets.filter((t) => t.clientId === clientId && t.programId === program.id && t.isActive)),
    [rawProgramTargets, clientId, program.id],
  );
  const setTargetPhase = useABAStore((s) => s.setTargetPhase);
  const removeTarget = useABAStore((s) => s.removeTarget);
  const updateTarget = useABAStore((s) => s.updateTarget);

  const mastered = targets.filter((t) => t.phase === "MASTERED").length;
  const pct = targets.length > 0 ? Math.round((mastered / targets.length) * 100) : 0;

  function handlePhaseChange(targetId: string, phase: Phase) {
    setTargetPhase(targetId, phase);
    const t = useABAStore.getState().targets.find((tt) => tt.id === targetId);
    if (t?.serverId) {
      fetch(`/smart-steps/api/targets/${t.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      }).catch(() => {});
    }
    toast.success(`Status → ${lifecycleDisplayLabel(phase)}`);
  }

  function handleRemoveTarget(targetId: string) {
    if (!confirm("Remove this target?")) return;
    removeTarget(targetId);
    toast.success("Target removed");
    // Sync archive to server
    const t = useABAStore.getState().targets.find((tt) => tt.id === targetId);
    if (t?.serverId) {
      fetch(`/smart-steps/api/targets/${t.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }).catch(() => {});
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--glass-border)]/60 overflow-visible">
      {/* Program header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-[var(--glass-bg)]/30 hover:bg-[var(--glass-bg)]/50 transition-colors rounded-2xl text-left"
      >
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
        </motion.div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--foreground)] text-sm">{program.name}</p>
          {program.description && <p className="text-xs text-zinc-500 truncate">{program.description}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
          {targets.length > 0 && (
            <>
              <span>{mastered}/{targets.length} mastered</span>
              <div className="h-1.5 w-16 rounded-full bg-[var(--glass-border)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent-cyan)]" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
          <span>{targets.length} target{targets.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </button>

      {/* Targets */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-visible"
          >
            <div className="px-4 pb-4 pt-1 space-y-2">
              {targets.map((t) => (
                <TargetCard
                  key={t.id}
                  target={t}
                  onEdit={() => { setEditTarget(t); setShowTargetModal(true); }}
                  onRemove={() => handleRemoveTarget(t.id)}
                  onPhaseChange={(p) => handlePhaseChange(t.id, p)}
                />
              ))}

              {/* + New Goals and Targets */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="button"
                onClick={() => { setEditTarget(null); setShowTargetModal(true); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--accent-purple)]/40 px-4 py-3 text-sm font-medium text-[var(--accent-purple)] hover:border-[var(--accent-purple)]/70 hover:bg-[var(--accent-purple)]/5 transition-all"
              >
                <Plus className="h-4 w-4" />
                + New Goals and Targets
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTargetModal && (
          <TargetModal
            clientId={clientId}
            categoryId={program.categoryId}
            programId={program.id}
            programName={program.name}
            editTarget={editTarget}
            onClose={() => { setShowTargetModal(false); setEditTarget(null); }}
            onSaved={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Category Section ───────────────────────────────────────────────────── */

function CategorySection({
  category,
  clientId,
  onRefresh,
  onEditCategory,
}: {
  category: LocalCategory;
  clientId: string;
  onRefresh: () => void;
  onEditCategory: (cat: LocalCategory) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showProgramModal, setShowProgramModal] = useState(false);

  const rawSectionPrograms = useABAStore((s) => s.programs);
  const programs = useMemo(
    () => sortByCreatedAt(rawSectionPrograms.filter((p) => p.categoryId === category.id && p.clientId === clientId)),
    [rawSectionPrograms, category.id, clientId],
  );
  const removeProgram = useABAStore((s) => s.removeProgram);
  const rawSectionTargets = useABAStore((s) => s.targets);
  const allTargets = useMemo(
    () => rawSectionTargets.filter((t) => t.clientId === clientId && t.categoryId === category.id && t.isActive),
    [rawSectionTargets, clientId, category.id],
  );

  const mastered = allTargets.filter((t) => t.phase === "MASTERED").length;
  const acquisition = allTargets.filter((t) => t.phase === "ACQUISITION").length;

  function handleRemoveProgram(id: string) {
    if (!confirm("Remove this program and all its targets?")) return;
    removeProgram(id);
    toast.success("Program removed");
  }

  return (
    <motion.div layout className="glass-card rounded-2xl overflow-visible border border-[var(--glass-border)]">
      {/* Category header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight className="h-5 w-5 text-zinc-400 shrink-0" />
        </motion.div>

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white text-sm font-bold"
          style={{ background: category.color ?? categoryColor(category.serverId ?? category.id) }}
        >
          {(category.name?.trim() || "?").charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[var(--foreground)] text-base leading-tight">{category.name?.trim() || "Untitled"}</h3>
          {category.description && <p className="text-xs text-zinc-500 truncate">{category.description}</p>}
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
          <span>{programs.length} program{programs.length !== 1 ? "s" : ""}</span>
          {allTargets.length > 0 && (
            <>
              <span className="text-[var(--accent-cyan)]">{acquisition} active</span>
              <span className="text-emerald-400">{mastered}/{allTargets.length} mastered</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEditCategory(category); }}
          className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-cyan)] transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {/* Programs + targets */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-visible"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-[var(--glass-border)]/40 pt-3">
              {programs.length === 0 && (
                <p className="text-xs text-zinc-500 text-center py-3">
                  No programs yet — add a program, then add targets under it.
                </p>
              )}

              {programs.map((prog) => (
                <ProgramRow
                  key={prog.id}
                  program={prog}
                  clientId={clientId}
                  onRefresh={onRefresh}
                  onRemove={() => handleRemoveProgram(prog.id)}
                />
              ))}

              {/* Add program button */}
              <button
                type="button"
                onClick={() => setShowProgramModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-3 text-sm text-zinc-500 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
              >
                <Plus className="h-4 w-4" /> + Add Program / Goal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProgramModal && (
          <ProgramModal
            clientId={clientId}
            categoryId={category.id}
            categoryName={category.name}
            onClose={() => setShowProgramModal(false)}
            onSaved={onRefresh}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function GoalsPage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const [tick, setTick] = useState(0);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editCategory, setEditCategory] = useState<LocalCategory | null>(null);
  const updateTarget = useABAStore((s) => s.updateTarget);

  // Fix legacy / partially-synced rows so this page never crashes on bad persisted data.
  useEffect(() => {
    if (!clientId) return;
    const { targets } = useABAStore.getState();
    for (const t of targets) {
      if (t.clientId !== clientId) continue;
      const badMc =
        !t.masteryCriteria ||
        typeof t.masteryCriteria !== "object" ||
        typeof (t.masteryCriteria as MasteryCriteria).percentage !== "number";
      const badPhase = !t.phase || !PHASES.includes(t.phase as Phase);
      if (badMc || badPhase) {
        updateTarget(t.id, {
          ...(badMc ? { masteryCriteria: safeMastery(t.masteryCriteria) } : {}),
          ...(badPhase ? { phase: safePhase(t.phase) } : {}),
        });
      }
    }
  }, [clientId, updateTarget]);

  const rawPageCategories = useABAStore((s) => s.categories);
  const categories = useMemo(
    () => sortByCreatedAt(rawPageCategories.filter((c) => c.clientId === clientId)),
    [rawPageCategories, clientId],
  );
  const rawPageTargets = useABAStore((s) => s.targets);
  const allTargets = useMemo(
    () => rawPageTargets.filter((t) => t.clientId === clientId && t.isActive),
    [rawPageTargets, clientId],
  );

  // Sync server data into the local store on mount
  const { data: client } = useQuery<{ name: string }>({
    queryKey: ["client-name", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!clientId,
  });

  function refresh() {
    setTick((t) => t + 1);
  }

  const mastered = allTargets.filter((t) => t.phase === "MASTERED").length;
  const acquisition = allTargets.filter((t) => t.phase === "ACQUISITION").length;
  const newGoals = allTargets.filter((t) => t.phase === "NEW").length;

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Link
            href={`/clients/${clientId}`}
            className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Goals &amp; Targets</h1>
            <p className="text-zinc-500 text-sm">
              {client ? `${client.name} · ` : ""}
              {categories.length} categor{categories.length !== 1 ? "ies" : "y"} · {allTargets.length} target{allTargets.length !== 1 ? "s" : ""}
              {typeof window !== "undefined" && window.navigator?.onLine === false && (
                <span className="ml-2 text-amber-400">· offline — saved locally</span>
              )}
            </p>
          </div>
        </div>

        {/* Quick stats */}
        {allTargets.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Total", value: allTargets.length, color: "var(--foreground)" },
              { label: "New", value: newGoals, color: "#fbbf24" },
              { label: "In Treatment", value: acquisition, color: "var(--accent-cyan)" },
              { label: "Mastered", value: mastered, color: "#34d399" },
            ].map((s) => (
              <div key={s.label} className="glass-card rounded-xl p-3 text-center">
                <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => { setEditCategory(null); setShowCategoryModal(true); }}
            className="tap-target flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-4 py-2.5 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
          >
            <Layers className="h-4 w-4" />
            + Category
          </motion.button>
          <Link
            href={`/clients/${clientId}/session/new`}
            className="tap-target flex items-center gap-2 rounded-xl bg-[var(--accent-purple)]/20 border border-[var(--accent-purple)]/30 px-4 py-2.5 text-sm font-semibold text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/30 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Start Session
          </Link>
        </div>
      </motion.div>

      {/* Category sections */}
      {categories.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-dashed border-[var(--glass-border)] py-20 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-cyan)]/10 to-[var(--accent-purple)]/10 mx-auto mb-4">
            <Layers className="h-8 w-8 text-[var(--accent-cyan)]" />
          </div>
          <p className="text-zinc-300 font-semibold mb-1">No skill areas yet</p>
          <p className="text-zinc-600 text-sm mb-6 max-w-xs mx-auto">
            Start with a <strong className="text-zinc-400">Category</strong> (e.g. "Language &amp; Communication"),
            add a <strong className="text-zinc-400">Program</strong> (e.g. "Listening Skills"),
            then add individual <strong className="text-zinc-400">Targets</strong> with mastery criteria.
          </p>
          <button
            type="button"
            onClick={() => setShowCategoryModal(true)}
            className="tap-target inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-6 py-3 text-sm font-semibold text-[var(--accent-cyan)]"
          >
            <Plus className="h-4 w-4" /> + Create First Category
          </button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <CategorySection
              key={`${cat.id}-${tick}`}
              category={cat}
              clientId={clientId}
              onRefresh={refresh}
              onEditCategory={(c) => { setEditCategory(c); setShowCategoryModal(true); }}
            />
          ))}

          {/* Bottom add buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setEditCategory(null); setShowCategoryModal(true); }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-3 text-sm text-zinc-500 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
            >
              <Layers className="h-4 w-4" /> + Category
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCategoryModal && (
          <CategoryModal
            clientId={clientId}
            editCat={editCategory}
            onClose={() => { setShowCategoryModal(false); setEditCategory(null); }}
            onSaved={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
