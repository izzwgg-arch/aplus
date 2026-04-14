"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BarChart2,
  Calendar,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Target as TargetIcon,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useABAStore,
  defaultMastery,
  defaultPromptLevels,
  type LocalCategory,
  type LocalProgram,
  type LocalTarget,
  type PromptLevel,
} from "@/store/abaStore";
import type { TargetPanelData } from "./TargetDetailPanel";

const CATEGORY_COLORS = [
  "#06b6d4",
  "#a855f7",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#f97316",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
];

const CATEGORY_PRESETS = [
  "Language & Communication",
  "Social Skills",
  "Adaptive Behavior",
  "Receptive Language",
  "Expressive Language",
  "Behavior Reduction",
  "Play & Leisure",
  "Academic / Pre-Academic",
];

const TARGET_TYPE_OPTIONS = [
  { value: "DISCRETE_TRIAL", label: "Discrete Trial Training" },
  { value: "TASK_ANALYSIS_FWD", label: "Task Analysis - Forward" },
  { value: "TASK_ANALYSIS_BWD", label: "Task Analysis - Backward" },
  { value: "TASK_ANALYSIS_TOTAL", label: "Task Analysis - Total Task" },
  { value: "DURATION", label: "Duration" },
  { value: "LATENCY", label: "Latency" },
  { value: "FREQUENCY", label: "Frequency" },
  { value: "PARTIAL_INTERVAL", label: "Partial Interval" },
  { value: "WHOLE_INTERVAL", label: "Whole Interval" },
  { value: "MOMENTARY_TIME_SAMPLE", label: "Momentary Time Sample" },
  { value: "COLD_PROBE", label: "Cold Probe" },
  { value: "OTHER", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "mastered", label: "Mastered" },
  { value: "paused", label: "Paused" },
] as const;

const UNASSIGNED_SKILL_PREFIX = "__unassigned__:";

type SkillAreaItem = {
  id: string;
  name: string;
  description?: string;
  goalCount: number;
  masteredCount: number;
  isUnassigned: boolean;
  skill: LocalProgram | null;
};

type ViewState =
  | { level: "categories" }
  | { level: "skills"; categoryId: string }
  | { level: "goals"; categoryId: string; skillId: string }
  | { level: "goal"; categoryId: string; skillId: string; goalId: string };

type GoalStatus = "active" | "mastered" | "paused";

function makeId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isUnassignedSkillId(skillId: string) {
  return skillId.startsWith(UNASSIGNED_SKILL_PREFIX);
}

function countGoalProgress(trials: Array<{ result: string }>) {
  const total = trials.length;
  const correct = trials.filter((trial) => trial.result === "CORRECT" || trial.result === "INDEPENDENT").length;
  return {
    total,
    correct,
    pct: total > 0 ? Math.round((correct / total) * 100) : null,
  };
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass-card skeleton h-20 rounded-2xl" />
      ))}
    </div>
  );
}

function Breadcrumbs({
  category,
  skillLabel,
  goalTitle,
  onGoCategories,
  onGoSkills,
  onGoGoals,
}: {
  category?: string | null;
  skillLabel?: string | null;
  goalTitle?: string | null;
  onGoCategories: () => void;
  onGoSkills?: () => void;
  onGoGoals?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500 flex-wrap">
      <button type="button" onClick={onGoCategories} className="hover:text-[var(--accent-cyan)] transition-colors">
        Goals &amp; Targets
      </button>
      {category && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          {onGoSkills ? (
            <button type="button" onClick={onGoSkills} className="hover:text-[var(--accent-cyan)] transition-colors">
              {category}
            </button>
          ) : (
            <span className="text-zinc-300">{category}</span>
          )}
        </>
      )}
      {skillLabel && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          {onGoGoals ? (
            <button type="button" onClick={onGoGoals} className="hover:text-[var(--accent-cyan)] transition-colors">
              {skillLabel}
            </button>
          ) : (
            <span className="text-zinc-300">{skillLabel}</span>
          )}
        </>
      )}
      {goalTitle && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-zinc-300">{goalTitle}</span>
        </>
      )}
    </div>
  );
}

