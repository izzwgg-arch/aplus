"use client";

/**
 * ProgramsTab — 2-level navigation
 *
 *  Level 1 (default): Accordion list of Categories, each expanded to show
 *                     its Skills as sub-rows.  Skills are sub-categories.
 *  Level 2:           Goals & Targets inside a selected Skill.
 *
 * Data lives entirely in the Zustand ABA store (localStorage-persisted).
 * No data is ever deleted — only the UI is reorganised.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight,
  Layers, Target as TargetIcon, Pencil, Trash2, X,
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

const PHASES: Phase[] = ["BASELINE","ACQUISITION","MAINTENANCE","GENERALIZATION","MASTERED"];

const PHASE_STYLE: Record<Phase, string> = {
  BASELINE:       "bg-zinc-500/15 text-zinc-300",
  ACQUISITION:    "bg-cyan-400/15 text-cyan-300",
  MAINTENANCE:    "bg-amber-400/15 text-amber-300",
  GENERALIZATION: "bg-purple-400/15 text-purple-300",
  MASTERED:       "bg-emerald-400/15 text-emerald-300",
};

const CATEGORY_COLORS = [
  "#06b6d4","#a855f7","#ec4899","#f59e0b","#10b981",
  "#3b82f6","#f97316","#8b5cf6","#14b8a6","#ef4444",
];

const CATEGORY_PRESETS = [
  "Language & Communication","Social Skills","Manding (Requesting)",
  "Tacting (Labeling)","Intraverbal","Self-Care / Daily Living",
  "Fine Motor Skills","Gross Motor Skills","Academic / Pre-Academic",
  "Behavior Reduction","Play & Leisure","Cognitive Skills",
];

const TARGET_TYPE_OPTIONS = [
  { value: "DISCRETE_TRIAL",        label: "Discrete Trial Training (DTT)" },
  { value: "TASK_ANALYSIS_FWD",     label: "Task Analysis — Forward Chaining" },
  { value: "TASK_ANALYSIS_BWD",     label: "Task Analysis — Backward Chaining" },
  { value: "TASK_ANALYSIS_TOTAL",   label: "Task Analysis — Total Task" },
  { value: "DURATION",              label: "Duration Recording" },
  { value: "LATENCY",               label: "Latency Recording" },
  { value: "FREQUENCY",             label: "Frequency / Event Recording" },
  { value: "COLD_PROBE",            label: "Cold Probe" },
  { value: "OTHER",                 label: "Other" },
];

function makeId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1,2,3].map(i => (
        <div key={i} className="glass-card skeleton h-20 rounded-2xl" />
      ))}
    </div>
  );
}

/* ─── Category modal (add / edit) ───────────────────────────────────────── */

function CategoryModal({
  clientId, editCat, onClose, onSaved,
}: {
  clientId: string;
  editCat: LocalCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addCategory    = useABAStore(s => s.addCategory);
  const updateCategory = useABAStore(s => s.updateCategory);

  const [name,        setName]        = useState(editCat?.name ?? "");
  const [color,       setColor]       = useState(editCat?.color ?? CATEGORY_COLORS[0]);
  const [description, setDescription] = useState(editCat?.description ?? "");
  const [saving,      setSaving]      = useState(false);

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
      toast.success("Category updated");
    } else {
      const id = makeId();
      addCategory({ id, clientId, name: name.trim(), color, description: description.trim(), createdAt: now, synced: false });
      fetch("/smart-steps/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name: name.trim(), domain: name.trim(), description: description.trim() }),
      })
        .then(r => r.json())
        .then(d => { if (d?.id) useABAStore.getState().setCategoryServerId(id, d.id); })
        .catch(() => {});
      toast.success("Category created");
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent-cyan)]" />
            {editCat ? "Edit Category" : "New Category"}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus type="text" value={name} required
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Language & Communication"
              className="field-input w-full"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_PRESETS.map(p => (
              <button key={p} type="button" onClick={() => setName(p)}
                className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors">
                {p}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-xl transition-all ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--background)] scale-110" : "hover:scale-105"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description (optional)</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Brief description…" className="field-input w-full resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving…" : editCat ? "Save Changes" : "Create Category"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Skill modal (add) ──────────────────────────────────────────────────── */

