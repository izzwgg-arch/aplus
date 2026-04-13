"use client";

/**
 * ProgramsTab — drill-down hierarchy
 *   Level 1: Categories  (skill areas)
 *   Level 2: Skills      (programs under a category)
 *   Level 3: Goals       (targets under a skill)
 *
 * Uses the existing Zustand ABA store — no data model changes needed.
 * LocalCategory  = Category
 * LocalProgram   = Skill
 * LocalTarget    = Goal / Target
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, ChevronRight, Layers, Target as TargetIcon,
  BookOpen, CheckCircle2, Pencil, Trash2, X, Zap, Circle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useABAStore,
  defaultMastery,
  defaultPromptLevels,
  type LocalCategory,
  type LocalProgram,
  type LocalTarget,
  type Phase,
} from "@/store/abaStore";
import type { TargetPanelData } from "./TargetDetailPanel";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const PHASES: Phase[] = [
  "BASELINE", "ACQUISITION", "MAINTENANCE", "GENERALIZATION", "MASTERED",
];

const PHASE_STYLE: Record<Phase, string> = {
  BASELINE:       "bg-zinc-500/15 text-zinc-300",
  ACQUISITION:    "bg-cyan-400/15 text-cyan-300",
  MAINTENANCE:    "bg-amber-400/15 text-amber-300",
  GENERALIZATION: "bg-purple-400/15 text-purple-300",
  MASTERED:       "bg-emerald-400/15 text-emerald-300",
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

const TARGET_TYPE_OPTIONS = [
  { value: "DISCRETE_TRIAL",        label: "Discrete Trial Training (DTT)" },
  { value: "TASK_ANALYSIS_FWD",     label: "Task Analysis — Forward Chaining" },
  { value: "TASK_ANALYSIS_BWD",     label: "Task Analysis — Backward Chaining" },
  { value: "TASK_ANALYSIS_TOTAL",   label: "Task Analysis — Total Task" },
  { value: "DURATION",              label: "Duration Recording" },
  { value: "FREQUENCY",             label: "Frequency / Event Recording" },
  { value: "COLD_PROBE",            label: "Cold Probe" },
  { value: "OTHER",                 label: "Other" },
];

function makeId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ─── Navigation state ───────────────────────────────────────────────────── */

type DrillView = "categories" | "skills" | "goals";

/* ─── Loading skeleton ───────────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card skeleton h-20 rounded-2xl" />
      ))}
    </div>
  );
}

/* ─── Breadcrumb ─────────────────────────────────────────────────────────── */

function Breadcrumb({
  category,
  skill,
  onGoCategory,
  onGoRoot,
}: {
  category: LocalCategory | null;
  skill: LocalProgram | null;
  onGoCategory: () => void;
  onGoRoot: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-4 flex-wrap">
      <button
        type="button"
        onClick={onGoRoot}
        className="hover:text-[var(--accent-cyan)] transition-colors"
      >
        Goals &amp; Targets
      </button>
      {category && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <button
            type="button"
            onClick={onGoCategory}
            className={`transition-colors ${skill ? "hover:text-[var(--accent-cyan)]" : "text-zinc-300 cursor-default"}`}
          >
            {category.name}
          </button>
        </>
      )}
      {skill && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-zinc-300">{skill.name}</span>
        </>
      )}
    </div>
  );
}

/* ─── Category Card ──────────────────────────────────────────────────────── */

