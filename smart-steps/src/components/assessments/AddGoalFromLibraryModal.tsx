"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Search, Star, X } from "lucide-react";
import { toast } from "sonner";
import { REPORT_CATEGORY_OPTIONS } from "@/lib/reportGenerationUtils";
import type { GoalRow, GoalTableKind } from "@/lib/reportGoalTables";
import { replaceClientNamePlaceholders } from "@/lib/sanitizeHtml";

/**
 * Picks a goal (or a whole skill area) out of the Goal Library and drops it
 * into an assessment report's goal table.
 *
 * A goal added here is a real goal: it is written into the child's Category ->
 * Skill Area -> Goal hierarchy via /api/clients/[clientId]/goal-library-import,
 * so it shows up in their Goals & Targets tab and a BT can take data on it —
 * the report row and the treatment program never drift apart. Parent-training
 * rows are the exception: those objectives belong to the caregivers, so the
 * "add to Goals & Targets" switch defaults OFF on that table.
 */

const NEW_VALUE = "__new__";
const CUSTOM_ITEM = "__custom__";

type LibraryGoal = {
  id: string;
  title: string;
  operationalDefinition: string | null;
  targetType: string;
  masteryRule: unknown;
  promptHierarchy: string[];
  baseline: string | null;
  notes: string | null;
  category: string | null;
  skillArea: string | null;
  domain: string | null;
  usageCount: number;
  isFavoriteForUser?: boolean;
};

type LibraryParentGoal = {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  category: string | null;
  skillArea: string | null;
  notes: string | null;
  usageCount: number;
  isFavoriteForUser?: boolean;
};

type ClientCategory = { id: string; name: string };
type ClientSkillArea = { id: string; title: string; programId?: string | null };

/** A category choice carries both the DB program name and the table heading. */
type CategoryOption = { value: string; name: string; heading: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** "2026-08-24" -> "08/24/2026", matching formatDate() in the generated tables. */
function toTableDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}

/** Title Case for a fixed category so a new DB Program is not named IN CAPS. */
function titleCase(label: string): string {
  return label
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, "and");
}

