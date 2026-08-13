"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Plus, Search, Star, X, Pencil, Copy, ToggleLeft, ToggleRight,
  Trash2, Save, ChevronDown, ChevronUp, Tag, Layers,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface LibraryItem {
  id: string;
  title: string;
  operationalDefinition: string | null;
  targetType: string;
  baseline: string | null;
  notes: string | null;
  category: string | null;
  skillArea: string | null;
  domain: string | null;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  isFavoriteForUser?: boolean;
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  DISCRETE_TRIAL:          "DTT",
  TASK_ANALYSIS_FWD:       "Task Analysis (Fwd)",
  TASK_ANALYSIS_BWD:       "Task Analysis (Bwd)",
  TASK_ANALYSIS_TOTAL:     "Task Analysis (Total)",
  DURATION:                "Duration",
  LATENCY:                 "Latency",
  FREQUENCY:               "Frequency",
  PARTIAL_INTERVAL:        "Partial Interval",
  WHOLE_INTERVAL:          "Whole Interval",
  MOMENTARY_TIME_SAMPLE:   "MTS",
  COLD_PROBE:              "Cold Probe",
  OTHER:                   "Other",
};

const TARGET_TYPES = Object.entries(TARGET_TYPE_LABELS);

const CATEGORY_PRESETS = [
  "Language & Communication", "Social Skills", "Manding (Requesting)",
  "Tacting (Labeling)", "Intraverbal", "Self-Care / Daily Living",
  "Fine Motor Skills", "Gross Motor Skills", "Academic / Pre-Academic",
  "Behavior Reduction", "Play & Leisure", "Cognitive Skills",
  "Executive Functioning", "Adaptive Behavior", "Parent Training",
];

/* ─── Item Form Modal ────────────────────────────────────────────────────── */

interface ItemFormProps {
  initial?: Partial<LibraryItem>;
  onClose: () => void;
  onSaved: (item: LibraryItem) => void;
}