function CategoryCard({
  category,
  skillCount,
  onClick,
  onEdit,
  onDelete,
}: {
  category: LocalCategory;
  skillCount: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="glass-card rounded-2xl border border-[var(--glass-border)] hover:border-[var(--accent-cyan)]/30 transition-all cursor-pointer group"
    >
      <div className="flex items-center gap-4 p-4" onClick={onClick}>
        {/* Color dot */}
        <div
          className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-sm"
          style={{ background: category.color ?? "#06b6d4" }}
        >
          {(category.name ?? "?").charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--foreground)] text-sm truncate">
            {category.name ?? "Unnamed"}
          </p>
          {category.description && (
            <p className="text-xs text-zinc-500 truncate">{category.description}</p>
          )}
          <p className="text-xs text-zinc-500 mt-0.5">
            {skillCount} skill{skillCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <ChevronRight className="h-4 w-4 text-zinc-600 ml-1" />
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Skill Card ─────────────────────────────────────────────────────────── */

function SkillCard({
  skill,
  goalCount,
  masteredCount,
  onClick,
  onDelete,
}: {
  skill: LocalProgram;
  goalCount: number;
  masteredCount: number;
  onClick: () => void;
  onDelete: () => void;
}) {
  const pct = goalCount > 0 ? Math.round((masteredCount / goalCount) * 100) : 0;

  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="glass-card rounded-2xl border border-[var(--glass-border)] hover:border-[var(--accent-purple)]/30 transition-all cursor-pointer group"
    >
      <div className="flex items-center gap-4 p-4" onClick={onClick}>
        <div className="h-10 w-10 shrink-0 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center">
          <Layers className="h-5 w-5 text-[var(--accent-purple)]" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--foreground)] text-sm truncate">
            {skill.name ?? "Unnamed skill"}
          </p>
          {skill.description && (
            <p className="text-xs text-zinc-500 truncate">{skill.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-zinc-500">
              {goalCount} goal{goalCount !== 1 ? "s" : ""}
            </span>
            {masteredCount > 0 && (
              <span className="text-xs text-emerald-400">
                {masteredCount} mastered
              </span>
            )}
          </div>
          {goalCount > 0 && (
            <div className="mt-1.5 h-1 w-full rounded-full bg-[var(--glass-border)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <ChevronRight className="h-4 w-4 text-zinc-600 ml-1" />
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Goal Card ──────────────────────────────────────────────────────────── */

function GoalCard({
  goal,
  onClick,
  onDelete,
  onPhaseChange,
}: {
  goal: LocalTarget;
  onClick: () => void;
  onDelete: () => void;
  onPhaseChange: (phase: Phase) => void;
}) {
  const [phaseOpen, setPhaseOpen] = useState(false);
  const phase = (goal.phase ?? "BASELINE") as Phase;

  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="glass-card rounded-2xl border border-[var(--glass-border)] hover:border-[var(--accent-cyan)]/20 transition-all group"
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="h-9 w-9 shrink-0 rounded-xl bg-[var(--accent-cyan)]/10 flex items-center justify-center cursor-pointer"
          onClick={onClick}
        >
          <TargetIcon className="h-4.5 w-4.5 text-[var(--accent-cyan)]" />
        </div>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
          <p className="font-medium text-[var(--foreground)] text-sm leading-snug">
            {goal.title ?? "Unnamed goal"}
          </p>
          {goal.operationalDefinition && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">
              {goal.operationalDefinition}
            </p>
          )}
          <p className="text-xs text-zinc-600 mt-1">{goal.targetType ?? "DISCRETE_TRIAL"}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Phase badge + picker */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPhaseOpen((v) => !v); }}
              className={`rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${PHASE_STYLE[phase]} border-current/20`}
            >
              {phase.charAt(0) + phase.slice(1).toLowerCase()}
            </button>
            <AnimatePresence>
              {phaseOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-8 z-30 glass-card rounded-xl border border-[var(--glass-border)] p-1 min-w-[160px] shadow-xl"
                >
                  {PHASES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPhaseChange(p);
                        setPhaseOpen(false);
                      }}
                      className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-left hover:bg-white/10 transition-colors ${p === phase ? "text-[var(--accent-cyan)]" : "text-zinc-300"}`}
                    >
                      <div className={`h-2 w-2 rounded-full ${
                        p === "BASELINE" ? "bg-zinc-400" :
                        p === "ACQUISITION" ? "bg-cyan-400" :
                        p === "MAINTENANCE" ? "bg-amber-400" :
                        p === "GENERALIZATION" ? "bg-purple-400" : "bg-emerald-400"
                      }`} />
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Add Category Modal ─────────────────────────────────────────────────── */

function AddCategoryModal({
  clientId,
  editCat,
  onClose,
  onSaved,
}: {
  clientId: string;
  editCat: LocalCategory | null;
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
    if (!name.trim() || saving) return;
    setSaving(true);
    const now = new Date().toISOString();

    if (editCat) {
      updateCategory(editCat.id, { name: name.trim(), color, description: description.trim() });
      if (editCat.serverId) {
        await fetch(`/smart-steps/api/programs/${editCat.serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        }).catch(() => {});
      }
      toast.success("Skill area updated");
    } else {
      const id = makeId();
      addCategory({ id, clientId, name: name.trim(), color, description: description.trim(), createdAt: now, synced: false });
      fetch("/smart-steps/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name: name.trim(), domain: name.trim(), description: description.trim() }),
      })
        .then((r) => r.json())
        .then((d) => { if (d?.id) useABAStore.getState().setCategoryServerId(id, d.id); })
        .catch(() => {});
      toast.success("Skill area created");
    }

    setSaving(false);
    onSaved();
    onClose();
  }

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
        className="glass-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent-cyan)]" />
            {editCat ? "Edit Skill Area" : "New Skill Area"}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={save} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Language & Communication"
              className="field-input w-full"
            />
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setName(p)}
                className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
              >
                {p}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-xl transition-all ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--background)] scale-110" : "hover:scale-105"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description (optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description…"
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