function SkillModal({
  clientId, categoryId, categoryName, editSkill, onClose, onSaved,
}: {
  clientId: string;
  categoryId: string;
  categoryName: string;
  editSkill: LocalProgram | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addProgram    = useABAStore(s => s.addProgram);
  const updateProgram = useABAStore(s => s.updateProgram);

  const [name,        setName]        = useState(editSkill?.name ?? "");
  const [description, setDescription] = useState(editSkill?.description ?? "");
  const [saving,      setSaving]      = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const now = new Date().toISOString();

    if (editSkill) {
      updateProgram(editSkill.id, { name: name.trim(), description: description.trim() });
      toast.success("Skill updated");
    } else {
      const id = makeId();
      addProgram({ id, categoryId, clientId, name: name.trim(), description: description.trim(), createdAt: now, synced: false });
      fetch(`/smart-steps/api/clients/${clientId}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name.trim(), description: description.trim(), domain: categoryName }),
      })
        .then(r => r.json())
        .then(d => { if (d?.id) useABAStore.getState().setProgramServerId(id, d.id); })
        .catch(() => {});
      toast.success("Skill created");
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div>
            <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--accent-purple)]" />
              {editSkill ? "Edit Skill" : "New Skill"}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              under: <span className="text-zinc-300">{categoryName}</span>
            </p>
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
              autoFocus type="text" value={name} required
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Expressive Language, Behavior"
              className="field-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description (optional)</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Brief description…" className="field-input w-full resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving…" : editSkill ? "Save Changes" : "Create Skill"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Goal modal (add / link) ────────────────────────────────────────────── */

function GoalModal({
  clientId, categoryId, skillId, skillName, onClose, onSaved,
}: {
  clientId: string;
  categoryId: string;
  skillId: string;
  skillName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addTarget = useABAStore(s => s.addTarget);

  const [title,   setTitle]   = useState("");
  const [opDef,   setOpDef]   = useState("");
  const [type,    setType]    = useState("DISCRETE_TRIAL");
  const [phase,   setPhase]   = useState<Phase>("BASELINE");
  const [saving,  setSaving]  = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const id  = makeId();
    const now = new Date().toISOString();

    addTarget({
      id, programId: skillId, categoryId, clientId,
      title: title.trim(),
      operationalDefinition: opDef.trim(),
      targetType: type as LocalTarget["targetType"],
      phase,
      masteryCriteria: defaultMastery(),
      promptLevels: defaultPromptLevels(),
      isActive: true,
      createdAt: now, updatedAt: now, synced: false,
    });

    // Sync to server
    const parentServerId = useABAStore.getState().programs.find(p => p.id === skillId)?.serverId ?? null;
    fetch("/smart-steps/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        parentGoalId: parentServerId,
        title: title.trim(),
        operationalDefinition: opDef.trim(),
        targetType: type,
        phase,
      }),
    })
      .then(r => r.json())
      .then(d => { if (d?.id) useABAStore.getState().setTargetServerId(id, d.id); })
      .catch(() => {});

    toast.success("Goal created");
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <div>
            <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
              <TargetIcon className="h-4 w-4 text-[var(--accent-purple)]" />
              New Goal / Target
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              under skill: <span className="text-zinc-300">{skillName}</span>
            </p>
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
              autoFocus type="text" value={title} required
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Responds to name when called (3/3 trials)"
              className="field-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Operational Definition</label>
            <textarea rows={2} value={opDef} onChange={e => setOpDef(e.target.value)}
              placeholder="How this goal is measured…" className="field-input w-full resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className="field-input w-full">
                {TARGET_TYPE_OPTIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Initial Phase</label>
              <select value={phase} onChange={e => setPhase(e.target.value as Phase)} className="field-input w-full">
                {PHASES.map(p => (
                  <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving…" : "Create Goal"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Goal card (inside skill view) ─────────────────────────────────────── */

function GoalCard({
  goal,
  onOpen,
  onDelete,
  onPhaseChange,
}: {
  goal: LocalTarget;
  onOpen: () => void;
  onDelete: () => void;
  onPhaseChange: (p: Phase) => void;
}) {
  const [phaseOpen, setPhaseOpen] = useState(false);
  const phase = (goal.phase ?? "BASELINE") as Phase;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] rounded-xl transition-colors group">
      <div
        className="h-8 w-8 shrink-0 rounded-xl bg-[var(--accent-cyan)]/10 flex items-center justify-center cursor-pointer"
        onClick={onOpen}
      >
        <TargetIcon className="h-4 w-4 text-[var(--accent-cyan)]" />
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
        <p className="text-sm font-medium text-[var(--foreground)] leading-snug truncate">
          {goal.title ?? "Untitled goal"}
        </p>
        {goal.operationalDefinition && (
          <p className="text-xs text-zinc-500 truncate">{goal.operationalDefinition}</p>
        )}
      </div>

      {/* Phase badge */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setPhaseOpen(v => !v); }}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_STYLE[phase]}`}
        >
          {phase.charAt(0) + phase.slice(1).toLowerCase()}
        </button>
        <AnimatePresence>
          {phaseOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-0 top-8 z-30 glass-card rounded-xl border border-[var(--glass-border)] p-1 min-w-[150px] shadow-xl"
            >
              {PHASES.map(p => (
                <button
                  key={p} type="button"
                  onClick={e => { e.stopPropagation(); onPhaseChange(p); setPhaseOpen(false); }}
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

      {/* Actions */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─── Category accordion card (Level 1) ─────────────────────────────────── */

function CategorySection({
  category,
  skills,
  allTargets,
  expanded,
  onToggle,
  onEditCat,
  onDeleteCat,
  onAddSkill,
  onEditSkill,
  onDeleteSkill,
  onOpenSkillGoals,
}: {
  category: LocalCategory;
  skills: LocalProgram[];
  allTargets: LocalTarget[];
  expanded: boolean;
  onToggle: () => void;
  onEditCat: () => void;
  onDeleteCat: () => void;
  onAddSkill: () => void;
  onEditSkill: (s: LocalProgram) => void;
  onDeleteSkill: (s: LocalProgram) => void;
  onOpenSkillGoals: (s: LocalProgram) => void;
}) {
  const totalGoals    = allTargets.filter(t => skills.some(s => s.id === t.programId) && (t.isActive ?? true)).length;
  const masteredGoals = allTargets.filter(t => skills.some(s => s.id === t.programId) && t.phase === "MASTERED").length;

  return (
    <div className="glass-card rounded-2xl border border-[var(--glass-border)] overflow-hidden">
      {/* Category header */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors group"
        onClick={onToggle}
      >
        {/* Color dot */}
        <div
          className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-sm"
          style={{ background: category.color ?? "#06b6d4" }}
        >
          {(category.name ?? "?").charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--foreground)] text-sm">{category.name}</p>
          <p className="text-xs text-zinc-500">
            {skills.length} skill{skills.length !== 1 ? "s" : ""}
            {totalGoals > 0 && ` · ${totalGoals} goal${totalGoals !== 1 ? "s" : ""}`}
            {masteredGoals > 0 && ` · ${masteredGoals} mastered`}
          </p>
        </div>

        {/* Edit / delete (only show on hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={onEditCat}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-all">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDeleteCat}
            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 transition-all">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        </motion.div>
      </div>

      {/* Expanded: skills list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="skills"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--glass-border)]">
              {skills.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-xs text-zinc-500 mb-3">No skills yet in this category</p>
                  <button type="button" onClick={e => { e.stopPropagation(); onAddSkill(); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-purple)]">
                    <Plus className="h-3.5 w-3.5" /> Add First Skill
                  </button>
                </div>
              ) : (
                <>
                  {skills.map(skill => {
                    const goalCount    = allTargets.filter(t => t.programId === skill.id && (t.isActive ?? true)).length;
                    const masteredCnt  = allTargets.filter(t => t.programId === skill.id && t.phase === "MASTERED").length;
                    const pct          = goalCount > 0 ? Math.round((masteredCnt / goalCount) * 100) : 0;

                    return (
                      <div key={skill.id}
                        className="flex items-center gap-3 px-4 py-3 border-b border-[var(--glass-border)] last:border-b-0 hover:bg-white/[0.02] transition-colors cursor-pointer group/skill"
                        onClick={() => onOpenSkillGoals(skill)}
                      >
                        {/* Indent line */}
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <div className="h-4 w-px bg-[var(--glass-border)]" />
                          <Layers className="h-4 w-4 text-[var(--accent-purple)]" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-200">{skill.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-zinc-500">
                              {goalCount} goal{goalCount !== 1 ? "s" : ""}
                            </span>
                            {masteredCnt > 0 && (
                              <span className="text-xs text-emerald-400">{masteredCnt} mastered</span>
                            )}
                          </div>
                          {goalCount > 0 && (
                            <div className="mt-1 h-1 w-24 rounded-full bg-[var(--glass-border)]">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Skill edit/delete */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/skill:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button type="button" onClick={() => onEditSkill(skill)}
                            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-all">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => onDeleteSkill(skill)}
                            className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 transition-all">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                      </div>
                    );
                  })}

                  {/* Add skill row */}
                  <button type="button" onClick={e => { e.stopPropagation(); onAddSkill(); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs text-zinc-500 hover:text-[var(--accent-purple)] hover:bg-white/[0.02] transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add Skill
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Goals view (Level 2) ───────────────────────────────────────────────── */

function GoalsView({
  skill,
  category,
  clientId,
  allTargets,
  onBack,
  onOpenTarget,
  onRefresh,
}: {
  skill: LocalProgram;
  category: LocalCategory | null;
  clientId: string;
  allTargets: LocalTarget[];
  onBack: () => void;
  onOpenTarget: (t: TargetPanelData) => void;
  onRefresh: () => void;
}) {
  const removeTarget   = useABAStore(s => s.removeTarget);
  const setTargetPhase = useABAStore(s => s.setTargetPhase);
  const [showAddGoal, setShowAddGoal] = useState(false);

  const goals = allTargets.filter(t => t.programId === skill.id && (t.isActive ?? true));

  function deleteGoal(goal: LocalTarget) {
    if (!confirm(`Remove "${goal.title ?? "this goal"}"?`)) return;
    removeTarget(goal.id);
    toast.success("Goal removed");
    onRefresh();
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack}
          className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          {category && (
            <p className="text-xs text-zinc-500 truncate">{category.name}</p>
          )}
          <h3 className="font-bold text-[var(--foreground)] text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent-purple)] shrink-0" />
            {skill.name}
          </h3>
        </div>
        <button type="button" onClick={() => setShowAddGoal(true)}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/20 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Goal
        </button>
      </div>

      {/* Stats bar */}
      {goals.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total",    value: goals.length,                                            color: "var(--foreground)" },
            { label: "Active",   value: goals.filter(t => t.phase !== "MASTERED").length,        color: "var(--accent-cyan)" },
            { label: "Mastered", value: goals.filter(t => t.phase === "MASTERED").length,        color: "#34d399" },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-3 text-center">
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-zinc-600">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Goal list */}
      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-14 text-center">
          <TargetIcon className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium mb-1">No goals yet</p>
          <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
            Add goals and targets that will be tracked during ABA sessions.
          </p>
          <button type="button" onClick={() => setShowAddGoal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-pink)]">
            <Plus className="h-4 w-4" /> Add First Goal
          </button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-[var(--glass-border)] divide-y divide-[var(--glass-border)]">
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onOpen={() => onOpenTarget({
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
              } as TargetPanelData)}
              onDelete={() => deleteGoal(goal)}
              onPhaseChange={p => { setTargetPhase(goal.id, p); onRefresh(); }}
            />
          ))}
          <button type="button" onClick={() => setShowAddGoal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs text-zinc-500 hover:text-[var(--accent-pink)] hover:bg-white/[0.02] transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Another Goal
          </button>
        </div>
      )}

      {/* Add goal modal */}
      <AnimatePresence>
        {showAddGoal && category && (
          <GoalModal
            clientId={clientId}
            categoryId={category.id}
            skillId={skill.id}
            skillName={skill.name}
            onClose={() => setShowAddGoal(false)}
            onSaved={onRefresh}
          />
        )}
        {showAddGoal && !category && (
          <GoalModal
            clientId={clientId}
            categoryId={skill.categoryId}
            skillId={skill.id}
            skillName={skill.name}
            onClose={() => setShowAddGoal(false)}
            onSaved={onRefresh}
          />
        )}
      </AnimatePresence>
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
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // View state: "list" = accordion, "goals" = goals inside a skill
  const [view,          setView]          = useState<"list" | "goals">("list");
  const [selectedSkill, setSelectedSkill] = useState<LocalProgram | null>(null);

  // Expanded category ids (accordion state)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // Modal state
  const [showCatModal,   setShowCatModal]   = useState(false);
  const [editingCat,     setEditingCat]     = useState<LocalCategory | null>(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [editingSkill,   setEditingSkill]   = useState<LocalProgram | null>(null);
  const [skillCatId,     setSkillCatId]     = useState<string>("");
  const [tick,           setTick]           = useState(0);

  // Store
  const categories   = useABAStore(s => (s.categories ?? []).filter(c => c.clientId === clientId));
  const allPrograms  = useABAStore(s => s.programs ?? []);
  const allTargets   = useABAStore(s => s.targets ?? []);
  const removeCategory = useABAStore(s => s.removeCategory);
  const removeProgram  = useABAStore(s => s.removeProgram);

  function refresh() { setTick(t => t + 1); }

  function toggleCat(id: string) {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openSkillGoals(skill: LocalProgram) {
    setSelectedSkill(skill);
    setView("goals");
  }

  function goBack() {
    setView("list");
    setSelectedSkill(null);
  }

  function openAddSkill(catId: string) {
    setSkillCatId(catId);
    setEditingSkill(null);
    setShowSkillModal(true);
  }

  function handleEditSkill(skill: LocalProgram) {
    setSkillCatId(skill.categoryId);
    setEditingSkill(skill);
    setShowSkillModal(true);
  }

  function handleDeleteCat(cat: LocalCategory) {
    if (!confirm(`Remove category "${cat.name ?? "this category"}" and all its skills?`)) return;
    removeCategory(cat.id);
    toast.success("Category removed");
    refresh();
  }

  function handleDeleteSkill(skill: LocalProgram) {
    if (!confirm(`Remove skill "${skill.name ?? "this skill"}"?`)) return;
    removeProgram(skill.id);
    toast.success("Skill removed");
    refresh();
  }

  if (!hydrated) return <Skeleton />;

  // Totals for header
  const totalGoals    = allTargets.filter(t => t.clientId === clientId && (t.isActive ?? true)).length;
  const masteredGoals = allTargets.filter(t => t.clientId === clientId && t.phase === "MASTERED").length;

  return (
    <div className="space-y-4" key={tick}>
      {/* ── Goals view (Level 2) ── */}
      <AnimatePresence mode="wait">
        {view === "goals" && selectedSkill ? (
          <GoalsView
            key="goals-view"
            skill={selectedSkill}
            category={categories.find(c => c.id === selectedSkill.categoryId) ?? null}
            clientId={clientId}
            allTargets={allTargets}
            onBack={goBack}
            onOpenTarget={onOpenTarget}
            onRefresh={refresh}
          />
        ) : (
          <motion.div
            key="list-view"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            className="space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-[var(--foreground)] text-base">Goals &amp; Targets</h3>
                {totalGoals > 0 && (
                  <p className="text-xs text-zinc-500">
                    {totalGoals} active · {masteredGoals} mastered
                  </p>
                )}
              </div>
              <button type="button"
                onClick={() => { setEditingCat(null); setShowCatModal(true); }}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors">
                <Plus className="h-3.5 w-3.5" /> + Category
              </button>
            </div>

            {/* Empty state */}
            {categories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-semibold mb-1">No categories yet</p>
                <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
                  Start by creating a <strong className="text-zinc-400">Category</strong> like &ldquo;Language &amp; Communication&rdquo;, then add skills and goals inside.
                </p>
                <button type="button" onClick={() => setShowCatModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)]">
                  <Plus className="h-4 w-4" /> Add First Category
                </button>
              </div>
            ) : (
              <>
                {categories.map(cat => {
                  const skills = allPrograms.filter(p => p.categoryId === cat.id && p.clientId === clientId);
                  return (
                    <CategorySection
                      key={cat.id}
                      category={cat}
                      skills={skills}
                      allTargets={allTargets}
                      expanded={expandedCats.has(cat.id)}
                      onToggle={() => toggleCat(cat.id)}
                      onEditCat={() => { setEditingCat(cat); setShowCatModal(true); }}
                      onDeleteCat={() => handleDeleteCat(cat)}
                      onAddSkill={() => openAddSkill(cat.id)}
                      onEditSkill={handleEditSkill}
                      onDeleteSkill={handleDeleteSkill}
                      onOpenSkillGoals={openSkillGoals}
                    />
                  );
                })}

                <button type="button"
                  onClick={() => { setEditingCat(null); setShowCatModal(true); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-3 text-sm text-zinc-500 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors">
                  <Plus className="h-4 w-4" /> Add Another Category
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showCatModal && (
          <CategoryModal
            clientId={clientId}
            editCat={editingCat}
            onClose={() => { setShowCatModal(false); setEditingCat(null); }}
            onSaved={refresh}
          />
        )}
        {showSkillModal && skillCatId && (
          <SkillModal
            clientId={clientId}
            categoryId={skillCatId}
            categoryName={categories.find(c => c.id === skillCatId)?.name ?? ""}
            editSkill={editingSkill}
            onClose={() => { setShowSkillModal(false); setEditingSkill(null); }}
            onSaved={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
