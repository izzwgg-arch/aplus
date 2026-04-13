"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, Plus, Target, Layers, Trash2, Pencil,
  CheckCircle2, BarChart2, Zap, X, Sliders, Info, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  useABAStore, defaultMastery, defaultPromptLevels,
  type LocalCategory, type LocalProgram, type LocalTarget,
  type MasteryCriteria, type PromptLevel, type TargetType, type Phase,
} from "@/store/abaStore";
import type { TargetPanelData } from "./TargetDetailPanel";

/* ─── Constants ─────────────────────────────────────────────────────────── */

const TARGET_TYPES: { value: TargetType; label: string }[] = [
  { value: "DISCRETE_TRIAL",        label: "Discrete Trial Training (DTT)" },
  { value: "TASK_ANALYSIS_FWD",     label: "Task Analysis — Forward Chaining" },
  { value: "TASK_ANALYSIS_BWD",     label: "Task Analysis — Backward Chaining" },
  { value: "TASK_ANALYSIS_TOTAL",   label: "Task Analysis — Total Task" },
  { value: "DURATION",              label: "Duration Recording" },
  { value: "LATENCY",               label: "Latency Recording" },
  { value: "FREQUENCY",             label: "Frequency / Event Recording" },
  { value: "PARTIAL_INTERVAL",      label: "Partial Interval Recording" },
  { value: "WHOLE_INTERVAL",        label: "Whole Interval Recording" },
  { value: "MOMENTARY_TIME_SAMPLE", label: "Momentary Time Sampling (MTS)" },
  { value: "COLD_PROBE",            label: "Cold Probe" },
  { value: "OTHER",                 label: "Other" },
];

const PHASES: Phase[] = ["BASELINE", "ACQUISITION", "MAINTENANCE", "GENERALIZATION", "MASTERED"];

const PHASE_STYLE: Record<Phase, string> = {
  BASELINE:       "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  ACQUISITION:    "bg-cyan-400/15 text-cyan-300 border-cyan-400/30",
  MAINTENANCE:    "bg-amber-400/15 text-amber-300 border-amber-400/30",
  GENERALIZATION: "bg-purple-400/15 text-purple-300 border-purple-400/30",
  MASTERED:       "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
};

const PHASE_DOT: Record<Phase, string> = {
  BASELINE:       "bg-zinc-400",
  ACQUISITION:    "bg-cyan-400",
  MAINTENANCE:    "bg-amber-400",
  GENERALIZATION: "bg-purple-400",
  MASTERED:       "bg-emerald-400",
};

const CATEGORY_COLORS = [
  "#06b6d4", "#a855f7", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#f97316", "#8b5cf6", "#14b8a6", "#ef4444",
];

const CATEGORY_PRESETS = [
  "Language & Communication", "Social Skills", "Manding (Requesting)",
  "Tacting (Labeling)", "Intraverbal", "Self-Care / Daily Living",
  "Fine Motor Skills", "Gross Motor Skills", "Academic / Pre-Academic",
  "Behavior Reduction", "Play & Leisure", "Cognitive Skills",
];

function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ─── MasteryCriteriaForm ────────────────────────────────────────────────── */