/* ─── Add Skill Modal ────────────────────────────────────────────────────── */

function AddSkillModal({
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
    if (!name.trim() || saving) return;
    setSaving(true);
    const id  = makeId();
    const now = new Date().toISOString();

    addProgram({ id, categoryId, clientId, name: name.trim(), description: description.trim(), createdAt: now, synced: false });

    fetch(`/smart-steps/api/clients/${clientId}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: name.trim(), description: description.trim(), domain: categoryName }),
    })
      .then((r) => r.json())
      .then((d) => { if (d?.id) useABAStore.getState().setProgramServerId(id, d.id); })
      .catch(() => {});

    toast.success("Skill created");
    setSaving(false);
    onSaved();
    onClose();
  }

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
        className="glass-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div>
            <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--accent-purple)]" />
              New Skill
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">under: <span className="text-zinc-300">{categoryName}</span></p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Skill Name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Expressive Language, Behavior"
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description (optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description…"
              className="field-input w-full resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving…" : "Create Skill"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Add Goal Modal ─────────────────────────────────────────────────────── */

function AddGoalModal({
  clientId,
  categoryId,
  skillId,
  skillName,
  onClose,
  onSaved,
}: {
  clientId: string;
  categoryId: string;
  skillId: string;
  skillName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addTarget = useABAStore((s) => s.addTarget);

  const [title, setTitle]     = useState("");
  const [opDef, setOpDef]     = useState("");
  const [type, setType]       = useState("DISCRETE_TRIAL");
  const [phase, setPhase]     = useState<Phase>("BASELINE");
  const [saving, setSaving]   = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);

    const id  = makeId();
    const now = new Date().toISOString();

    addTarget({
      id,
      programId: skillId,
      categoryId,
      clientId,
      title: title.trim(),
      operationalDefinition: opDef.trim(),
      targetType: type as LocalTarget["targetType"],
      phase,
      masteryCriteria: defaultMastery(),
      promptLevels: defaultPromptLevels(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
      synced: false,
    });

    // Sync to server
    fetch("/smart-steps/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        parentGoalId: useABAStore.getState().programs.find((p) => p.id === skillId)?.serverId ?? null,
        title: title.trim(),
        operationalDefinition: opDef.trim(),
        targetType: type,
        phase,
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d?.id) useABAStore.getState().setTargetServerId(id, d.id); })
      .catch(() => {});

    toast.success("Goal created");
    setSaving(false);
    onSaved();
    onClose();
  }

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
        className="glass-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div>
            <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
              <TargetIcon className="h-4 w-4 text-[var(--accent-purple)]" />
              New Goal / Target
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">under: <span className="text-zinc-300">{skillName}</span></p>
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Goal / Target Title <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={title}
              required
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Responds to name when called (3/3 trials)"
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Operational Definition</label>
            <textarea
              rows={2}
              value={opDef}
              onChange={(e) => setOpDef(e.target.value)}
              placeholder="How this goal is measured…"
              className="field-input w-full resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="field-input w-full"
              >
                {TARGET_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Initial Phase</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value as Phase)}
                className="field-input w-full"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving…" : "Create Goal"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main ProgramsTab ───────────────────────────────────────────────────── */

export function ProgramsTab({
  clientId,
  onOpenTarget,
}: {
  clientId: string;
  onOpenTarget: (t: TargetPanelData) => void;
}) {
  // Hydration guard — prevents Zustand/localStorage mismatch on SSR
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Drill-down navigation state
  const [view, setView]                         = useState<DrillView>("categories");
  const [selectedCategory, setSelectedCategory] = useState<LocalCategory | null>(null);
  const [selectedSkill, setSelectedSkill]       = useState<LocalProgram | null>(null);
  const [tick, setTick]                         = useState(0);

  // Modal state
  const [showAddCategory, setShowAddCategory]       = useState(false);
  const [editingCategory, setEditingCategory]       = useState<LocalCategory | null>(null);
  const [showAddSkill, setShowAddSkill]             = useState(false);
  const [showAddGoal, setShowAddGoal]               = useState(false);

  // Zustand store — all reads guarded with ?? []
  const categories  = useABAStore((s) => (s.categories ?? []).filter((c) => c.clientId === clientId));
  const allPrograms = useABAStore((s) => s.programs ?? []);
  const allTargets  = useABAStore((s) => s.targets ?? []);

  const removeCategory = useABAStore((s) => s.removeCategory);
  const removeProgram  = useABAStore((s) => s.removeProgram);
  const removeTarget   = useABAStore((s) => s.removeTarget);
  const setTargetPhase = useABAStore((s) => s.setTargetPhase);

  // Derived lists
  const skills = selectedCategory
    ? allPrograms.filter((p) => p.categoryId === selectedCategory.id && p.clientId === clientId)
    : [];

  const goals = selectedSkill
    ? allTargets.filter((t) => t.programId === selectedSkill.id && (t.isActive ?? true))
    : [];

  function refresh() { setTick((t) => t + 1); }

  // Navigation helpers
  function openCategory(cat: LocalCategory) {
    setSelectedCategory(cat);
    setView("skills");
  }

  function openSkill(skill: LocalProgram) {
    setSelectedSkill(skill);
    setView("goals");
  }

  function goBack() {
    if (view === "goals") {
      setView("skills");
      setSelectedSkill(null);
    } else if (view === "skills") {
      setView("categories");
      setSelectedCategory(null);
    }
  }

  function handleDeleteCategory(cat: LocalCategory) {
    if (!confirm(`Remove "${cat.name ?? "this skill area"}" and all its skills?`)) return;
    removeCategory(cat.id);
    toast.success("Skill area removed");
    refresh();
  }

  function handleDeleteSkill(skill: LocalProgram) {
    if (!confirm(`Remove skill "${skill.name ?? "this skill"}"?`)) return;
    removeProgram(skill.id);
    toast.success("Skill removed");
    refresh();
  }

  function handleDeleteGoal(goal: LocalTarget) {
    if (!confirm(`Remove goal "${goal.title ?? "this goal"}"?`)) return;
    removeTarget(goal.id);
    toast.success("Goal removed");
    refresh();
  }

  function handleOpenGoal(goal: LocalTarget) {
    onOpenTarget({
      id: goal.id,
      title: goal.title,
      operationalDefinition: goal.operationalDefinition,
      targetType: goal.targetType,
      phase: goal.phase,
      masteryCriteria: goal.masteryCriteria,
      promptLevels: goal.promptLevels,
      categoryId: goal.categoryId,
      programId: goal.programId,
      clientId: goal.clientId,
      serverId: goal.serverId,
    } as TargetPanelData);
  }

  // Don't render store-driven content until client-side hydration completes
  if (!hydrated) return <Skeleton />;

  // Overall stats
  const activeGoals   = allTargets.filter((t) => t.clientId === clientId && (t.isActive ?? true) && t.phase !== "MASTERED").length;
  const masteredGoals = allTargets.filter((t) => t.clientId === clientId && t.phase === "MASTERED").length;

  return (
    <div className="space-y-4" key={tick}>

      {/* ── Breadcrumbs ── */}
      <Breadcrumb
        category={view !== "categories" ? selectedCategory : null}
        skill={view === "goals" ? selectedSkill : null}
        onGoRoot={() => { setView("categories"); setSelectedCategory(null); setSelectedSkill(null); }}
        onGoCategory={() => { setView("skills"); setSelectedSkill(null); }}
      />

      {/* ── Header row ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view !== "categories" && (
            <button
              type="button"
              onClick={goBack}
              className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h3 className="font-bold text-[var(--foreground)] text-base">
              {view === "categories"
                ? "Goals & Targets"
                : view === "skills"
                ? selectedCategory?.name ?? "Skills"
                : selectedSkill?.name ?? "Goals"}
            </h3>
            {view === "categories" && (allTargets.filter((t) => t.clientId === clientId).length > 0) && (
              <p className="text-xs text-zinc-500">
                {activeGoals} active · {masteredGoals} mastered
              </p>
            )}
          </div>
        </div>

        {/* Action button */}
        {view === "categories" && (
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => { setEditingCategory(null); setShowAddCategory(true); }}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            + Skill Area
          </motion.button>
        )}
        {view === "skills" && (
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => setShowAddSkill(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            + Skill
          </motion.button>
        )}
        {view === "goals" && (
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => setShowAddGoal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            + Goal
          </motion.button>
        )}
      </div>

      {/* ── Level 1: Categories ── */}
      <AnimatePresence mode="wait">
        {view === "categories" && (
          <motion.div
            key="categories"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {categories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-semibold mb-1">No skill areas yet</p>
                <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
                  Start by creating a <strong className="text-zinc-400">Skill Area</strong> like &ldquo;Language &amp; Communication&rdquo;, then add skills and goals inside.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddCategory(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)]"
                >
                  <Plus className="h-4 w-4" /> Add First Skill Area
                </button>
              </div>
            ) : (
              <>
                {categories.map((cat) => {
                  const skillCount = allPrograms.filter(
                    (p) => p.categoryId === cat.id && p.clientId === clientId
                  ).length;
                  return (
                    <CategoryCard
                      key={cat.id}
                      category={cat}
                      skillCount={skillCount}
                      onClick={() => openCategory(cat)}
                      onEdit={() => { setEditingCategory(cat); setShowAddCategory(true); }}
                      onDelete={() => handleDeleteCategory(cat)}
                    />
                  );
                })}

                <button
                  type="button"
                  onClick={() => setShowAddCategory(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-3 text-sm text-zinc-500 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
                >
                  <Plus className="h-4 w-4" /> + Add Another Skill Area
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ── Level 2: Skills ── */}
        {view === "skills" && (
          <motion.div
            key="skills"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {skills.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <BookOpen className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-semibold mb-1">No skills yet</p>
                <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
                  Add a <strong className="text-zinc-400">Skill</strong> like &ldquo;Expressive Language&rdquo; or &ldquo;Behavior&rdquo; to organize goals inside.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddSkill(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-purple)]"
                >
                  <Plus className="h-4 w-4" /> Add First Skill
                </button>
              </div>
            ) : (
              <>
                {skills.map((skill) => {
                  const skillGoals    = allTargets.filter((t) => t.programId === skill.id && (t.isActive ?? true));
                  const skillMastered = skillGoals.filter((t) => t.phase === "MASTERED").length;
                  return (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      goalCount={skillGoals.length}
                      masteredCount={skillMastered}
                      onClick={() => openSkill(skill)}
                      onDelete={() => handleDeleteSkill(skill)}
                    />
                  );
                })}

                <button
                  type="button"
                  onClick={() => setShowAddSkill(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-3 text-sm text-zinc-500 hover:border-[var(--accent-purple)]/50 hover:text-[var(--accent-purple)] transition-colors"
                >
                  <Plus className="h-4 w-4" /> + Add Another Skill
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ── Level 3: Goals ── */}
        {view === "goals" && (
          <motion.div
            key="goals"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {/* Stats */}
            {goals.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total",     value: goals.length,                                            color: "var(--foreground)" },
                  { label: "Active",    value: goals.filter((t) => t.phase === "ACQUISITION").length,   color: "var(--accent-cyan)" },
                  { label: "Mastered",  value: goals.filter((t) => t.phase === "MASTERED").length,      color: "#34d399" },
                ].map((s) => (
                  <div key={s.label} className="glass-card rounded-xl p-3 text-center">
                    <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-zinc-600">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {goals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <TargetIcon className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-semibold mb-1">No goals yet</p>
                <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
                  Add goals and targets that will be tracked during ABA sessions.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddGoal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-pink)]"
                >
                  <Plus className="h-4 w-4" /> Add First Goal
                </button>
              </div>
            ) : (
              <>
                {goals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onClick={() => handleOpenGoal(goal)}
                    onDelete={() => handleDeleteGoal(goal)}
                    onPhaseChange={(p) => {
                      setTargetPhase(goal.id, p);
                      refresh();
                    }}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => setShowAddGoal(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-3 text-sm text-zinc-500 hover:border-[var(--accent-pink)]/50 hover:text-[var(--accent-pink)] transition-colors"
                >
                  <Plus className="h-4 w-4" /> + Add Another Goal
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showAddCategory && (
          <AddCategoryModal
            clientId={clientId}
            editCat={editingCategory}
            onClose={() => { setShowAddCategory(false); setEditingCategory(null); }}
            onSaved={refresh}
          />
        )}
        {showAddSkill && selectedCategory && (
          <AddSkillModal
            clientId={clientId}
            categoryId={selectedCategory.id}
            categoryName={selectedCategory.name ?? ""}
            onClose={() => setShowAddSkill(false)}
            onSaved={refresh}
          />
        )}
        {showAddGoal && selectedSkill && selectedCategory && (
          <AddGoalModal
            clientId={clientId}
            categoryId={selectedCategory.id}
            skillId={selectedSkill.id}
            skillName={selectedSkill.name ?? ""}
            onClose={() => setShowAddGoal(false)}
            onSaved={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
