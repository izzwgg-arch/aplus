"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart2,
  BookPlus,
  Calendar,
  ChevronRight,
  Copy,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Lightbulb,
  Printer,
  RotateCcw,
  StickyNote,
  Target as TargetIcon,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { printGoals, type GoalStatusFilter, type PrintableGoal, type PrintableTarget } from "@/lib/printGoals";
import {
  useABAStore,
  defaultMastery,
  defaultPromptLevels,
  type LocalCategory,
  type LocalProgram,
  type LocalTarget,
  type PromptLevel,
  GOAL_LIFECYCLE_OPTIONS,
  lifecycleFromPhase,
  lifecycleDisplayLabel,
  phaseFromLifecycle,
  isNewPhase,
  isMasteredPhase,
  type GoalLifecycleKey,
  sortByCreatedAt,
  CATEGORY_COLOR_PALETTE,
  categoryColor,
} from "@/store/abaStore";
import type { TargetPanelData } from "./TargetDetailPanel";

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
] as const;
const UNASSIGNED_SKILL_PREFIX = "__unassigned__:";
type ViewState =
  | { level: "categories" }
  | { level: "skills"; categoryId: string }
  | { level: "goals"; categoryId: string; skillId: string }
  | { level: "goal"; categoryId: string; skillId: string; goalId: string };
type SkillItem = {
  id: string;
  name: string;
  description?: string;
  goalCount: number;
  masteredCount: number;
  skill: LocalProgram | null;
  isUnassigned: boolean;
};

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
    pct: total > 0 ? Math.round((correct / total) * 100) : null,
  };
}

function toPanelTarget(goal: LocalTarget, initialTab?: TargetPanelData["initialTab"]): TargetPanelData {
  return {
    id: goal.id,
    serverId: goal.serverId,
    title: goal.title,
    operationalDefinition: goal.operationalDefinition,
    description: goal.description,
    targetType: goal.targetType,
    phase: goal.phase,
    masteryCriteria: goal.masteryCriteria,
    promptLevels: goal.promptLevels as PromptLevel[],
    baselineLevel: goal.baselineLevel,
    requiredPrompts: goal.requiredPrompts,
    status: goal.status,
    isActive: goal.isActive,
    dateMastered: goal.masteryCriteria.masteredDate,
    createdAt: goal.createdAt,
    initialTab,
  };
}

function isCategory(value: unknown): value is LocalCategory {
  return !!value && typeof value === "object" && "id" in value && "clientId" in value && "name" in value;
}

function isSkill(value: unknown): value is LocalProgram {
  return !!value && typeof value === "object" && "id" in value && "clientId" in value && "categoryId" in value && "name" in value;
}

function isGoal(value: unknown): value is LocalTarget {
  return !!value && typeof value === "object" && "id" in value && "clientId" in value && "categoryId" in value && "title" in value;
}

function GoalLifecycleBadge({ phase }: { phase: string }) {
  if (isNewPhase(phase)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
        <Lightbulb className="h-3 w-3" />
        New
      </span>
    );
  }
  if (isMasteredPhase(phase)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
        <Trophy className="h-3 w-3" />
        Mastered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--accent-cyan)]">
      In Treatment
    </span>
  );
}

function masteryRuleStatus(lifecycle: GoalLifecycleKey): LocalTarget["status"] {
  if (lifecycle === "mastered") return "mastered";
  if (lifecycle === "new") return "new";
  return "active";
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass-card w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)]">
          <div>
            <h2 className="font-bold text-[var(--foreground)]">{title}</h2>
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CategoryModal({ clientId, category, onClose }: { clientId: string; category: LocalCategory | null; onClose: () => void }) {
  const addCategory = useABAStore((s) => s.addCategory);
  const updateCategory = useABAStore((s) => s.updateCategory);
  const setCategoryServerId = useABAStore((s) => s.setCategoryServerId);
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [color, setColor] = useState(category?.color ?? categoryColor(category?.serverId ?? category?.id ?? ""));
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (category) {
      updateCategory(category.id, { name: trimmedName, description: trimmedDescription, color });
      if (category.serverId) {
        await fetch(`/smart-steps/api/programs/${category.serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName, domain: trimmedName }),
        }).catch(() => {});
      }
      toast.success("Category updated");
    } else {
      const id = makeId();
      addCategory({
        id,
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
        body: JSON.stringify({ clientId, name: trimmedName, domain: trimmedName, description: trimmedDescription }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.id) setCategoryServerId(id, d.id);
        })
        .catch(() => {});
      toast.success("Category created");
    }
    setSaving(false);
    onClose();
  }

  return (
    <ModalShell title={category ? "Edit Category" : "New Category"} onClose={onClose}>
      <form onSubmit={onSubmit} className="px-5 py-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category Name</label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className="field-input w-full" required />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_PRESETS.map((preset) => (
            <button key={preset} type="button" onClick={() => setName(preset)} className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors">
              {preset}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input w-full resize-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLOR_PALETTE.map((swatch) => (
            <button key={swatch} type="button" onClick={() => setColor(swatch)} className={`h-8 w-8 rounded-xl ${color === swatch ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--background)]" : ""}`} style={{ background: swatch }} />
          ))}
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">{saving ? "Saving..." : category ? "Save Category" : "Create Category"}</button>
          <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}