function CategoryModal({
  clientId,
  category,
  onClose,
}: {
  clientId: string;
  category: LocalCategory | null;
  onClose: () => void;
}) {
  const addCategory = useABAStore((s) => s.addCategory);
  const updateCategory = useABAStore((s) => s.updateCategory);
  const setCategoryServerId = useABAStore((s) => s.setCategoryServerId);

  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (category) {
      updateCategory(category.id, {
        name: trimmedName,
        description: trimmedDescription,
        color,
      });

      if (category.serverId) {
        await fetch(`/smart-steps/api/programs/${category.serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            domain: trimmedName,
          }),
        }).catch(() => {});
      }

      toast.success("Category updated");
    } else {
      const localId = makeId();
      addCategory({
        id: localId,
        clientId,
        name: trimmedName,
        description: trimmedDescription,
        color,
        createdAt: new Date().toISOString(),
        synced: false,
      });

      fetch("/smart-steps/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          name: trimmedName,
          domain: trimmedName,
          description: trimmedDescription,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.id) setCategoryServerId(localId, data.id);
        })
        .catch(() => {});

      toast.success("Category created");
    }

    setSaving(false);
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)]">
          <h2 className="font-bold text-[var(--foreground)]">{category ? "Edit Category" : "New Category"}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Category Name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Language & Communication"
              className="field-input w-full"
              required
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setName(preset)}
                className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional category notes"
              className="field-input w-full resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={`h-8 w-8 rounded-xl ${color === swatch ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--background)]" : ""}`}
                  style={{ background: swatch }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving..." : category ? "Save Category" : "Create Category"}
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

function SkillAreaModal({
  clientId,
  category,
  skill,
  onClose,
}: {
  clientId: string;
  category: LocalCategory;
  skill: LocalProgram | null;
  onClose: () => void;
}) {
  const addProgram = useABAStore((s) => s.addProgram);
  const updateProgram = useABAStore((s) => s.updateProgram);
  const setProgramServerId = useABAStore((s) => s.setProgramServerId);

  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (skill) {
      updateProgram(skill.id, {
        name: trimmedName,
        description: trimmedDescription,
      });

      if (skill.serverId) {
        await fetch(`/smart-steps/api/clients/${clientId}/goals/${skill.serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmedName,
            description: trimmedDescription,
            domain: category.name,
          }),
        }).catch(() => {});
      }

      toast.success("Skill area updated");
    } else {
      const localId = makeId();
      addProgram({
        id: localId,
        categoryId: category.id,
        clientId,
        name: trimmedName,
        description: trimmedDescription,
        createdAt: new Date().toISOString(),
        synced: false,
      });

      fetch(`/smart-steps/api/clients/${clientId}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedName,
          description: trimmedDescription,
          domain: category.name,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.id) setProgramServerId(localId, data.id);
        })
        .catch(() => {});

      toast.success("Skill area created");
    }

    setSaving(false);
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)]">
          <div>
            <h2 className="font-bold text-[var(--foreground)]">{skill ? "Edit Skill Area" : "New Skill Area"}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Inside {category.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Skill Area Name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Receptive Language"
              className="field-input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional skill area notes"
              className="field-input w-full resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving..." : skill ? "Save Skill Area" : "Create Skill Area"}
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

function GoalModal({
  clientId,
  category,
  skill,
  goal,
  onClose,
}: {
  clientId: string;
  category: LocalCategory;
  skill: LocalProgram;
  goal: LocalTarget | null;
  onClose: () => void;
}) {
  const addTarget = useABAStore((s) => s.addTarget);
  const updateTarget = useABAStore((s) => s.updateTarget);
  const setTargetServerId = useABAStore((s) => s.setTargetServerId);

  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? goal?.operationalDefinition ?? "");
  const [dateOpened, setDateOpened] = useState(goal?.masteryCriteria.openedDate ?? todayIso());
  const [dateMastered, setDateMastered] = useState(goal?.masteryCriteria.masteredDate ?? "");
  const [baselineLevel, setBaselineLevel] = useState(goal?.baselineLevel ?? "");
  const [masteryPercentage, setMasteryPercentage] = useState(goal?.masteryCriteria.percentage ?? 80);
  const [requiredTrials, setRequiredTrials] = useState(goal?.masteryCriteria.minTrialsPerSession ?? 5);
  const [requiredPrompts, setRequiredPrompts] = useState(goal?.requiredPrompts ?? "");
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? (goal?.phase === "MASTERED" ? "mastered" : "active"));
  const [manualMaster, setManualMaster] = useState((goal?.status ?? (goal?.phase === "MASTERED" ? "mastered" : "active")) === "mastered");
  const [targetType, setTargetType] = useState<LocalTarget["targetType"]>(goal?.targetType ?? "DISCRETE_TRIAL");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);

    const now = new Date().toISOString();
    const resolvedStatus: GoalStatus = manualMaster ? "mastered" : status;
    const resolvedMasteredDate = resolvedStatus === "mastered" ? (dateMastered || todayIso()) : null;
    const resolvedPhase = resolvedStatus === "mastered" ? "MASTERED" : goal?.phase ?? "ACQUISITION";
    const masteryCriteria = {
      ...(goal?.masteryCriteria ?? defaultMastery()),
      percentage: masteryPercentage,
      minTrialsPerSession: requiredTrials,
      openedDate: dateOpened || null,
      masteredDate: resolvedMasteredDate,
    };

    const localPatch: Partial<LocalTarget> = {
      title: title.trim(),
      description: description.trim(),
      operationalDefinition: description.trim(),
      baselineLevel: baselineLevel.trim(),
      requiredPrompts: requiredPrompts.trim(),
      status: resolvedStatus,
      targetType: targetType as LocalTarget["targetType"],
      phase: resolvedPhase,
      masteryCriteria,
      updatedAt: now,
    };

    if (goal) {
      updateTarget(goal.id, localPatch);

      if (goal.serverId) {
        await fetch(`/smart-steps/api/targets/${goal.serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            definition: title.trim(),
            targetType,
            phase: resolvedPhase,
            masteryRule: {
              percentage: masteryPercentage,
              minTrialsPerSession: requiredTrials,
              openedDate: dateOpened || null,
              masteredDate: resolvedMasteredDate,
              requiredPrompts: requiredPrompts.trim() || null,
              status: resolvedStatus,
            },
            promptHierarchy: defaultPromptLevels().map((item) => item.name),
            baseline: baselineLevel.trim() || null,
            notes: description.trim() || null,
            isActive: true,
          }),
        }).catch(() => {});
      }

      toast.success("Goal updated");
    } else {
      const localId = makeId();
      addTarget({
        id: localId,
        programId: skill.id,
        categoryId: category.id,
        clientId,
        title: title.trim(),
        description: description.trim(),
        operationalDefinition: description.trim(),
        baselineLevel: baselineLevel.trim(),
        requiredPrompts: requiredPrompts.trim(),
        status: resolvedStatus,
        targetType: targetType as LocalTarget["targetType"],
        phase: resolvedPhase,
        masteryCriteria,
        promptLevels: defaultPromptLevels(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
        synced: false,
      });

      const parentGoalId = skill.serverId ?? null;
      fetch("/smart-steps/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: title.trim(),
          operationalDefinition: description.trim(),
          targetType,
          phase: resolvedPhase,
          masteryRule: {
            percentage: masteryPercentage,
            minTrialsPerSession: requiredTrials,
            openedDate: dateOpened || null,
            masteredDate: resolvedMasteredDate,
            requiredPrompts: requiredPrompts.trim() || null,
            status: resolvedStatus,
          },
          promptHierarchy: defaultPromptLevels().map((item) => item.name),
          baseline: baselineLevel.trim() || null,
          notes: description.trim() || null,
          parentGoalId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.id) setTargetServerId(localId, data.id);
        })
        .catch(() => {});

      toast.success("Goal created");
    }

    setSaving(false);
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)]">
          <div>
            <h2 className="font-bold text-[var(--foreground)]">{goal ? "Edit Goal" : "New Goal"}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {category.name} / {skill.name}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[85vh] overflow-y-auto">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Goal Title <span className="text-[var(--accent-pink)]">*</span>
              </label>
              <input
                autoFocus
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Client will follow 1-step instructions with prompts"
                className="field-input w-full"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional ABA description / operational definition"
                className="field-input w-full resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Date Opened</label>
              <input type="date" value={dateOpened} onChange={(e) => setDateOpened(e.target.value)} className="field-input w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Date Mastered</label>
              <input type="date" value={dateMastered} onChange={(e) => setDateMastered(e.target.value)} className="field-input w-full" />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Baseline Level</label>
              <input
                type="text"
                value={baselineLevel}
                onChange={(e) => setBaselineLevel(e.target.value)}
                placeholder="e.g. 20%, 1/5 trials"
                className="field-input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tracking Type</label>
              <select value={targetType} onChange={(e) => setTargetType(e.target.value as LocalTarget["targetType"])} className="field-input w-full">
                {TARGET_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Mastery Percentage</label>
              <input
                type="number"
                min={0}
                max={100}
                value={masteryPercentage}
                onChange={(e) => setMasteryPercentage(Number(e.target.value))}
                className="field-input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Required Trials</label>
              <input
                type="number"
                min={1}
                value={requiredTrials}
                onChange={(e) => setRequiredTrials(Number(e.target.value))}
                className="field-input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Required Prompts</label>
              <input
                type="text"
                value={requiredPrompts}
                onChange={(e) => setRequiredPrompts(e.target.value)}
                placeholder="Optional prompt requirement"
                className="field-input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)} className="field-input w-full">
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] px-4 py-3 cursor-pointer">
            <div>
              <p className="text-sm font-medium text-zinc-200">Manual Master Toggle</p>
              <p className="text-xs text-zinc-500">Mark this goal as mastered manually.</p>
            </div>
            <input
              type="checkbox"
              checked={manualMaster}
              onChange={(e) => setManualMaster(e.target.checked)}
              className="accent-emerald-400 h-4 w-4"
            />
          </label>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Saving..." : goal ? "Save Goal" : "Create Goal"}
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

function GoalDetailView({
  clientId,
  category,
  skill,
  goal,
  onBack,
  onEdit,
  onOpenTarget,
}: {
  clientId: string;
  category: LocalCategory;
  skill: LocalProgram | null;
  goal: LocalTarget;
  onBack: () => void;
  onEdit: () => void;
  onOpenTarget: (target: TargetPanelData) => void;
}) {
  const targetApiId = goal.serverId ?? (goal.id.startsWith("local-") ? null : goal.id);
  const { data } = useQuery<{ trials: Array<{ result: string }> }>({
    queryKey: ["goal-progress", targetApiId],
    queryFn: async () => {
      if (!targetApiId) return { trials: [] };
      const res = await fetch(`/smart-steps/api/targets/${targetApiId}`);
      if (!res.ok) return { trials: [] };
      return res.json();
    },
    enabled: !!targetApiId,
    staleTime: 15000,
  });

  const progress = countGoalProgress(data?.trials ?? []);
  const status = goal.status ?? (goal.phase === "MASTERED" ? "mastered" : "active");

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 truncate">
              {category.name} / {skill?.name ?? "Unassigned Goals"}
            </p>
            <h3 className="font-bold text-[var(--foreground)] text-base truncate">{goal.title}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-colors">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={() =>
              onOpenTarget({
                id: goal.id,
                serverId: goal.serverId,
                title: goal.title,
                operationalDefinition: goal.operationalDefinition,
                targetType: goal.targetType,
                phase: goal.phase,
                masteryCriteria: goal.masteryCriteria,
                promptLevels: goal.promptLevels as PromptLevel[],
              })
            }
            className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
          >
            <BarChart2 className="h-3.5 w-3.5" /> View Data
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className={`text-2xl font-bold ${progress.pct !== null && progress.pct >= goal.masteryCriteria.percentage ? "text-emerald-400" : "text-[var(--accent-cyan)]"}`}>
            {progress.pct !== null ? `${progress.pct}%` : "--"}
          </p>
          <p className="text-xs text-zinc-500">Current Progress</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-zinc-200">{goal.masteryCriteria.percentage}%</p>
          <p className="text-xs text-zinc-500">Mastery Goal</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-zinc-200">{goal.masteryCriteria.minTrialsPerSession}</p>
          <p className="text-xs text-zinc-500">Required Trials</p>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className={`text-2xl font-bold ${status === "mastered" ? "text-emerald-400" : status === "paused" ? "text-amber-400" : "text-zinc-200"}`}>
            {status}
          </p>
          <p className="text-xs text-zinc-500">Status</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Description</p>
            <p className="text-sm text-zinc-200">{goal.description || goal.operationalDefinition || "No description yet"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Tracking Type</p>
            <p className="text-sm text-zinc-200">{goal.targetType}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Date Opened</p>
            <p className="text-sm text-zinc-200">{goal.masteryCriteria.openedDate || "--"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Date Mastered</p>
            <p className="text-sm text-zinc-200">{goal.masteryCriteria.masteredDate || "--"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Baseline Level</p>
            <p className="text-sm text-zinc-200">{goal.baselineLevel || "--"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Required Prompts</p>
            <p className="text-sm text-zinc-200">{goal.requiredPrompts || "--"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--glass-border)] p-4 bg-[var(--glass-bg)]/40">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-400" />
              Progress Summary
            </p>
            <span className="text-xs text-zinc-500">{progress.total} total trials</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--glass-border)] overflow-hidden">
            <div
              className={`h-full rounded-full ${progress.pct !== null && progress.pct >= goal.masteryCriteria.percentage ? "bg-emerald-400" : "bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)]"}`}
              style={{ width: `${Math.max(0, Math.min(progress.pct ?? 0, 100))}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--glass-border)] p-4 bg-[var(--glass-bg)]/30">
          <p className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--accent-cyan)]" />
            Tracking Fields
          </p>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Current Progress</p>
              <p className="text-zinc-200">{progress.pct !== null ? `${progress.pct}%` : "No data yet"}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Mastery Percentage</p>
              <p className="text-zinc-200">{goal.masteryCriteria.percentage}%</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Required Trials</p>
              <p className="text-zinc-200">{goal.masteryCriteria.minTrialsPerSession}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ProgramsTab({
  clientId,
  onOpenTarget,
}: {
  clientId: string;
  onOpenTarget: (target: TargetPanelData) => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewState>({ level: "categories" });
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LocalCategory | null>(null);
  const [editingSkill, setEditingSkill] = useState<LocalProgram | null>(null);
  const [editingGoal, setEditingGoal] = useState<LocalTarget | null>(null);

  const categories = useABAStore((s) => (s.categories ?? []).filter((item) => item.clientId === clientId));
  const skills = useABAStore((s) => (s.programs ?? []).filter((item) => item.clientId === clientId));
  const goals = useABAStore((s) => (s.targets ?? []).filter((item) => item.clientId === clientId && item.isActive !== false));

  useEffect(() => setHydrated(true), []);

  const selectedCategory = view.level !== "categories"
    ? categories.find((item) => item.id === view.categoryId) ?? null
    : null;

  const selectedSkill = view.level === "goals" || view.level === "goal"
    ? skills.find((item) => item.id === view.skillId) ?? null
    : null;

  const selectedGoal = view.level === "goal"
    ? goals.find((item) => item.id === view.goalId) ?? null
    : null;

  const categorySkills = useMemo(() => {
    if (!selectedCategory) return [];
    return skills.filter((item) => item.categoryId === selectedCategory.id);
  }, [selectedCategory, skills]);

  const categoryGoals = useMemo(() => {
    if (!selectedCategory) return [];
    return goals.filter((item) => item.categoryId === selectedCategory.id);
  }, [selectedCategory, goals]);

  const unassignedCategoryGoals = useMemo(() => {
    if (!selectedCategory) return [];
    return categoryGoals.filter((item) => !item.programId);
  }, [categoryGoals, selectedCategory]);

  const skillAreaItems = useMemo<SkillAreaItem[]>(() => {
    if (!selectedCategory) return [];
    const items: SkillAreaItem[] = categorySkills.map((skill) => {
      const skillGoals = goals.filter((goal) => goal.programId === skill.id);
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        goalCount: skillGoals.length,
        masteredCount: skillGoals.filter((goal) => (goal.status ?? (goal.phase === "MASTERED" ? "mastered" : "active")) === "mastered").length,
        isUnassigned: false,
        skill,
      };
    });

    if (unassignedCategoryGoals.length > 0) {
      items.push({
        id: `${UNASSIGNED_SKILL_PREFIX}${selectedCategory.id}`,
        name: "Unassigned Goals",
        description: "Existing goals not yet linked to a skill area",
        goalCount: unassignedCategoryGoals.length,
        masteredCount: unassignedCategoryGoals.filter((goal) => (goal.status ?? (goal.phase === "MASTERED" ? "mastered" : "active")) === "mastered").length,
        isUnassigned: true,
        skill: null,
      });
    }

    return items;
  }, [categorySkills, goals, selectedCategory, unassignedCategoryGoals]);

  const visibleGoals = useMemo(() => {
    if (view.level !== "goals" && view.level !== "goal") return [];
    if (isUnassignedSkillId(view.skillId)) {
      return goals.filter((goal) => goal.categoryId === view.categoryId && !goal.programId);
    }
    return goals.filter((goal) => goal.programId === view.skillId);
  }, [goals, view]);

  if (!hydrated) return <Skeleton />;

  return (
    <div className="space-y-4">
      <Breadcrumbs
        category={selectedCategory?.name}
        skillLabel={
          view.level === "goals" || view.level === "goal"
            ? (isUnassignedSkillId(view.skillId) ? "Unassigned Goals" : selectedSkill?.name ?? null)
            : null
        }
        goalTitle={view.level === "goal" ? selectedGoal?.title ?? null : null}
        onGoCategories={() => setView({ level: "categories" })}
        onGoSkills={view.level === "goals" || view.level === "goal" ? () => selectedCategory && setView({ level: "skills", categoryId: selectedCategory.id }) : undefined}
        onGoGoals={view.level === "goal" ? () => selectedCategory && setView({ level: "goals", categoryId: selectedCategory.id, skillId: view.skillId }) : undefined}
      />

      <AnimatePresence mode="wait">
        {view.level === "categories" && (
          <motion.div key="categories" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-[var(--foreground)] text-base">Goals &amp; Targets</h3>
                <p className="text-xs text-zinc-500">{categories.length} categories</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingCategory(null);
                  setShowCategoryModal(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Category
              </button>
            </div>

            {categories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-semibold mb-1">No categories yet</p>
                <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
                  Create a category first, then click into it to add skill areas and goals.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(null);
                    setShowCategoryModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)]"
                >
                  <Plus className="h-4 w-4" /> Create First Category
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map((category) => {
                  const skillCount = skills.filter((item) => item.categoryId === category.id).length;
                  const goalCount = goals.filter((item) => item.categoryId === category.id).length;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setView({ level: "skills", categoryId: category.id })}
                      className="w-full glass-card rounded-2xl border border-[var(--glass-border)] p-4 text-left hover:border-[var(--accent-cyan)]/40 hover:bg-white/[0.02] transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ background: category.color ?? "#06b6d4" }}
                        >
                          {(category.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[var(--foreground)] text-sm">{category.name}</p>
                          <p className="text-xs text-zinc-500">
                            {skillCount} skill areas · {goalCount} goals
                          </p>
                          {category.description && <p className="text-xs text-zinc-600 truncate mt-0.5">{category.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCategory(category);
                              setShowCategoryModal(true);
                            }}
                            className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRight className="h-4 w-4 text-zinc-600" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {view.level === "skills" && selectedCategory && (
          <motion.div key="skills" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setView({ level: "categories" })}
                  className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--foreground)] text-base truncate">{selectedCategory.name}</h3>
                  <p className="text-xs text-zinc-500">{skillAreaItems.length} skill areas</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCategory(selectedCategory);
                    setShowCategoryModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSkill(null);
                    setShowSkillModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Skill Area
                </button>
              </div>
            </div>

            {skillAreaItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-semibold mb-1">No skill areas yet</p>
                <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
                  Add a skill area inside this category, then click it to manage goals.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSkill(null);
                    setShowSkillModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-purple)]"
                >
                  <Plus className="h-4 w-4" /> Add First Skill Area
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {skillAreaItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView({ level: "goals", categoryId: selectedCategory.id, skillId: item.id })}
                    className="w-full glass-card rounded-2xl border border-[var(--glass-border)] p-4 text-left hover:border-[var(--accent-purple)]/40 hover:bg-white/[0.02] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center shrink-0">
                        <Layers className="h-5 w-5 text-[var(--accent-purple)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--foreground)] text-sm">{item.name}</p>
                        <p className="text-xs text-zinc-500">
                          {item.goalCount} goals · {item.masteredCount} mastered
                        </p>
                        {item.description && <p className="text-xs text-zinc-600 truncate mt-0.5">{item.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!item.isUnassigned && item.skill && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSkill(item.skill);
                              setShowSkillModal(true);
                            }}
                            className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronRight className="h-4 w-4 text-zinc-600" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {view.level === "goals" && selectedCategory && (
          <motion.div key="goals" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setView({ level: "skills", categoryId: selectedCategory.id })}
                  className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--foreground)] text-base truncate">
                    {isUnassignedSkillId(view.skillId) ? "Unassigned Goals" : selectedSkill?.name ?? "Goals"}
                  </h3>
                  <p className="text-xs text-zinc-500">{visibleGoals.length} goals</p>
                </div>
              </div>
              {!isUnassignedSkillId(view.skillId) && selectedSkill && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingGoal(null);
                    setShowGoalModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Goal
                </button>
              )}
            </div>

            {visibleGoals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
                <TargetIcon className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400 font-semibold mb-1">No goals yet</p>
                <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">
                  Create goals inside this skill area to begin tracking progress.
                </p>
                {!isUnassignedSkillId(view.skillId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGoal(null);
                      setShowGoalModal(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-pink)]"
                  >
                    <Plus className="h-4 w-4" /> Add First Goal
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleGoals.map((goal) => {
                  const status = goal.status ?? (goal.phase === "MASTERED" ? "mastered" : "active");
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setView({ level: "goal", categoryId: selectedCategory.id, skillId: view.skillId, goalId: goal.id })}
                      className="w-full glass-card rounded-2xl border border-[var(--glass-border)] p-4 text-left hover:border-[var(--accent-cyan)]/40 hover:bg-white/[0.02] transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-[var(--accent-cyan)]/10 flex items-center justify-center shrink-0">
                          <TargetIcon className="h-5 w-5 text-[var(--accent-cyan)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[var(--foreground)] text-sm">{goal.title}</p>
                          <p className="text-xs text-zinc-500">
                            {status} · mastery {goal.masteryCriteria.percentage}% · trials {goal.masteryCriteria.minTrialsPerSession}
                          </p>
                          {(goal.description || goal.operationalDefinition) && (
                            <p className="text-xs text-zinc-600 truncate mt-0.5">{goal.description || goal.operationalDefinition}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {view.level === "goal" && selectedCategory && selectedGoal && (
          <GoalDetailView
            key="goal"
            clientId={clientId}
            category={selectedCategory}
            skill={selectedSkill}
            goal={selectedGoal}
            onBack={() => setView({ level: "goals", categoryId: view.categoryId, skillId: view.skillId })}
            onEdit={() => {
              setEditingGoal(selectedGoal);
              setShowGoalModal(true);
            }}
            onOpenTarget={onOpenTarget}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategoryModal && (
          <CategoryModal
            clientId={clientId}
            category={editingCategory}
            onClose={() => {
              setShowCategoryModal(false);
              setEditingCategory(null);
            }}
          />
        )}

        {showSkillModal && selectedCategory && (
          <SkillAreaModal
            clientId={clientId}
            category={selectedCategory}
            skill={editingSkill}
            onClose={() => {
              setShowSkillModal(false);
              setEditingSkill(null);
            }}
          />
        )}

        {showGoalModal && selectedCategory && selectedSkill && !isUnassignedSkillId(selectedSkill.id) && (
          <GoalModal
            clientId={clientId}
            category={selectedCategory}
            skill={selectedSkill}
            goal={editingGoal}
            onClose={() => {
              setShowGoalModal(false);
              setEditingGoal(null);
            }}
          />
        )}

        {showGoalModal && selectedCategory && view.level === "goals" && !isUnassignedSkillId(view.skillId) && !selectedSkill && (
          <GoalModal
            clientId={clientId}
            category={selectedCategory}
            skill={{
              id: view.skillId,
              name: "",
              categoryId: selectedCategory.id,
              clientId,
              createdAt: new Date().toISOString(),
              synced: false,
            }}
            goal={editingGoal}
            onClose={() => {
              setShowGoalModal(false);
              setEditingGoal(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