export default function AddGoalFromLibraryModal({
  clientId,
  clientName,
  kind,
  sectionTitle,
  onClose,
  onAdded,
}: {
  clientId: string;
  clientName: string;
  kind: GoalTableKind;
  sectionTitle: string;
  onClose: () => void;
  onAdded: (row: GoalRow) => void;
}) {
  const isMasteredTable = kind === "mastered_goals";
  const isParentTable = kind === "parent_goals";

  const [itemType, setItemType] = useState<"GOAL" | "PARENT_GOAL">("GOAL");
  const [goals, setGoals] = useState<LibraryGoal[]>([]);
  const [parentGoals, setParentGoals] = useState<LibraryParentGoal[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const [categories, setCategories] = useState<ClientCategory[]>([]);
  const [skillAreas, setSkillAreas] = useState<ClientSkillArea[]>([]);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const [title, setTitle] = useState("");
  const [operationalDefinition, setOperationalDefinition] = useState("");
  const [categoryValue, setCategoryValue] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [skillAreaValue, setSkillAreaValue] = useState("");
  const [newSkillArea, setNewSkillArea] = useState("");
  const [dateValue, setDateValue] = useState(todayIso());
  const [comments, setComments] = useState("");
  const [addToProgram, setAddToProgram] = useState(!isParentTable);
  const [saving, setSaving] = useState(false);

  // ── Library + this client's existing hierarchy ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const url =
      itemType === "GOAL" ? "/smart-steps/api/goal-library" : "/smart-steps/api/parent-goal-library";

    async function loadLibrary() {
      setLoadingLibrary(true);
      setLibraryError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "You do not have access to the goal library."
              : "Could not load the goal library.",
          );
        }
        const data = await res.json();
        if (cancelled) return;
        if (itemType === "GOAL") setGoals(Array.isArray(data) ? data : []);
        else setParentGoals(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setLibraryError((err as Error).message);
      } finally {
        if (!cancelled) setLoadingLibrary(false);
      }
    }

    void loadLibrary();
    return () => {
      cancelled = true;
    };
  }, [itemType]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/smart-steps/api/programs?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ClientCategory[]) => {
        if (!cancelled && Array.isArray(data)) setCategories(data);
      })
      .catch(() => {});
    fetch(`/smart-steps/api/clients/${clientId}/goals`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ClientSkillArea[]) => {
        if (!cancelled && Array.isArray(data)) setSkillAreas(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // ── Options ───────────────────────────────────────────────────────────────
  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const seen = new Set<string>();
    const out: CategoryOption[] = [];
    for (const c of categories) {
      const key = c.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ value: c.name, name: c.name, heading: c.name.toUpperCase() });
    }
    for (const c of REPORT_CATEGORY_OPTIONS) {
      const name = titleCase(c.tableLabel);
      const key = name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ value: name, name, heading: c.tableLabel });
    }
    return out;
  }, [categories]);

  const filteredGoals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g) =>
      [g.title, g.operationalDefinition, g.category, g.skillArea, g.domain, g.notes]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [goals, query]);

  const filteredParentGoals = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parentGoals;
    return parentGoals.filter((g) =>
      [g.title, g.description, g.category, g.skillArea, g.domain, g.notes]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [parentGoals, query]);

  /** Library items grouped into <optgroup>s by their own category/domain. */
  const groupedOptions = useMemo(() => {
    const source: { id: string; title: string; group: string; fav: boolean }[] =
      itemType === "GOAL"
        ? filteredGoals.map((g) => ({
            id: g.id,
            title: g.title,
            group: g.category || g.domain || "Uncategorised",
            fav: Boolean(g.isFavoriteForUser),
          }))
        : filteredParentGoals.map((g) => ({
            id: g.id,
            title: g.title,
            group: g.category || g.domain || "Uncategorised",
            fav: Boolean(g.isFavoriteForUser),
          }));
    const map = new Map<string, typeof source>();
    for (const item of source) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [itemType, filteredGoals, filteredParentGoals]);

  // ── Selection -> form ─────────────────────────────────────────────────────
  function applySelection(id: string) {
    setSelectedId(id);
    if (!id || id === CUSTOM_ITEM) {
      setTitle("");
      setOperationalDefinition("");
      return;
    }
    if (itemType === "GOAL") {
      const item = goals.find((g) => g.id === id);
      if (!item) return;
      setTitle(replaceClientNamePlaceholders(item.title, clientName));
      setOperationalDefinition(
        replaceClientNamePlaceholders(item.operationalDefinition ?? item.baseline ?? "", clientName),
      );
      if (item.skillArea) preselectSkillArea(item.skillArea);
      if (item.category || item.domain) preselectCategory(item.category || item.domain || "");
    } else {
      const item = parentGoals.find((g) => g.id === id);
      if (!item) return;
      setTitle(replaceClientNamePlaceholders(item.title, clientName));
      setOperationalDefinition(replaceClientNamePlaceholders(item.description ?? "", clientName));
      if (item.category || item.domain) preselectCategory(item.category || item.domain || "");
    }
  }

  /** Reuses the child's existing skill area when the names match, else stages a new one. */
  function preselectSkillArea(name: string) {
    const existing = skillAreas.find((s) => s.title.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      setSkillAreaValue(existing.title);
      setNewSkillArea("");
    } else {
      setSkillAreaValue(NEW_VALUE);
      setNewSkillArea(name);
    }
  }

  function preselectCategory(name: string) {
    const existing = categoryOptions.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      setCategoryValue(existing.value);
      setNewCategory("");
    } else {
      setCategoryValue(NEW_VALUE);
      setNewCategory(name);
    }
  }

  // ── Resolved values ───────────────────────────────────────────────────────
  const resolvedCategory = categoryValue === NEW_VALUE ? newCategory.trim() : categoryValue.trim();
  const resolvedCategoryHeading =
    categoryValue === NEW_VALUE
      ? newCategory.trim().toUpperCase()
      : categoryOptions.find((c) => c.value === categoryValue)?.heading ?? "";
  const resolvedSkillArea =
    itemType === "PARENT_GOAL"
      ? title.trim()
      : skillAreaValue === NEW_VALUE
        ? newSkillArea.trim()
        : skillAreaValue.trim();
  const skillAreaIsNew =
    Boolean(resolvedSkillArea) &&
    !skillAreas.some((s) => s.title.trim().toLowerCase() === resolvedSkillArea.toLowerCase());

  const canSubmit = Boolean(title.trim()) && Boolean(resolvedSkillArea) && !saving;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(itemType === "GOAL" ? "Pick or type a goal." : "Pick or type a skill area.");
      return;
    }
    if (!resolvedSkillArea) {
      toast.error("Choose the skill area this goal belongs under.");
      return;
    }
    setSaving(true);

    let importSummary = "";
    if (addToProgram) {
      try {
        const libraryItemId = selectedId && selectedId !== CUSTOM_ITEM ? selectedId : null;
        const res = await fetch(`/smart-steps/api/clients/${clientId}/goal-library-import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemType,
            libraryItemId,
            category: resolvedCategory || null,
            skillArea: resolvedSkillArea,
            title: title.trim(),
            operationalDefinition: operationalDefinition.trim() || null,
            description: itemType === "PARENT_GOAL" ? operationalDefinition.trim() || null : null,
            domain: resolvedCategory || null,
            startDate: isMasteredTable ? null : dateValue || null,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "Could not add this to the client's Goals & Targets.");
          setSaving(false);
          return;
        }
        const bits: string[] = [];
        if (data?.created?.category) bits.push("new category");
        if (data?.created?.skillArea) bits.push("new skill area");
        if (data?.duplicate) bits.push("already existed");
        importSummary = bits.length ? ` (${bits.join(", ")})` : "";
      } catch {
        toast.error("Could not reach the server — nothing was added.");
        setSaving(false);
        return;
      }
    }

    const row: GoalRow = {
      skillArea: resolvedSkillArea,
      objective: itemType === "PARENT_GOAL" ? operationalDefinition.trim() || title.trim() : title.trim(),
      startDate: isMasteredTable ? "" : dateValue ? toTableDate(dateValue) : "TBD",
      baseline: operationalDefinition.trim() || "Low",
      currentLevel: "",
      dateMastered: isMasteredTable && dateValue ? toTableDate(dateValue) : "",
      comments: comments.trim(),
      categoryLabel: resolvedCategoryHeading || undefined,
    };

    onAdded(row);
    toast.success(
      addToProgram
        ? `Added to the report and to ${clientName}'s Goals & Targets${importSummary}.`
        : "Added to the report.",
    );
    setSaving(false);
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8 }}
        className="glass-card flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-[var(--accent-cyan)]/40 p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--foreground)]">
              <BookOpen className="h-4 w-4 text-[var(--accent-cyan)]" />
              Add a goal from the library
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {clientName} · {sectionTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {/* What kind of library item */}
          <div className="flex gap-2">
            {(
              [
                { value: "GOAL", label: "Goal" },
                { value: "PARENT_GOAL", label: "Skill area (parent goal)" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setItemType(opt.value);
                  setSelectedId("");
                  setTitle("");
                  setOperationalDefinition("");
                }}
                className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
                  itemType === opt.value
                    ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
                    : "border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Search + dropdown */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {itemType === "GOAL" ? "Goal Library" : "Parent Goal Library"}
            </label>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter the list…"
                className="field-input w-full pl-9"
              />
            </div>
            <select
              className="field-input w-full"
              value={selectedId}
              onChange={(e) => applySelection(e.target.value)}
              disabled={loadingLibrary || Boolean(libraryError)}
            >
              <option value="">
                {loadingLibrary
                  ? "Loading library…"
                  : libraryError
                    ? libraryError
                    : groupedOptions.length === 0
                      ? "No matching library items"
                      : "Select from the library…"}
              </option>
              {groupedOptions.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.fav ? "★ " : ""}
                      {item.title}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={CUSTOM_ITEM}>Not in the library — type it below</option>
            </select>
            {!loadingLibrary && !libraryError && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> marks your favourites.
                Placeholders like (Client) become {clientName}.
              </p>
            )}
          </div>

          {/* Text */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {itemType === "GOAL" ? "Goal *" : "Skill area *"}
            </label>
            <textarea
              rows={2}
              className="field-input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={itemType === "GOAL" ? "e.g. Will mand for 10 preferred items" : "e.g. Expressive Language"}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {itemType === "GOAL" ? "Operational definition" : "Description"}
            </label>
            <textarea
              rows={2}
              className="field-input w-full"
              value={operationalDefinition}
              onChange={(e) => setOperationalDefinition(e.target.value)}
              placeholder="Optional — shown in the Baseline Level column."
            />
          </div>

          {/* Where it lives */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Category
              </label>
              <select
                className="field-input w-full"
                value={categoryValue}
                onChange={(e) => setCategoryValue(e.target.value)}
              >
                <option value="">No category</option>
                {categoryOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.name}
                  </option>
                ))}
                <option value={NEW_VALUE}>New category…</option>
              </select>
              {categoryValue === NEW_VALUE && (
                <input
                  type="text"
                  className="field-input mt-2 w-full"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                />
              )}
            </div>

            {itemType === "GOAL" && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Skill area *
                </label>
                <select
                  className="field-input w-full"
                  value={skillAreaValue}
                  onChange={(e) => setSkillAreaValue(e.target.value)}
                >
                  <option value="">Choose a skill area…</option>
                  {skillAreas.map((s) => (
                    <option key={s.id} value={s.title}>
                      {s.title}
                    </option>
                  ))}
                  <option value={NEW_VALUE}>New skill area…</option>
                </select>
                {skillAreaValue === NEW_VALUE && (
                  <input
                    type="text"
                    className="field-input mt-2 w-full"
                    value={newSkillArea}
                    onChange={(e) => setNewSkillArea(e.target.value)}
                    placeholder="New skill area name"
                  />
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {isMasteredTable ? "Date mastered" : "Start date"}
              </label>
              <input
                type="date"
                className="field-input w-full"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Comments
              </label>
              <input
                type="text"
                className="field-input w-full"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Create it for real */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--glass-border)] p-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={addToProgram}
              onChange={(e) => setAddToProgram(e.target.checked)}
            />
            <span className="text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">
                Also add to {clientName}&apos;s Goals &amp; Targets
              </span>
              <br />
              {resolvedSkillArea ? (
                <>
                  Files it under <span className="text-zinc-300">{resolvedSkillArea}</span>
                  {skillAreaIsNew && <span className="text-[var(--accent-cyan)]"> (new skill area)</span>}
                  {resolvedCategory && (
                    <>
                      {" "}
                      in <span className="text-zinc-300">{resolvedCategory}</span>
                    </>
                  )}
                  , ready for data collection.
                </>
              ) : (
                <>Choose a skill area to file it under.</>
              )}
              {isParentTable && (
                <>
                  {" "}
                  Parent-training objectives usually stay in the report only.
                </>
              )}
            </span>
          </label>

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1 rounded-xl py-2.5 text-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 rounded-xl py-2.5 text-sm" disabled={!canSubmit}>
              {saving ? "Adding…" : "Add to report"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