function SkillAreaModal({ clientId, category, skill, onClose }: { clientId: string; category: LocalCategory; skill: LocalProgram | null; onClose: () => void }) {
  const addProgram = useABAStore((s) => s.addProgram);
  const updateProgram = useABAStore((s) => s.updateProgram);
  const setProgramServerId = useABAStore((s) => s.setProgramServerId);
  const [name, setName] = useState(skill?.name ?? "");
  const [description, setDescription] = useState(skill?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (skill) {
      updateProgram(skill.id, { name: trimmedName, description: trimmedDescription });
      if (skill.serverId) {
        await fetch(`/smart-steps/api/clients/${clientId}/goals/${skill.serverId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmedName, description: trimmedDescription, domain: category.name }),
        }).catch(() => {});
      }
      toast.success("Skill area updated");
    } else {
      // Guard: category must have a server ID before we can link the skill area.
      // Without it ParentGoal.programId would be NULL in the DB, making the
      // skill area invisible on every other computer after hydration.
      // Fallback: if this local category has no serverId yet, look for another
      // store entry with the same name that was hydrated from the server.
      const resolvedCategoryServerId =
        category.serverId ??
        useABAStore
          .getState()
          .categories.find(
            (c) =>
              c.serverId &&
              c.clientId === clientId &&
              c.name.trim().toLowerCase() === category.name.trim().toLowerCase(),
          )?.serverId ??
        null;
      if (!resolvedCategoryServerId) {
        toast.error("Category is still syncing — please wait a moment and try again.");
        setSaving(false);
        return;
      }
      const id = makeId();
      addProgram({
        id,
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
          programId: resolvedCategoryServerId,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.id) setProgramServerId(id, d.id);
        })
        .catch(() => {});
      toast.success("Skill area created");
    }

    setSaving(false);
    onClose();
  }

  return (
    <ModalShell title={skill ? "Edit Skill Area" : "New Skill Area"} subtitle={`Inside ${category.name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="px-5 py-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Skill Area Name</label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className="field-input w-full" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input w-full resize-none" />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">{saving ? "Saving..." : skill ? "Save Skill Area" : "Create Skill Area"}</button>
          <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}

function GoalModal({ clientId, category, skill, goal, onClose }: { clientId: string; category: LocalCategory; skill: LocalProgram; goal: LocalTarget | null; onClose: () => void }) {
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
  const [lifecycle, setLifecycle] = useState<GoalLifecycleKey>(
    goal ? lifecycleFromPhase(goal.phase) : "new"
  );
  const [targetType, setTargetType] = useState<LocalTarget["targetType"]>(goal?.targetType ?? "DISCRETE_TRIAL");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);

    const now = new Date().toISOString();
    const resolvedLifecycle = lifecycle;
    const resolvedStatus = masteryRuleStatus(resolvedLifecycle);
    const resolvedMasteredDate = resolvedLifecycle === "mastered" ? (dateMastered || todayIso()) : (dateMastered || null);
    const resolvedPhase = phaseFromLifecycle(resolvedLifecycle);
    const masteryCriteria = {
      ...(goal?.masteryCriteria ?? defaultMastery()),
      percentage: masteryPercentage,
      minTrialsPerSession: requiredTrials,
      openedDate: dateOpened || null,
      masteredDate: resolvedMasteredDate,
    };

    const patch: Partial<LocalTarget> = {
      title: title.trim(),
      description: description.trim(),
      operationalDefinition: description.trim(),
      baselineLevel: baselineLevel.trim(),
      requiredPrompts: requiredPrompts.trim(),
      status: resolvedStatus,
      targetType,
      phase: resolvedPhase,
      masteryCriteria,
      updatedAt: now,
    };

    if (goal) {
      updateTarget(goal.id, patch);
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
            dateMastered: resolvedMasteredDate,
            baseline: baselineLevel.trim() || null,
            notes: description.trim() || null,
          }),
        }).catch(() => {});
      }
      toast.success("Goal updated");
    } else {
      const id = makeId();
      addTarget({
        id,
        programId: skill.id,
        categoryId: category.id,
        clientId,
        title: title.trim(),
        description: description.trim(),
        operationalDefinition: description.trim(),
        baselineLevel: baselineLevel.trim(),
        requiredPrompts: requiredPrompts.trim(),
        status: resolvedStatus,
        targetType,
        phase: resolvedPhase,
        masteryCriteria,
        promptLevels: defaultPromptLevels(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
        synced: false,
      });
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
          dateMastered: resolvedMasteredDate,
          baseline: baselineLevel.trim() || null,
          notes: description.trim() || null,
          parentGoalId: skill.serverId ?? null,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.id) setTargetServerId(id, d.id);
        })
        .catch(() => {});
      toast.success("Goal created");
    }

    setSaving(false);
    onClose();
  }

  return (
    <ModalShell title={goal ? "Edit Goal" : "New Goal"} subtitle={`${category.name} / ${skill.name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="px-5 py-4 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Goal Title</label>
            <input autoFocus type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="field-input w-full" required />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input w-full resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Date Opened</label>
            <input type="date" value={dateOpened} onChange={(e) => setDateOpened(e.target.value)} className="field-input w-full" />
          </div>
          <div className="md:col-span-2 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Date Mastered</label>
            <input type="date" value={dateMastered} onChange={(e) => setDateMastered(e.target.value)} className="field-input w-full" />
          </div>
            <button
              type="button"
              onClick={() => {
                if (!confirm("Mark this goal as mastered and set Date Mastered to today?")) return;
                setLifecycle("mastered");
                setDateMastered(todayIso());
              }}
              className="btn-secondary h-11 rounded-xl px-4 text-sm"
            >
              Mark as Mastered
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Baseline Level</label>
            <input type="text" value={baselineLevel} onChange={(e) => setBaselineLevel(e.target.value)} className="field-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tracking Type</label>
            <select value={targetType} onChange={(e) => setTargetType(e.target.value as LocalTarget["targetType"])} className="field-input w-full">
              {TARGET_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Mastery Percentage</label>
            <input type="number" min={0} max={100} value={masteryPercentage} onChange={(e) => setMasteryPercentage(Number(e.target.value))} className="field-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Required Trials</label>
            <input type="number" min={1} value={requiredTrials} onChange={(e) => setRequiredTrials(Number(e.target.value))} className="field-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Required Prompts</label>
            <input type="text" value={requiredPrompts} onChange={(e) => setRequiredPrompts(e.target.value)} className="field-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Goal status</label>
            <select value={lifecycle} onChange={(e) => setLifecycle(e.target.value as GoalLifecycleKey)} className="field-input w-full">
              {GOAL_LIFECYCLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">{saving ? "Saving..." : goal ? "Save Goal" : "Create Goal"}</button>
          <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}

function GoalDetailView({
  category,
  skill,
  goal,
  onBack,
  onEdit,
  onOpenTarget,
}: {
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
  const statusLabel = lifecycleDisplayLabel(goal.phase);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 truncate">{category.name} / {skill?.name ?? "Unassigned Goals"}</p>
            <h3 className="font-bold text-[var(--foreground)] text-base truncate">{goal.title}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-colors">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={() => onOpenTarget(toPanelTarget(goal, "analytics"))}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
          >
            <BarChart2 className="h-3.5 w-3.5" /> View Data
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="glass-card rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-[var(--accent-cyan)]">{progress.pct !== null ? `${progress.pct}%` : "--"}</p>
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
          <p className="text-2xl font-bold text-zinc-200">{statusLabel}</p>
          <p className="text-xs text-zinc-500">Status</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs text-zinc-500 mb-1">Description</p><p className="text-sm text-zinc-200">{goal.description || goal.operationalDefinition || "No description yet"}</p></div>
          <div><p className="text-xs text-zinc-500 mb-1">Tracking Type</p><p className="text-sm text-zinc-200">{goal.targetType}</p></div>
          <div><p className="text-xs text-zinc-500 mb-1">Date Opened</p><p className="text-sm text-zinc-200">{goal.masteryCriteria.openedDate || "--"}</p></div>
          <div><p className="text-xs text-zinc-500 mb-1">Date Mastered</p><p className="text-sm text-zinc-200">{goal.masteryCriteria.masteredDate || "--"}</p></div>
          <div><p className="text-xs text-zinc-500 mb-1">Baseline Level</p><p className="text-sm text-zinc-200">{goal.baselineLevel || "--"}</p></div>
          <div><p className="text-xs text-zinc-500 mb-1">Required Prompts</p><p className="text-sm text-zinc-200">{goal.requiredPrompts || "--"}</p></div>
        </div>
        <div className="rounded-2xl border border-[var(--glass-border)] p-4 bg-[var(--glass-bg)]/30">
          <p className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-emerald-400" />
            Progress Summary
          </p>
          <div className="h-2 w-full rounded-full bg-[var(--glass-border)] overflow-hidden mb-2">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)]" style={{ width: `${Math.max(0, Math.min(progress.pct ?? 0, 100))}%` }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><p className="text-xs text-zinc-500 mb-1">Current Progress</p><p className="text-zinc-200">{progress.pct !== null ? `${progress.pct}%` : "No data yet"}</p></div>
            <div><p className="text-xs text-zinc-500 mb-1">Mastery Percentage</p><p className="text-zinc-200">{goal.masteryCriteria.percentage}%</p></div>
            <div><p className="text-xs text-zinc-500 mb-1">Required Trials</p><p className="text-zinc-200">{goal.masteryCriteria.minTrialsPerSession}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalActionsMenu({
  onEdit,
  onGraph,
  onRawData,
  onClone,
  onCopyToAnotherClient,
  onMove,
  onDelete,
  onSetLevel,
  onReopen,
  onAddToLibrary,
  onViewNotes,
  onSummary,
  canReopen,
}: {
  onEdit: () => void;
  onGraph: () => void;
  onRawData: () => void;
  onClone: () => void;
  onCopyToAnotherClient: () => void;
  onMove: () => void;
  onDelete: () => void;
  onSetLevel: () => void;
  onReopen: () => void;
  onAddToLibrary: () => void;
  onViewNotes: () => void;
  onSummary: () => void;
  canReopen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "Edit Details", onClick: onEdit },
    { label: "View Graph", onClick: onGraph },
    { label: "View Raw Data", onClick: onRawData },
    { label: "Clone Goal", onClick: onClone },
    { label: "Copy to Another Client", onClick: onCopyToAnotherClient },
    { label: "Move Goal", onClick: onMove },
    { label: "Delete Goal", onClick: onDelete, destructive: true },
    { label: "Set Level", onClick: onSetLevel },
    ...(canReopen ? [{ label: "Reopen Goal", onClick: onReopen }] : []),
    { label: "Add to Library", onClick: onAddToLibrary },
    { label: "View Notes", onClick: onViewNotes },
    { label: "Open Summary", onClick: onSummary },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-56 rounded-2xl border border-[var(--glass-border)] bg-[var(--background)]/95 p-2 shadow-2xl backdrop-blur">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full rounded-xl px-3 py-2 text-left text-xs transition-colors ${item.destructive ? "text-rose-300 hover:bg-rose-400/10" : "text-zinc-300 hover:bg-white/5"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const [editingCategory, setEditingCategory] = useState<LocalCategory | null>(null);
  const [editingSkill, setEditingSkill] = useState<LocalProgram | null>(null);
  const [editingGoal, setEditingGoal] = useState<LocalTarget | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const addTarget = useABAStore((s) => s.addTarget);
  const updateTarget = useABAStore((s) => s.updateTarget);
  const setTargetServerId = useABAStore((s) => s.setTargetServerId);
  const addCategory = useABAStore((s) => s.addCategory);
  const addProgram = useABAStore((s) => s.addProgram);
  const updateProgram = useABAStore((s) => s.updateProgram);
  const setCategoryServerId = useABAStore((s) => s.setCategoryServerId);

  // Select raw arrays (stable Zustand references) then filter via useMemo.
  // NEVER call .filter() inside a useABAStore selector — filter() always returns
  // a new array, Object.is comparison sees it as changed every render → infinite loop.
  const rawCategories = useABAStore((s) => s.categories);
  const rawPrograms = useABAStore((s) => s.programs);
  const rawTargets = useABAStore((s) => s.targets);

  const categories = useMemo(
    () => sortByCreatedAt((rawCategories ?? []).filter(isCategory).filter((c) => c.clientId === clientId)),
    [rawCategories, clientId],
  );
  const skills = useMemo(
    () => sortByCreatedAt((rawPrograms ?? []).filter(isSkill).filter((p) => p.clientId === clientId)),
    [rawPrograms, clientId],
  );
  const goals = useMemo(
    () => sortByCreatedAt((rawTargets ?? []).filter(isGoal).filter((t) => t.clientId === clientId && t.isActive !== false)),
    [rawTargets, clientId],
  );
  const { data: availableClients = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["programs-tab-clients"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/clients");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => setHydrated(true), []);

  // Sync server target IDs into Zustand so analytics work correctly even when
  // targets were created on another device / browser or before the local store
  // had a chance to receive the server ID back from the API call.
  useEffect(() => {
    fetch(`/smart-steps/api/clients/${clientId}/targets`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { groups?: Array<{ groupId: string; groupLabel: string; groupType: string; targets: Array<{ id: string; definition: string; targetType: string; phase: string }> }> } | null) => {
        if (!data?.groups) return;
        const storeTargets = useABAStore.getState().targets;
        for (const group of data.groups) {
          for (const st of group.targets) {
            if (storeTargets.some((t) => t.serverId === st.id)) continue;
            const match = storeTargets.find(
              (t) => t.clientId === clientId && !t.serverId &&
                (t.title ?? "").trim().toLowerCase() === (st.definition ?? "").trim().toLowerCase(),
            );
            if (match) {
              setTargetServerId(match.id, st.id);
            } else if (!storeTargets.some((t) => t.id === st.id)) {
              addTarget({
                id: st.id,
                serverId: st.id,
                clientId,
                title: st.definition,
                operationalDefinition: st.definition,
                targetType: st.targetType as LocalTarget["targetType"],
                phase: st.phase as LocalTarget["phase"],
                status: (st.phase === "MASTERED" ? "mastered" : st.phase === "NEW" ? "new" : "active") as LocalTarget["status"],
                // groupId is the ParentGoal id for "goal" groups (used as the local
                // skill-area/programId) and the Program id for "program" groups (used
                // as the local categoryId, with no skill area). Mapping these to the
                // wrong field leaves the target unmatched by the drill-down and makes
                // it invisible under its skill area/category.
                categoryId: group.groupType === "program" ? group.groupId : "",
                programId: group.groupType === "goal" ? group.groupId : "",
                masteryCriteria: defaultMastery(),
                promptLevels: defaultPromptLevels(),
                isActive: true,
                synced: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }
      })
      .catch(() => {});
  }, [clientId, setTargetServerId, addTarget]);

  // Cross-device hydration: populate categories (DB: Program) and skill areas
  // (DB: ParentGoal) + their direct targets from the server so that data created
  // on Computer A is visible on Computer B with a fresh localStorage.
  useEffect(() => {
    const now = new Date().toISOString();

    // 1. Fetch categories
    fetch(`/smart-steps/api/programs?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          programs: Array<{
            id: string;
            name: string;
            description?: string;
            createdAt?: string;
          }> | null,
        ) => {
          if (!programs) return;
          programs.forEach((p) => {
            // Fresh read each iteration so setCategoryServerId updates are visible.
            const current = useABAStore.getState().categories;
            // Already in store with this server id — nothing to do.
            if (current.some((c) => c.serverId === p.id || c.id === p.id)) return;
            // Existing local category with same name and no serverId yet — link it
            // instead of adding a duplicate.
            const unsyncedMatch = current.find(
              (c) =>
                !c.serverId &&
                c.clientId === clientId &&
                c.name.trim().toLowerCase() === p.name.trim().toLowerCase(),
            );
            if (unsyncedMatch) {
              setCategoryServerId(unsyncedMatch.id, p.id);
              return;
            }
            // New server category not in store at all — add it.
            addCategory({
              id: p.id,
              serverId: p.id,
              clientId,
              name: p.name,
              description: p.description ?? "",
              color: categoryColor(p.id),
              createdAt: p.createdAt ?? now,
              synced: true,
            });
          });
        },
      )
      .catch(() => {});

    // 2. Fetch skill areas (ParentGoals) and their direct targets
    fetch(`/smart-steps/api/clients/${clientId}/goals`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          serverGoals: Array<{
            id: string;
            title: string;
            description?: string | null;
            programId?: string | null;
            createdAt?: string;
            targets?: Array<{
              id: string;
              definition: string;
              targetType: string;
              phase: string;
              isActive: boolean;
              createdAt?: string;
              updatedAt?: string;
            }>;
          }> | null,
        ) => {
          if (!serverGoals) return;
          const { programs: storePrograms, targets: storeTargets, categories: storeCategories } = useABAStore.getState();
          for (const sg of serverGoals) {
            // Resolve the LOCAL category id for this skill area. Locally-created
            // categories keep a `local-…` id (with serverId set), so we must map the
            // server Program id (sg.programId) back to that local id — otherwise the
            // skill area/targets point at an id no category actually has.
            const serverCategoryId = sg.programId ?? "";
            const localCategory = serverCategoryId
              ? storeCategories.find((c) => c.serverId === serverCategoryId || c.id === serverCategoryId)
              : null;
            const categoryId = localCategory?.id ?? serverCategoryId;

            // Add skill area if not already present; otherwise repair a missing
            // category link (older hydration left orphaned skill areas invisible).
            const localSkill = storePrograms.find((p) => p.serverId === sg.id || p.id === sg.id);
            if (!localSkill) {
              addProgram({
                id: sg.id,
                serverId: sg.id,
                clientId,
                name: sg.title,
                description: sg.description ?? "",
                categoryId,
                createdAt: sg.createdAt ?? now,
                synced: true,
              });
            } else if (categoryId && !localSkill.categoryId) {
              updateProgram(localSkill.id, { categoryId });
            }
            // The local skill-area id targets must reference (falls back to sg.id when
            // the skill area was just added above with id === sg.id).
            const skillLocalId = localSkill?.id ?? sg.id;

            // Add targets under this skill area with correct hierarchy IDs
            for (const t of sg.targets ?? []) {
              if (!t.isActive) continue;
              const localTarget = storeTargets.find((lt) => lt.serverId === t.id || lt.id === t.id);
              if (localTarget) {
                // Repair goals that a previous hydration saved with an empty parent
                // id — an empty programId matches no skill area so the goal vanishes
                // from the drill-down. Only touch the broken (empty) case.
                if (!localTarget.programId) {
                  updateTarget(localTarget.id, {
                    programId: skillLocalId,
                    ...(categoryId ? { categoryId } : {}),
                  });
                }
                continue;
              }
              addTarget({
                id: t.id,
                serverId: t.id,
                clientId,
                title: t.definition,
                operationalDefinition: t.definition,
                targetType: t.targetType as LocalTarget["targetType"],
                phase: t.phase as LocalTarget["phase"],
                status: (
                  t.phase === "MASTERED" ? "mastered" : t.phase === "NEW" ? "new" : "active"
                ) as LocalTarget["status"],
                programId: skillLocalId,   // parent skill area id (local id / ParentGoal.id)
                categoryId,                // parent category id (local id / Program.id)
                masteryCriteria: defaultMastery(),
                promptLevels: defaultPromptLevels(),
                isActive: true,
                synced: true,
                createdAt: t.createdAt ?? now,
                updatedAt: t.updatedAt ?? now,
              });
            }
          }
        },
      )
      .catch(() => {});
  }, [clientId, addCategory, addProgram, updateProgram, addTarget, updateTarget, setCategoryServerId]);

  const selectedCategory = view.level !== "categories" ? categories.find((item) => item.id === view.categoryId) ?? null : null;
  const selectedSkill = view.level === "goals" || view.level === "goal" ? skills.find((item) => item.id === view.skillId) ?? null : null;
  const selectedGoal = view.level === "goal" ? goals.find((item) => item.id === view.goalId) ?? null : null;

  const categorySkills = useMemo(() => (selectedCategory ? skills.filter((item) => item.categoryId === selectedCategory.id) : []), [selectedCategory, skills]);
  const categoryGoals = useMemo(() => (selectedCategory ? goals.filter((item) => item.categoryId === selectedCategory.id) : []), [selectedCategory, goals]);
  const unassignedGoals = useMemo(() => categoryGoals.filter((item) => !item.programId), [categoryGoals]);

  const skillItems = useMemo<SkillItem[]>(() => {
    const items: SkillItem[] = categorySkills.map((skill) => {
      const relatedGoals = goals.filter((goal) => goal.programId === skill.id);
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        goalCount: relatedGoals.length,
        masteredCount: relatedGoals.filter((goal) => (goal.status ?? (goal.phase === "MASTERED" ? "mastered" : "active")) === "mastered").length,
        skill,
        isUnassigned: false,
      };
    });
    if (selectedCategory && unassignedGoals.length > 0) {
      items.push({
        id: `${UNASSIGNED_SKILL_PREFIX}${selectedCategory.id}`,
        name: "Unassigned Goals",
        description: "Existing goals not linked to a skill area yet",
        goalCount: unassignedGoals.length,
        masteredCount: unassignedGoals.filter((goal) => (goal.status ?? (goal.phase === "MASTERED" ? "mastered" : "active")) === "mastered").length,
        skill: null,
        isUnassigned: true,
      });
    }
    return items;
  }, [categorySkills, goals, selectedCategory, unassignedGoals]);

  const visibleGoals = useMemo(() => {
    if (view.level !== "goals" && view.level !== "goal") return [];
    if (isUnassignedSkillId(view.skillId)) return goals.filter((goal) => goal.categoryId === view.categoryId && !goal.programId);
    return goals.filter((goal) => goal.programId === view.skillId);
  }, [goals, view]);

  async function cloneGoal(goal: LocalTarget) {
    const id = makeId();
    const now = new Date().toISOString();
    const cloneTitle = `${goal.title} (Copy)`;
    addTarget({
      ...goal,
      id,
      title: cloneTitle,
      synced: false,
      createdAt: now,
      updatedAt: now,
      status: "active",
      phase: "ACQUISITION",
      masteryCriteria: {
        ...goal.masteryCriteria,
        masteredDate: null,
      },
    });
    try {
      const res = await fetch("/smart-steps/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition: cloneTitle,
          operationalDefinition: goal.description || goal.operationalDefinition,
          targetType: goal.targetType,
          phase: "ACQUISITION",
          masteryRule: {
            ...goal.masteryCriteria,
            masteredDate: null,
            status: "active",
            requiredPrompts: goal.requiredPrompts || null,
          },
          baseline: goal.baselineLevel || null,
          notes: goal.description || null,
          parentGoalId: (skills.find((skill) => skill.id === goal.programId)?.serverId) ?? null,
        }),
      });
      const data = await res.json();
      if (data?.id) setTargetServerId(id, data.id);
      toast.success("Goal cloned.");
    } catch {
      toast.error("Goal cloned locally. Server sync will retry later.");
    }
  }

  async function setGoalLevel(goal: LocalTarget) {
    const nextPhase = window.prompt("Set level / phase: BASELINE, ACQUISITION, MAINTENANCE, GENERALIZATION, MASTERED", goal.phase) || goal.phase;
    updateTarget(goal.id, { phase: nextPhase as LocalTarget["phase"], status: nextPhase === "MASTERED" ? "mastered" : "active" });
    if (goal.serverId) {
      await fetch(`/smart-steps/api/targets/${goal.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: nextPhase }),
      }).catch(() => {});
    }
    toast.success("Goal level updated.");
  }

  async function setGoalLifecycle(goal: LocalTarget, next: GoalLifecycleKey) {
    const phase = phaseFromLifecycle(next);
    const status = masteryRuleStatus(next);
    const masteredDate =
      next === "mastered"
        ? goal.masteryCriteria.masteredDate || todayIso()
        : goal.masteryCriteria.masteredDate;
    updateTarget(goal.id, {
      phase,
      status,
      masteryCriteria: { ...goal.masteryCriteria, masteredDate: masteredDate || null },
    });
    if (goal.serverId) {
      await fetch(`/smart-steps/api/targets/${goal.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase,
          dateMastered: next === "mastered" ? masteredDate : goal.masteryCriteria.masteredDate,
        }),
      }).catch(() => {});
    }
    toast.success(`Goal status → ${GOAL_LIFECYCLE_OPTIONS.find((o) => o.value === next)?.label ?? next}`);
  }

  async function reopenGoal(goal: LocalTarget) {
    updateTarget(goal.id, {
      phase: "ACQUISITION",
      status: "active",
      isActive: true,
    });
    if (goal.serverId) {
      await fetch(`/smart-steps/api/targets/${goal.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "ACQUISITION", isActive: true }),
      }).catch(() => {});
    }
    toast.success("Goal reopened. Historical mastery date preserved.");
  }

  async function addGoalToLibrary(goal: LocalTarget) {
    const res = await fetch("/smart-steps/api/target-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: goal.title,
        operationalDefinition: goal.operationalDefinition,
        targetType: goal.targetType,
        masteryRule: goal.masteryCriteria,
        promptHierarchy: goal.promptLevels.map((level) => level.name),
        baseline: goal.baselineLevel,
        notes: goal.description,
      }),
    }).catch(() => null);
    if (res?.ok) toast.success("Goal saved to library.");
    else toast.error("Unable to save goal to library.");
  }

  async function deleteGoal(goal: LocalTarget) {
    if (!confirm(`Delete ${goal.title}? This keeps history but hides the goal.`)) return;
    updateTarget(goal.id, { isActive: false });
    if (goal.serverId) {
      await fetch(`/smart-steps/api/targets/${goal.serverId}`, { method: "DELETE" }).catch(() => {});
    }
    toast.success("Goal deleted.");
  }

  async function moveGoal(goal: LocalTarget) {
    const options = skills.map((skill) => `${skill.id}: ${skill.name}`).join("\n");
    const destinationSkillId = window.prompt(`Move goal to skill area.\nEnter skill id:\n${options}`, goal.programId || "");
    if (!destinationSkillId) return;
    const destinationSkill = skills.find((skill) => skill.id === destinationSkillId);
    if (!destinationSkill) {
      toast.error("Skill area not found.");
      return;
    }
    updateTarget(goal.id, { programId: destinationSkill.id, categoryId: destinationSkill.categoryId });
    if (goal.serverId) {
      await fetch(`/smart-steps/api/targets/${goal.serverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentGoalId: destinationSkill.serverId ?? null }),
      }).catch(() => {});
    }
    toast.success("Goal moved.");
  }

  async function copyGoalToAnotherClient(goal: LocalTarget) {
    const clientOptions = availableClients.filter((item) => item.id !== clientId).map((item) => `${item.id}: ${item.name}`).join("\n");
    const destinationClientId = window.prompt(`Copy goal to another client.\nChoose client id:\n${clientOptions}`);
    if (!destinationClientId) return;
    const destinationGoalsRes = await fetch(`/smart-steps/api/clients/${destinationClientId}/goals`).catch(() => null);
    if (!destinationGoalsRes?.ok) {
      toast.error("Unable to load destination goals.");
      return;
    }
    const destinationGoals = await destinationGoalsRes.json();
    const destinationGoalId = window.prompt(
      `Enter destination goal/skill id:\n${(destinationGoals ?? []).map((item: { id: string; title: string }) => `${item.id}: ${item.title}`).join("\n")}`
    );
    if (!destinationGoalId) return;
    const res = await fetch("/smart-steps/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        definition: goal.title,
        operationalDefinition: goal.description || goal.operationalDefinition,
        targetType: goal.targetType,
        phase: "ACQUISITION",
        masteryRule: {
          ...goal.masteryCriteria,
          masteredDate: null,
          requiredPrompts: goal.requiredPrompts || null,
          status: "active",
        },
        baseline: goal.baselineLevel || null,
        notes: goal.description || null,
        parentGoalId: destinationGoalId,
      }),
    }).catch(() => null);
    if (res?.ok) toast.success("Goal copied to another client.");
    else toast.error("Unable to copy goal to another client.");
  }

  async function exportGoalsPdf(filter: GoalStatusFilter) {
    setExportOpen(false);
    setExporting(true);
    try {
      // Fetch authoritative goal data (masteryRule / prompts / phase) directly
      // from the server rather than the local store, so the export reflects the
      // saved record. This is read-only; nothing is mutated.
      const res = await fetch(`/smart-steps/api/clients/${clientId}/goals`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const mapTarget = (
        t: {
          id: string;
          definition: string;
          targetType: string;
          phase: string;
          masteryRule?: PrintableTarget["masteryRule"];
          promptHierarchy?: string[];
          baseline?: string | null;
        },
        subGoalTitle?: string | null,
      ): PrintableTarget => ({
        id: t.id,
        definition: t.definition,
        targetType: t.targetType,
        phase: t.phase,
        masteryRule: t.masteryRule ?? null,
        promptHierarchy: t.promptHierarchy ?? [],
        baseline: t.baseline ?? null,
        subGoalTitle: subGoalTitle ?? null,
      });
      const goals: PrintableGoal[] = (data ?? []).map(
        (g: {
          id: string;
          title: string;
          domain?: string | null;
          program?: { name?: string | null } | null;
          targets?: Parameters<typeof mapTarget>[0][];
          subGoals?: { title: string; targets?: Parameters<typeof mapTarget>[0][] }[];
        }) => ({
          id: g.id,
          title: g.title,
          domain: g.domain ?? null,
          programName: g.program?.name ?? null,
          targets: [
            ...((g.targets ?? []).map((t) => mapTarget(t))),
            ...((g.subGoals ?? []).flatMap((sg) => (sg.targets ?? []).map((t) => mapTarget(t, sg.title)))),
          ],
        }),
      );
      const clientName = availableClients.find((c) => c.id === clientId)?.name ?? "Client";
      const ok = printGoals(goals, clientName, filter);
      if (!ok) toast.error("Pop-up blocked — allow pop-ups and try again.");
    } catch {
      toast.error("Could not load goals for export.");
    } finally {
      setExporting(false);
    }
  }

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
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500 flex-wrap">
        <button type="button" onClick={() => setView({ level: "categories" })} className="hover:text-[var(--accent-cyan)] transition-colors">Goals &amp; Targets</button>
        {selectedCategory && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <button type="button" onClick={() => setView({ level: "skills", categoryId: selectedCategory.id })} className="hover:text-[var(--accent-cyan)] transition-colors">
              {selectedCategory.name}
            </button>
          </>
        )}
        {(view.level === "goals" || view.level === "goal") && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <button type="button" onClick={() => selectedCategory && setView({ level: "goals", categoryId: selectedCategory.id, skillId: view.skillId })} className="hover:text-[var(--accent-cyan)] transition-colors">
              {isUnassignedSkillId(view.skillId) ? "Unassigned Goals" : selectedSkill?.name ?? "Goals"}
            </button>
          </>
        )}
        {view.level === "goal" && selectedGoal && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="text-zinc-300">{selectedGoal.title}</span>
          </>
        )}
      </div>

      {view.level === "categories" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-[var(--foreground)] text-base">Goals &amp; Targets</h3>
              <p className="text-xs text-zinc-500">{categories.length} categories</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  disabled={exporting}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-[var(--foreground)] hover:border-[var(--accent-cyan)]/40 transition-colors disabled:opacity-60"
                >
                  <Printer className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export PDF"}
                </button>
                {exportOpen && (
                  <div className="absolute right-0 top-11 z-20 w-52 rounded-2xl border border-[var(--glass-border)] bg-[var(--background)]/95 p-2 shadow-2xl backdrop-blur">
                    <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Export goals</p>
                    <button
                      type="button"
                      onClick={() => void exportGoalsPdf("IN_TREATMENT")}
                      className="flex w-full rounded-xl px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                      In Treatment only
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportGoalsPdf("ALL")}
                      className="flex w-full rounded-xl px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 transition-colors"
                    >
                      All statuses
                    </button>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => { setEditingCategory(null); setShowCategoryModal(true); }} className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Category
              </button>
            </div>
          </div>
          {categories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
              <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400 font-semibold mb-1">No categories yet</p>
              <p className="text-zinc-600 text-sm mb-5 max-w-xs mx-auto">Create a category first, then click into it to add skill areas and goals.</p>
              <button type="button" onClick={() => { setEditingCategory(null); setShowCategoryModal(true); }} className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)]">
                <Plus className="h-4 w-4" /> Create First Category
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map((category) => {
                const skillCount = skills.filter((item) => item.categoryId === category.id).length;
                const goalCount = goals.filter((item) => item.categoryId === category.id).length;
                return (
                  <button key={category.id} type="button" onClick={() => setView({ level: "skills", categoryId: category.id })} className="w-full glass-card rounded-2xl border border-[var(--glass-border)] p-4 text-left hover:border-[var(--accent-cyan)]/40 hover:bg-white/[0.02] transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: category.color ?? "#06b6d4" }}>
                        {(category.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--foreground)] text-sm">{category.name}</p>
                        <p className="text-xs text-zinc-500">{skillCount} skill areas · {goalCount} goals</p>
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditingCategory(category); setShowCategoryModal(true); }} className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view.level === "skills" && selectedCategory && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button type="button" onClick={() => setView({ level: "categories" })} className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h3 className="font-bold text-[var(--foreground)] text-base truncate">{selectedCategory.name}</h3>
                <p className="text-xs text-zinc-500">{skillItems.length} skill areas</p>
              </div>
            </div>
            <button type="button" onClick={() => { setEditingSkill(null); setShowSkillModal(true); }} className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Skill Area
            </button>
          </div>
          {skillItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
              <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400 font-semibold mb-1">No skill areas yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {skillItems.map((item) => (
                <button key={item.id} type="button" onClick={() => setView({ level: "goals", categoryId: selectedCategory.id, skillId: item.id })} className="w-full glass-card rounded-2xl border border-[var(--glass-border)] p-4 text-left hover:border-[var(--accent-purple)]/40 hover:bg-white/[0.02] transition-all cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center shrink-0"><Layers className="h-5 w-5 text-[var(--accent-purple)]" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--foreground)] text-sm">{item.name}</p>
                      <p className="text-xs text-zinc-500">{item.goalCount} goals · {item.masteredCount} mastered</p>
                    </div>
                    {!item.isUnassigned && item.skill && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditingSkill(item.skill); setShowSkillModal(true); }} className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view.level === "goals" && selectedCategory && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button type="button" onClick={() => setView({ level: "skills", categoryId: selectedCategory.id })} className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h3 className="font-bold text-[var(--foreground)] text-base truncate">{isUnassignedSkillId(view.skillId) ? "Unassigned Goals" : selectedSkill?.name ?? "Goals"}</h3>
                <p className="text-xs text-zinc-500">{visibleGoals.length} goals</p>
              </div>
            </div>
            {!isUnassignedSkillId(view.skillId) && selectedSkill && (
              <button type="button" onClick={() => { setEditingGoal(null); setShowGoalModal(true); }} className="flex items-center gap-1.5 rounded-xl border border-[var(--accent-pink)]/40 bg-[var(--accent-pink)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/20 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Goal
              </button>
            )}
          </div>
          {visibleGoals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
              <TargetIcon className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400 font-semibold mb-1">No goals yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGoals.map((goal) => {
                const lifecycle = lifecycleFromPhase(goal.phase);
                const cardBorder = isNewPhase(goal.phase)
                  ? "border-amber-400/45 hover:border-amber-400/60 bg-amber-400/[0.04]"
                  : isMasteredPhase(goal.phase)
                    ? "border-emerald-400/30 hover:border-emerald-400/45 bg-emerald-400/[0.03]"
                    : "border-[var(--glass-border)] hover:border-[var(--accent-cyan)]/40";
                return (
                  <button key={goal.id} type="button" onClick={() => onOpenTarget(toPanelTarget(goal, "analytics"))} className={`w-full glass-card rounded-2xl border p-4 text-left hover:bg-white/[0.02] transition-all cursor-pointer ${cardBorder}`}>
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isNewPhase(goal.phase) ? "bg-amber-400/15" : isMasteredPhase(goal.phase) ? "bg-emerald-400/10" : "bg-[var(--accent-cyan)]/10"}`}>
                        {isNewPhase(goal.phase) ? <Lightbulb className="h-5 w-5 text-amber-300" /> : <TargetIcon className={`h-5 w-5 ${isMasteredPhase(goal.phase) ? "text-emerald-300" : "text-[var(--accent-cyan)]"}`} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <p className="font-semibold text-[var(--foreground)] text-sm">{goal.title}</p>
                          <GoalLifecycleBadge phase={goal.phase} />
                        </div>
                        <p className="text-xs text-zinc-500">{lifecycleDisplayLabel(goal.phase)} · mastery {goal.masteryCriteria.percentage}% · trials {goal.masteryCriteria.minTrialsPerSession}</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 shrink-0">
                        <select
                          value={lifecycle}
                          onChange={(e) => { void setGoalLifecycle(goal, e.target.value as GoalLifecycleKey); }}
                          className="rounded-lg border border-[var(--glass-border)] bg-[var(--background)] px-2 py-1.5 text-xs text-zinc-300"
                          aria-label="Goal status"
                        >
                          {GOAL_LIFECYCLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <GoalActionsMenu
                          onEdit={() => { setEditingGoal(goal); setShowGoalModal(true); }}
                          onGraph={() => onOpenTarget(toPanelTarget(goal, "analytics"))}
                          onRawData={() => onOpenTarget(toPanelTarget(goal, "rawData"))}
                          onClone={() => { void cloneGoal(goal); }}
                          onCopyToAnotherClient={() => { void copyGoalToAnotherClient(goal); }}
                          onMove={() => { void moveGoal(goal); }}
                          onDelete={() => { void deleteGoal(goal); }}
                          onSetLevel={() => { void setGoalLevel(goal); }}
                          onReopen={() => { void reopenGoal(goal); }}
                          onAddToLibrary={() => { void addGoalToLibrary(goal); }}
                          onViewNotes={() => onOpenTarget(toPanelTarget(goal, "notes"))}
                          onSummary={() => setView({ level: "goal", categoryId: selectedCategory.id, skillId: view.skillId, goalId: goal.id })}
                          canReopen={goal.phase === "MASTERED" || goal.isActive === false}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view.level === "goal" && selectedCategory && selectedGoal && (
        <GoalDetailView
          category={selectedCategory}
          skill={selectedSkill}
          goal={selectedGoal}
          onBack={() => setView({ level: "goals", categoryId: view.categoryId, skillId: view.skillId })}
          onEdit={() => { setEditingGoal(selectedGoal); setShowGoalModal(true); }}
          onOpenTarget={onOpenTarget}
        />
      )}

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
    </div>
  );
}