function MasteryCriteriaForm({
  value,
  promptLevels,
  onChange,
}: {
  value: MasteryCriteria;
  promptLevels: PromptLevel[];
  onChange: (m: MasteryCriteria) => void;
}) {
  function set(patch: Partial<MasteryCriteria>) { onChange({ ...value, ...patch }); }

  return (
    <div className="space-y-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--background)]/60 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--accent-cyan)]" />
          Mastery Criteria
        </p>
        <div className="flex items-center gap-2">
          {(["AUTOMATIC", "MANUAL"] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => set({ masteryType: t })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                value.masteryType === t
                  ? t === "AUTOMATIC" ? "bg-[var(--accent-cyan)] text-black" : "bg-[var(--accent-purple)] text-white"
                  : "border border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {value.masteryType === "AUTOMATIC" && (
        <div className="space-y-4">
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
            {([
              { key: "consecutiveDays",     label: "Consecutive days" },
              { key: "consecutiveSessions", label: "Consecutive sessions" },
              { key: "minTrialsPerSession", label: "Min trials/session" },
            ] as { key: keyof MasteryCriteria; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-zinc-400 mb-1.5">{label}</label>
                <input
                  type="number" min={1} max={30}
                  value={value[key] as number}
                  onChange={(e) => set({ [key]: Number(e.target.value) })}
                  className="field-input w-full text-sm text-center"
                />
              </div>
            ))}
          </div>

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
              <label className="block text-xs text-zinc-400 mb-1.5">Prompt level ≤ (first trial)</label>
              <select
                value={value.firstTrialPromptLevel ?? 0}
                onChange={(e) => set({ firstTrialPromptLevel: Number(e.target.value) })}
                className="field-input w-full text-sm"
              >
                {promptLevels.map((pl) => (
                  <option key={pl.level} value={pl.level}>{pl.level} — {pl.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Prompt level to achieve mastery at</label>
            <select
              value={value.promptLevelToMaster}
              onChange={(e) => set({ promptLevelToMaster: Number(e.target.value) })}
              className="field-input w-full text-sm"
            >
              {promptLevels.map((pl) => (
                <option key={pl.level} value={pl.level}>Level {pl.level} — {pl.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="border-t border-[var(--glass-border)] pt-4">
        <p className="text-xs text-zinc-500 mb-3 flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {value.masteryType === "MANUAL" ? "Set all dates manually" : "Optional dates"}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { key: "openedDate",   label: "Opened" },
            { key: "baselineDate", label: "Baseline" },
            { key: "masteredDate", label: value.masteryType === "MANUAL" ? "Mastered *" : "Mastered (auto)" },
          ] as { key: keyof MasteryCriteria; label: string }[]).map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-zinc-400 mb-1">{label}</label>
              <input
                type="date"
                value={(value[key] as string | null) ?? ""}
                onChange={(e) => set({ [key]: e.target.value || null })}
                className="field-input w-full text-xs"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── PromptLevelsEditor ─────────────────────────────────────────────────── */

function PromptLevelsEditor({
  value,
  onChange,
}: {
  value: PromptLevel[];
  onChange: (v: PromptLevel[]) => void;
}) {
  function update(idx: number, patch: Partial<PromptLevel>) {
    onChange(value.map((pl, i) => (i === idx ? { ...pl, ...patch } : pl)));
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
          onClick={() => onChange([...value, { level: value.length, name: "" }])}
          className="text-xs text-[var(--accent-cyan)] hover:underline"
        >
          + Add level
        </button>
      </div>
      {value.map((pl, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 text-center text-xs text-zinc-500 shrink-0">{pl.level}</span>
          <input
            type="text" value={pl.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder={`Level ${pl.level} name…`}
            className="field-input flex-1 text-sm py-1.5"
          />
          {value.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <p className="text-xs text-zinc-600 flex items-start gap-1.5 pt-1">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--accent-cyan)]" />
        Level 0 = Independent. Higher = more restrictive. These appear as tap-buttons during sessions.
      </p>
    </div>
  );
}

/* ─── CategoryModal ──────────────────────────────────────────────────────── */

function CategoryModal({
  clientId,
  editCat,
  onClose,
  onSaved,
}: {
  clientId: string;
  editCat?: LocalCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addCategory    = useABAStore((s) => s.addCategory);
  const updateCategory = useABAStore((s) => s.updateCategory);
  const [name, setName]               = useState(editCat?.name ?? "");
  const [color, setColor]             = useState(editCat?.color ?? CATEGORY_COLORS[0]);
  const [description, setDescription] = useState(editCat?.description ?? "");
  const [saving, setSaving]           = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    const now = new Date().toISOString();
    const id  = editCat?.id ?? localId();
    const catData: LocalCategory = {
      id, clientId, name: name.trim(), color, description: description.trim(),
      createdAt: editCat?.createdAt ?? now, synced: false, serverId: editCat?.serverId,
    };
    editCat ? updateCategory(id, catData) : addCategory(catData);
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
    } catch { /* offline */ }
    toast.success(editCat ? `"${name}" updated ✓` : `Skill area "${name}" created ✓`);
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 8 }}
        className="glass-card w-full max-w-md rounded-2xl p-6 border border-[var(--accent-cyan)]/40"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
            <Layers className="h-5 w-5 text-[var(--accent-cyan)]" />
            {editCat ? "Edit Skill Area" : "Add Skill Area"}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Skill area name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
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
              {CATEGORY_COLORS.map((c) => (
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
              rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this skill area…"
              className="field-input w-full resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving…" : editCat ? "Save Changes" : "Create Skill Area"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── ProgramModal ───────────────────────────────────────────────────────── */

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
  const addProgram = useABAStore((s) => s.addProgram);
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving]           = useState(false);

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

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 8 }}
        className="glass-card w-full max-w-md rounded-2xl p-6 border border-[var(--accent-purple)]/40"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">New Program</h2>
            <p className="text-xs text-zinc-500">under: <span className="text-zinc-300">{categoryName}</span></p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Program name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus required type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Listening Skills, Manding for items"
              className="field-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea
              rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Long-term goal or program description…"
              className="field-input w-full resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Adding…" : "Create Program"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── TargetModal ────────────────────────────────────────────────────────── */

function TargetModal({
  clientId, categoryId, programId, programName, editTarget, onClose, onSaved,
}: {
  clientId: string;
  categoryId: string;
  programId: string;
  programName: string;
  editTarget?: LocalTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addTarget    = useABAStore((s) => s.addTarget);
  const updateTarget = useABAStore((s) => s.updateTarget);
  const [saving, setSaving] = useState(false);
  const [tab, setTab]       = useState<"basic" | "mastery" | "prompts">("basic");
  const [form, setForm]     = useState({
    title:                editTarget?.title ?? "",
    operationalDefinition: editTarget?.operationalDefinition ?? "",
    targetType:           (editTarget?.targetType ?? "DISCRETE_TRIAL") as TargetType,
    phase:                (editTarget?.phase ?? "ACQUISITION") as Phase,
  });
  const [mastery, setMastery]           = useState<MasteryCriteria>(editTarget?.masteryCriteria ?? defaultMastery());
  const [promptLevels, setPromptLevels] = useState<PromptLevel[]>(editTarget?.promptLevels ?? defaultPromptLevels());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Target title required");
    setSaving(true);
    const now = new Date().toISOString();
    const id  = editTarget?.id ?? localId();
    const targetData: LocalTarget = {
      id, programId, categoryId, clientId,
      title: form.title.trim(),
      operationalDefinition: form.operationalDefinition.trim(),
      targetType: form.targetType,
      phase: form.phase,
      masteryCriteria: mastery,
      promptLevels,
      isActive: true,
      createdAt: editTarget?.createdAt ?? now,
      updatedAt: now,
      synced: false,
      serverId: editTarget?.serverId,
    };
    editTarget ? updateTarget(id, targetData) : addTarget(targetData);
    try {
      const res = await fetch("/smart-steps/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: form.title.trim(),
          operationalDefinition: form.operationalDefinition.trim(),
          targetType: form.targetType,
          phase: form.phase,
          masteryRule: mastery,
          promptHierarchy: promptLevels.map((p) => p.name),
          parentGoalId: programId.startsWith("local-") ? null : programId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) useABAStore.getState().setTargetServerId(id, data.id);
        updateTarget(id, { synced: true });
      }
    } catch { /* offline */ }
    toast.success(editTarget ? "Target updated ✓" : "Target added ✓");
    setSaving(false);
    onSaved();
    onClose();
  }

  const MODAL_TABS = [
    { id: "basic",   label: "Target",  icon: Target },
    { id: "mastery", label: "Mastery", icon: CheckCircle2 },
    { id: "prompts", label: "Prompts", icon: Sliders },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] sm:border-[var(--accent-purple)]/40 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div>
            <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--accent-purple)]" />
              {editTarget ? "Edit Target" : "Create New Target"}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              under: <span className="text-zinc-300">{programName}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 px-4 pt-3 shrink-0">
          {MODAL_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id} type="button" onClick={() => setTab(t.id)}
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
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Target title <span className="text-[var(--accent-pink)]">*</span>
                </label>
                <input
                  autoFocus type="text" value={form.title} required
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Responds to name when called (3/3 trials)"
                  className="field-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Operational definition
                  <span className="ml-1 text-xs text-zinc-500">(observable, measurable)</span>
                </label>
                <textarea
                  rows={4} value={form.operationalDefinition}
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
                        key={p} type="button"
                        onClick={() => setForm((f) => ({ ...f, phase: p }))}
                        className={`rounded-lg py-2 text-xs font-medium border transition-all ${
                          form.phase === p ? PHASE_STYLE[p] : "border-[var(--glass-border)] text-zinc-500 hover:text-zinc-300"
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
            <MasteryCriteriaForm value={mastery} promptLevels={promptLevels} onChange={setMastery} />
          )}

          {tab === "prompts" && (
            <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--background)]/60 p-4">
              <PromptLevelsEditor value={promptLevels} onChange={setPromptLevels} />
            </div>
          )}

          <div className="flex gap-3 pt-2 pb-1 sticky bottom-0 bg-[var(--glass-bg)] -mx-5 px-5 py-3 border-t border-[var(--glass-border)] mt-4">
            <button
              type="submit" disabled={saving}
              className="btn-primary flex-1 rounded-xl py-3 font-bold text-base disabled:opacity-60"
            >
              {saving ? "Saving…" : editTarget ? "Update Target" : "Add Target ✓"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── TargetRow ──────────────────────────────────────────────────────────── */

function TargetRow({
  target,
  onOpen,
  onRefresh,
}: {
  target: LocalTarget;
  onOpen: (t: TargetPanelData) => void;
  onRefresh: () => void;
}) {
  const removeTarget  = useABAStore((s) => s.removeTarget);
  const setTargetPhase = useABAStore((s) => s.setTargetPhase);
  const updateTarget  = useABAStore((s) => s.updateTarget);
  const [showPhaseMenu, setShowPhaseMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Remove target "${target.title}"?`)) return;
    removeTarget(target.id);
    if (target.serverId) {
      fetch(`/smart-steps/api/targets/${target.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }).catch(() => {});
    }
    toast.success("Target removed");
  }

  function handlePhaseChange(e: React.MouseEvent, p: Phase) {
    e.stopPropagation();
    setTargetPhase(target.id, p);
    if (p === "MASTERED" && target.masteryCriteria?.masteryType === "AUTOMATIC") {
      updateTarget(target.id, {
        masteryCriteria: { ...(target.masteryCriteria ?? {}), masteredDate: new Date().toISOString().slice(0, 10) } as typeof target.masteryCriteria,
      });
    }
    setShowPhaseMenu(false);
    toast.success(`Phase → ${p.toLowerCase()}`);
  }

  const safePhase: Phase = (PHASES.includes(target.phase as Phase) ? target.phase : "BASELINE") as Phase;
  const safeMastery = target.masteryCriteria ?? { percentage: 80, masteryType: "MANUAL" };

  return (
    <>
      <motion.div
        whileHover={{ x: 2 }}
        onClick={() => onOpen({
          id: target.id,
          serverId: target.serverId,
          title: target.title ?? "",
          operationalDefinition: target.operationalDefinition,
          targetType: target.targetType ?? "DISCRETE_TRIAL",
          phase: safePhase,
          masteryCriteria: target.masteryCriteria ?? { percentage: 80, consecutiveDays: 3, consecutiveSessions: 3, minTrialsPerSession: 10, firstTrialMustBe: "ANY", promptLevelToMaster: 0, masteryType: "MANUAL", openedDate: null, baselineDate: null, masteredDate: null },
          promptLevels: target.promptLevels ?? [],
        })}
        className="group relative flex items-center gap-3 rounded-xl border border-transparent hover:border-[var(--glass-border)] bg-transparent hover:bg-[var(--glass-bg)]/40 px-3 py-2.5 cursor-pointer transition-all"
      >
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${PHASE_DOT[safePhase]}`} />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--foreground)] font-medium truncate">{target.title}</p>
          {target.operationalDefinition && (
            <p className="text-xs text-zinc-600 truncate mt-0.5">{target.operationalDefinition}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-zinc-600">
              {TARGET_TYPES.find((t) => t.value === target.targetType)?.label.split(" ")[0]}
            </span>
            <span className={`rounded-full border px-1.5 py-px text-xs ${PHASE_STYLE[safePhase]}`}>
              {safePhase.charAt(0) + safePhase.slice(1).toLowerCase()}
            </span>
            <span className="text-xs text-zinc-600">{safeMastery.percentage ?? 80}% goal</span>
            {!target.synced && (
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Pending sync" />
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Phase menu */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowPhaseMenu((v) => !v); }}
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
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-8 z-20 glass-card rounded-xl border border-[var(--glass-border)] p-1 min-w-[150px] shadow-xl"
                >
                  {PHASES.map((p) => (
                    <button
                      key={p} type="button"
                      onClick={(e) => handlePhaseChange(e, p)}
                      className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${
                        safePhase === p ? "text-[var(--accent-cyan)]" : "text-zinc-300"
                      }`}
                    >
                      <div className={`h-2 w-2 rounded-full ${PHASE_DOT[p]}`} />
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Edit */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowEditModal(true); }}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          {/* Delete */}
          <button
            type="button" onClick={handleRemove}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Graph hint */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <BarChart2 className="h-4 w-4 text-[var(--accent-cyan)]" />
        </div>
      </motion.div>

      <AnimatePresence>
        {showEditModal && (
          <TargetModal
            clientId={target.clientId}
            categoryId={target.categoryId}
            programId={target.programId}
            programName=""
            editTarget={target}
            onClose={() => setShowEditModal(false)}
            onSaved={onRefresh}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── ProgramRow ─────────────────────────────────────────────────────────── */

function ProgramRow({
  program,
  clientId,
  onOpenTarget,
  onRefresh,
  onRemove,
}: {
  program: LocalProgram;
  clientId: string;
  onOpenTarget: (t: TargetPanelData) => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded]           = useState(true);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const targets = useABAStore((s) =>
    (s.targets ?? []).filter((t) => t.programId === program.id && t.isActive)
  );
  const mastered = targets.filter((t) => t.phase === "MASTERED").length;
  const pct      = targets.length > 0 ? Math.round((mastered / targets.length) * 100) : 0;

  return (
    <div className="rounded-xl border border-[var(--glass-border)]/50 overflow-visible">
      {/* Header */}
      <button
        type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left bg-[var(--glass-bg)]/20 hover:bg-[var(--glass-bg)]/40 transition-colors rounded-xl"
      >
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        </motion.div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">{program.name}</p>
          {program.description && (
            <p className="text-xs text-zinc-500 truncate">{program.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
          {targets.length > 0 && (
            <>
              <span className="text-emerald-400">{mastered}/{targets.length} mastered</span>
              <div className="h-1.5 w-14 rounded-full bg-[var(--glass-border)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent-cyan)]" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
          <span>{targets.length} target{targets.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded-lg p-1 text-zinc-600 hover:text-[var(--accent-pink)] transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </button>

      {/* Targets list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-visible"
          >
            <div className="pb-2 pt-1 px-2">
              {targets.map((t) => (
                <TargetRow key={t.id} target={t} onOpen={onOpenTarget} onRefresh={onRefresh} />
              ))}

              {/* Create New Target */}
              <motion.button
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                type="button"
                onClick={() => setShowTargetModal(true)}
                className="mt-1 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--accent-purple)]/40 px-4 py-2.5 text-xs font-medium text-[var(--accent-purple)] hover:border-[var(--accent-purple)]/70 hover:bg-[var(--accent-purple)]/5 transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                + Create New Target
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
            editTarget={null}
            onClose={() => setShowTargetModal(false)}
            onSaved={onRefresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── CategorySection ────────────────────────────────────────────────────── */

function CategorySection({
  category,
  clientId,
  onOpenTarget,
  onRefresh,
  onEditCategory,
}: {
  category: LocalCategory;
  clientId: string;
  onOpenTarget: (t: TargetPanelData) => void;
  onRefresh: () => void;
  onEditCategory: (cat: LocalCategory) => void;
}) {
  const [expanded, setExpanded]             = useState(true);
  const [showProgramModal, setShowProgramModal] = useState(false);

  const programs = useABAStore((s) =>
    (s.programs ?? []).filter((p) => p.categoryId === category.id && p.clientId === clientId)
  );
  const removeProgram = useABAStore((s) => s.removeProgram);
  const allTargets = useABAStore((s) =>
    (s.targets ?? []).filter((t) => t.categoryId === category.id && t.isActive)
  );

  const mastered    = allTargets.filter((t) => t.phase === "MASTERED").length;
  const acquisition = allTargets.filter((t) => t.phase === "ACQUISITION").length;

  function handleRemoveProgram(id: string) {
    if (!confirm("Remove this program and all its targets?")) return;
    removeProgram(id);
    toast.success("Program removed");
  }

  return (
    <motion.div className="glass-card rounded-2xl border border-[var(--glass-border)] overflow-visible">
      {/* Category header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight className="h-5 w-5 text-zinc-400" />
        </motion.div>

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white text-sm font-bold"
          style={{ background: category.color ?? "#06b6d4" }}
        >
          {(category.name ?? "?").charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[var(--foreground)] text-base leading-tight">{category.name}</h3>
          {category.description && <p className="text-xs text-zinc-500 truncate">{category.description}</p>}
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
          <span>{programs.length} program{programs.length !== 1 ? "s" : ""}</span>
          {allTargets.length > 0 && (
            <>
              <span className="text-cyan-400">{acquisition} active</span>
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

      {/* Programs */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-visible"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-[var(--glass-border)]/40 pt-3">
              {programs.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-2">
                  No programs yet — add a program, then create targets inside it.
                </p>
              )}

              {programs.map((prog) => (
                <ProgramRow
                  key={prog.id}
                  program={prog}
                  clientId={clientId}
                  onOpenTarget={onOpenTarget}
                  onRefresh={onRefresh}
                  onRemove={() => handleRemoveProgram(prog.id)}
                />
              ))}

              {/* Create New Program */}
              <button
                type="button"
                onClick={() => setShowProgramModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-2.5 text-sm text-zinc-500 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
              >
                <Plus className="h-4 w-4" /> + Create New Program
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

/* ─── Main Tab Component ─────────────────────────────────────────────────── */

export function ProgramsTab({
  clientId,
  onOpenTarget,
}: {
  clientId: string;
  onOpenTarget: (t: TargetPanelData) => void;
}) {
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editCategory, setEditCategory]           = useState<LocalCategory | null>(null);
  const [tick, setTick]                           = useState(0);
  // Guard against Zustand localStorage hydration mismatch in Next.js
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const categories = useABAStore((s) => (s.categories ?? []).filter((c) => c.clientId === clientId));
  const allTargets = useABAStore((s) => (s.targets ?? []).filter((t) => t.clientId === clientId && t.isActive));
  const mastered   = allTargets.filter((t) => t.phase === "MASTERED").length;
  const active     = allTargets.filter((t) => t.phase === "ACQUISITION").length;
  const baseline   = allTargets.filter((t) => t.phase === "BASELINE").length;

  function refresh() { setTick((t) => t + 1); }

  if (!hydrated) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card skeleton h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          {allTargets.length > 0 && (
            <>
              <span className="text-zinc-400">{baseline} baseline</span>
              <span className="text-cyan-400">{active} in progress</span>
              <span className="text-emerald-400">{mastered} mastered</span>
            </>
          )}
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          type="button"
          onClick={() => { setEditCategory(null); setShowCategoryModal(true); }}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
        >
          <Layers className="h-3.5 w-3.5" />
          + Add Skill Area
        </motion.button>
      </div>

      {/* Quick stats */}
      {allTargets.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Targets",  value: allTargets.length, icon: Target,       color: "var(--foreground)" },
            { label: "In Acquisition", value: active,            icon: Zap,           color: "var(--accent-cyan)" },
            { label: "Mastered",       value: mastered,          icon: CheckCircle2,  color: "#34d399" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="glass-card rounded-xl p-3 flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" style={{ color: s.color }} />
                <div>
                  <p className="text-base font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-zinc-600">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hierarchy */}
      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
          <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-semibold mb-1">No skill areas yet</p>
          <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
            Start by adding a <strong className="text-zinc-400">Skill Area</strong> (e.g. &quot;Language &amp; Communication&quot;),
            then create <strong className="text-zinc-400">Programs</strong> with individual <strong className="text-zinc-400">Targets</strong>.
          </p>
          <button
            type="button"
            onClick={() => setShowCategoryModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)]"
          >
            <Plus className="h-4 w-4" /> Add First Skill Area
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <CategorySection
              key={`${cat.id}-${tick}`}
              category={cat}
              clientId={clientId}
              onOpenTarget={onOpenTarget}
              onRefresh={refresh}
              onEditCategory={(c) => { setEditCategory(c); setShowCategoryModal(true); }}
            />
          ))}

          <button
            type="button"
            onClick={() => { setEditCategory(null); setShowCategoryModal(true); }}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-3 text-sm text-zinc-500 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
          >
            <Layers className="h-4 w-4" /> + Add Another Skill Area
          </button>
        </div>
      )}

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