function ItemFormModal({ initial, onClose, onSaved }: ItemFormProps) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    title:                 initial?.title                 ?? "",
    operationalDefinition: initial?.operationalDefinition ?? "",
    targetType:            initial?.targetType            ?? "DISCRETE_TRIAL",
    baseline:              initial?.baseline              ?? "",
    notes:                 initial?.notes                 ?? "",
    category:              initial?.category              ?? "",
    skillArea:             initial?.skillArea             ?? "",
    domain:                initial?.domain                ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [showCatPresets, setShowCatPresets] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    setSaving(true);

    try {
      const url    = isEdit ? `/smart-steps/api/goal-library/${initial!.id}` : "/smart-steps/api/goal-library";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:                 form.title.trim(),
          operationalDefinition: form.operationalDefinition.trim() || null,
          targetType:            form.targetType,
          baseline:              form.baseline.trim() || null,
          notes:                 form.notes.trim() || null,
          category:              form.category.trim() || null,
          skillArea:             form.skillArea.trim() || null,
          domain:                form.domain.trim() || null,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      const saved: LibraryItem = await res.json();
      toast.success(isEdit ? "Template updated ✓" : "Template created ✓");
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        className="glass-card w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl border border-[var(--glass-border)] flex flex-col max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--glass-border)] shrink-0">
          <h2 className="font-bold text-[var(--foreground)] flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--accent-cyan)]" />
            {isEdit ? "Edit Goal Template" : "New Goal Template"}
          </h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Goal Title <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              autoFocus required type="text"
              value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Will follow one-step directions independently"
              className="field-input w-full"
            />
          </div>

          {/* Operational Definition */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Operational Definition
            </label>
            <textarea
              rows={3} value={form.operationalDefinition}
              onChange={(e) => setForm((p) => ({ ...p, operationalDefinition: e.target.value }))}
              placeholder="Observable, measurable definition…"
              className="field-input w-full resize-none"
            />
          </div>

          {/* Target Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Target Type</label>
            <select
              value={form.targetType}
              onChange={(e) => setForm((p) => ({ ...p, targetType: e.target.value }))}
              className="field-input w-full"
            >
              {TARGET_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-zinc-300">Category</label>
              <button type="button" onClick={() => setShowCatPresets((v) => !v)}
                className="text-xs text-[var(--accent-cyan)] hover:underline flex items-center gap-1">
                Presets {showCatPresets ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
            <input
              type="text" value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              placeholder="e.g. Language & Communication"
              className="field-input w-full"
            />
            <AnimatePresence>
              {showCatPresets && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden">
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {CATEGORY_PRESETS.map((p) => (
                      <button key={p} type="button"
                        onClick={() => { setForm((f) => ({ ...f, category: p })); setShowCatPresets(false); }}
                        className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors">
                        {p}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Skill Area + Domain */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Skill Area</label>
              <input type="text" value={form.skillArea}
                onChange={(e) => setForm((p) => ({ ...p, skillArea: e.target.value }))}
                placeholder="e.g. Listening Skills"
                className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Domain</label>
              <input type="text" value={form.domain}
                onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))}
                placeholder="e.g. Communication"
                className="field-input w-full" />
            </div>
          </div>

          {/* Baseline */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Baseline (optional)</label>
            <input type="text" value={form.baseline}
              onChange={(e) => setForm((p) => ({ ...p, baseline: e.target.value }))}
              placeholder="e.g. 0% correct across 3 sessions"
              className="field-input w-full" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Notes (optional)</label>
            <textarea rows={2} value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Clinical notes, implementation tips…"
              className="field-input w-full resize-none" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 sticky bottom-0 bg-[var(--glass-bg)] -mx-5 px-5 py-3 border-t border-[var(--glass-border)]">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60 flex items-center justify-center gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : isEdit ? "Update Template" : "Create Template"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Library Item Card ──────────────────────────────────────────────────── */

function LibraryItemCard({
  item,
  canWrite,
  onEdit,
  onClone,
  onToggleActive,
  onDelete,
  onToggleFavorite,
}: {
  item: LibraryItem;
  canWrite: boolean;
  onEdit: () => void;
  onClone: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <motion.div layout
      className={`glass-card rounded-2xl border p-4 transition-colors ${
        item.isActive ? "border-[var(--glass-border)]" : "border-zinc-700/40 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-[var(--foreground)] text-sm truncate">{item.title}</p>
            {item.isFavoriteForUser && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />}
          </div>

          {item.operationalDefinition && (
            <p className="text-xs text-zinc-500 line-clamp-2 mb-2">{item.operationalDefinition}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {item.category && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/20 px-2 py-0.5 text-xs">
                <Layers className="h-2.5 w-2.5" /> {item.category}
              </span>
            )}
            {item.skillArea && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border border-[var(--accent-purple)]/20 px-2 py-0.5 text-xs">
                <Tag className="h-2.5 w-2.5" /> {item.skillArea}
              </span>
            )}
            <span className="rounded-full bg-[var(--glass-border)]/60 px-2 py-0.5 text-xs text-zinc-500">
              {TARGET_TYPE_LABELS[item.targetType] ?? item.targetType}
            </span>
            {item.usageCount > 0 && (
              <span className="rounded-full bg-[var(--glass-border)]/60 px-2 py-0.5 text-xs text-zinc-500">
                used {item.usageCount}×
              </span>
            )}
            {!item.isActive && (
              <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-xs text-zinc-500">Inactive</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onToggleFavorite}
            className={`rounded-lg p-1.5 transition-colors ${
              item.isFavoriteForUser
                ? "text-amber-400 hover:text-amber-300"
                : "text-zinc-600 hover:text-amber-400"
            }`}
            title={item.isFavoriteForUser ? "Remove favorite" : "Add to favorites"}
          >
            <Star className={`h-4 w-4 ${item.isFavoriteForUser ? "fill-amber-400" : ""}`} />
          </button>
          {canWrite && (
            <>
              <button type="button" onClick={onEdit}
                className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
                title="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={onClone}
                className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/10 transition-colors"
                title="Clone">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={onToggleActive}
                className="rounded-lg p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                title={item.isActive ? "Deactivate" : "Reactivate"}>
                {item.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              </button>
              <button type="button" onClick={onDelete}
                className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/10 transition-colors"
                title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function GoalLibraryPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canWrite = userRole === "ADMIN" || userRole === "BCBA";
  const [items,        setItems]        = useState<LibraryItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [editItem,     setEditItem]     = useState<LibraryItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)       params.set("q",        search);
      if (showInactive) params.set("isActive", "false");
      const res  = await fetch(`/smart-steps/api/goal-library?${params}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load Goal Library");
    } finally {
      setLoading(false);
    }
  }, [search, showInactive]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  async function handleClone(item: LibraryItem) {
    try {
      const res = await fetch(`/smart-steps/api/goal-library/${item.id}/clone`, { method: "POST" });
      if (!res.ok) throw new Error();
      const clone: LibraryItem = await res.json();
      setItems((prev) => [clone, ...prev]);
      toast.success(`"${clone.title}" cloned ✓`);
    } catch {
      toast.error("Failed to clone template");
    }
  }

  async function handleToggleActive(item: LibraryItem) {
    try {
      const res = await fetch(`/smart-steps/api/goal-library/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) throw new Error();
      const updated: LibraryItem = await res.json();
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, ...updated } : i));
      toast.success(updated.isActive ? "Template reactivated" : "Template deactivated");
    } catch {
      toast.error("Failed to update template");
    }
  }

  async function handleDelete(item: LibraryItem) {
    if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/smart-steps/api/goal-library/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Template deleted");
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleToggleFavorite(item: LibraryItem) {
    const wasFav = item.isFavoriteForUser;
    setItems((prev) => prev.map((i) =>
      i.id === item.id ? { ...i, isFavoriteForUser: !wasFav } : i
    ));
    try {
      const method = wasFav ? "DELETE" : "POST";
      await fetch(`/smart-steps/api/goal-library/${item.id}/favorite`, { method });
    } catch {
      // Revert on failure
      setItems((prev) => prev.map((i) =>
        i.id === item.id ? { ...i, isFavoriteForUser: wasFav } : i
      ));
      toast.error("Failed to update favorite");
    }
  }

  const displayed = showInactive
    ? items
    : items.filter((i) => i.isActive);

  const favorites   = displayed.filter((i) => i.isFavoriteForUser);
  const nonFavorites = displayed.filter((i) => !i.isFavoriteForUser);

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-[var(--accent-cyan)]" />
              Goal Library
            </h1>
            <p className="text-zinc-500 mt-1 text-sm">
              {items.filter((i) => i.isActive).length} active template{items.filter((i) => i.isActive).length !== 1 ? "s" : ""}
              {" · "}Reusable across all clients
            </p>
          </div>
          {canWrite && (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => { setEditItem(null); setShowForm(true); }}
              className="tap-target flex items-center gap-2 rounded-xl bg-[var(--accent-cyan)]/20 border border-[var(--accent-cyan)]/40 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Template
            </motion.button>
          )}
        </div>

        {/* Search + filter */}
        <div className="mt-5 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="search" placeholder="Search by title, category, skill area, domain…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="field-input w-full pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
              showInactive
                ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                : "border-[var(--glass-border)] text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {showInactive ? "Hiding active only" : "Show inactive"}
          </button>
        </div>
      </motion.div>

      {/* Items */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 glass-card animate-pulse rounded-2xl" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-20 text-center">
          <BookOpen className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 font-semibold mb-1">
            {search ? "No templates match your search" : "No goal templates yet"}
          </p>
          <p className="text-zinc-600 text-sm mb-5">
            {search ? "Try a different keyword" : "Create reusable goal templates to speed up your workflow"}
          </p>
          {!search && canWrite && (
            <button
              type="button"
              onClick={() => { setEditItem(null); setShowForm(true); }}
              className="tap-target inline-flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)]"
            >
              <Plus className="h-4 w-4" /> Create First Template
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {favorites.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
                <Star className="h-3.5 w-3.5 fill-amber-400" /> Favorites
              </h2>
              <div className="space-y-3">
                {favorites.map((item) => (
                  <LibraryItemCard
                    key={item.id}
                    item={item}
                    canWrite={canWrite}
                    onEdit={() => { setEditItem(item); setShowForm(true); }}
                    onClone={() => handleClone(item)}
                    onToggleActive={() => handleToggleActive(item)}
                    onDelete={() => handleDelete(item)}
                    onToggleFavorite={() => handleToggleFavorite(item)}
                  />
                ))}
              </div>
            </section>
          )}

          {nonFavorites.length > 0 && (
            <section>
              {favorites.length > 0 && (
                <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">
                  All Templates
                </h2>
              )}
              <div className="space-y-3">
                {nonFavorites.map((item) => (
                  <LibraryItemCard
                    key={item.id}
                    item={item}
                    canWrite={canWrite}
                    onEdit={() => { setEditItem(item); setShowForm(true); }}
                    onClone={() => handleClone(item)}
                    onToggleActive={() => handleToggleActive(item)}
                    onDelete={() => handleDelete(item)}
                    onToggleFavorite={() => handleToggleFavorite(item)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Form modal — only accessible to ADMIN/BCBA */}
      <AnimatePresence>
        {showForm && canWrite && (
          <ItemFormModal
            initial={editItem ?? undefined}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSaved={(saved) => {
              setItems((prev) => {
                const idx = prev.findIndex((i) => i.id === saved.id);
                return idx >= 0 ? prev.map((i) => i.id === saved.id ? saved : i) : [saved, ...prev];
              });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
