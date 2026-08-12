"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target, Plus, Users, ChevronRight, Search, Layers,
  CheckCircle2, BarChart2, Zap, BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  useABAStore,
  defaultMastery,
  defaultPromptLevels,
  type LocalCategory,
  type LocalTarget,
  sortByCreatedAt,
  categoryColor,
  CATEGORY_COLOR_PALETTE,
} from "@/store/abaStore";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type ClientSummary = {
  id: string;
  name: string;
  photoUrl?: string | null;
  age: number;
  diagnosis: string[];
  progressPct: number;
  isArchived: boolean;
};

const CATEGORY_PRESETS = [
  { name: "Language & Communication", color: "#06b6d4" },
  { name: "Social Skills", color: "#a855f7" },
  { name: "Manding (Requesting)", color: "#f59e0b" },
  { name: "Tacting (Labeling)", color: "#10b981" },
  { name: "Intraverbal", color: "#3b82f6" },
  { name: "Self-Care / Daily Living", color: "#ec4899" },
  { name: "Fine Motor Skills", color: "#f97316" },
  { name: "Gross Motor Skills", color: "#8b5cf6" },
  { name: "Academic / Pre-Academic", color: "#14b8a6" },
  { name: "Behavior Reduction", color: "#ef4444" },
];

function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ─── Quick Category Create (global — picks a client) ───────────────────── */

function QuickCategoryModal({
  clients,
  onClose,
}: {
  clients: ClientSummary[];
  onClose: () => void;
}) {
  const addCategory = useABAStore((s) => s.addCategory);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_PRESETS[0].color);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientId) return;
    setSaving(true);

    const id = localId();
    const now = new Date().toISOString();
    addCategory({ id, clientId, name: name.trim(), color, createdAt: now, synced: false });

    try {
      await fetch("/smart-steps/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name: name.trim(), domain: name.trim() }),
      });
    } catch { /* offline */ }

    toast.success(`Category "${name}" created ✓`);
    setSaving(false);
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
        <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
          <Layers className="h-5 w-5 text-[var(--accent-cyan)]" />
          + Category (Skill Area)
        </h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="field-input w-full"
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">Skill area name</label>
            <input
              autoFocus required type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Language & Communication"
              className="field-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-2">Quick presets</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_PRESETS.map((p) => (
                <button
                  key={p.name} type="button"
                  onClick={() => { setName(p.name); setColor(p.color); }}
                  className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORY_COLOR_PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-xl transition-all ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[var(--background)] scale-110" : "hover:scale-105"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Creating…" : "Create Category"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Quick Goal Create (global — picks client + category) ──────────────── */

function QuickGoalModal({
  clients,
  onClose,
}: {
  clients: ClientSummary[];
  onClose: () => void;
}) {
  const addProgram = useABAStore((s) => s.addProgram);
  const addTarget = useABAStore((s) => s.addTarget);
  const storeCategories = useABAStore((s) => s.categories);

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [newCatName, setNewCatName] = useState("");
  const [selectedCatId, setSelectedCatId] = useState<string>("__new");
  const [programName, setProgramName] = useState("");
  const [targetTitle, setTargetTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const clientCats = useMemo(
    () => sortByCreatedAt(storeCategories.filter((c) => c.clientId === clientId)),
    [storeCategories, clientId],
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!programName.trim() && !targetTitle.trim()) {
      toast.error("Fill in at least a program name or target title");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();

    // Create or use category
    let catId = selectedCatId;
    if (selectedCatId === "__new") {
      if (!newCatName.trim()) { toast.error("Enter a category name"); setSaving(false); return; }
      catId = localId();
      useABAStore.getState().addCategory({
        id: catId, clientId, name: newCatName.trim(),
        color: categoryColor(catId), createdAt: now, synced: false,
      });
    }

    // Create program
    const progId = localId();
    if (programName.trim()) {
      addProgram({ id: progId, categoryId: catId, clientId, name: programName.trim(), createdAt: now, synced: false });
    }

    // Create target if given
    if (targetTitle.trim()) {
      addTarget({
        id: localId(), programId: progId, categoryId: catId, clientId,
        title: targetTitle.trim(), operationalDefinition: "",
        targetType: "DISCRETE_TRIAL", phase: "NEW",
        masteryCriteria: defaultMastery(), promptLevels: defaultPromptLevels(),
        isActive: true, createdAt: now, updatedAt: now, synced: false,
      });
    }

    toast.success("Created! Go to client's Goals & Targets to add full details.");
    setSaving(false);
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
        <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
          <Target className="h-5 w-5 text-[var(--accent-purple)]" />
          + New Goals and Targets
        </h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">Client</label>
            <select
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setSelectedCatId("__new"); }}
              className="field-input w-full" required
            >
              {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">Skill Area / Category</label>
            <select
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
              className="field-input w-full"
            >
              <option value="__new">+ Create new category</option>
              {clientCats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            {selectedCatId === "__new" && (
              <input
                type="text" value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Language & Communication"
                className="field-input w-full mt-2"
              />
            )}
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">Program / Goal name</label>
            <input
              type="text" value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              placeholder="e.g. Listening Skills"
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-300 mb-1.5">First target (optional)</label>
            <input
              type="text" value={targetTitle}
              onChange={(e) => setTargetTitle(e.target.value)}
              placeholder="e.g. Responds to name when called"
              className="field-input w-full"
            />
            <p className="text-xs text-zinc-500 mt-1">
              You can add full mastery criteria on the client&apos;s Goals &amp; Targets page.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-xl py-3 font-bold disabled:opacity-60">
              {saving ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary rounded-xl px-5 py-3">Cancel</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ─── Client Goal Card ───────────────────────────────────────────────────── */

function ClientGoalCard({ client, storeTargets, storeCategories }: {
  client: ClientSummary;
  storeTargets: LocalTarget[];
  storeCategories: LocalCategory[];
}) {
  const clientTargets = storeTargets.filter((t) => t.clientId === client.id && t.isActive);
  const clientCats = useMemo(
    () => sortByCreatedAt(storeCategories.filter((c) => c.clientId === client.id)),
    [storeCategories, client.id],
  );
  const mastered = clientTargets.filter((t) => t.phase === "MASTERED").length;
  const active = clientTargets.filter((t) => t.phase === "ACQUISITION").length;
  const newGoals = clientTargets.filter((t) => t.phase === "NEW").length;
  const pct = clientTargets.length > 0 ? Math.round((mastered / clientTargets.length) * 100) : 0;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass-card rounded-2xl border border-[var(--glass-border)] hover:border-[var(--accent-cyan)]/40 transition-colors overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-cyan)]/20 to-[var(--accent-purple)]/20 text-lg font-bold text-[var(--accent-cyan)]">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-[var(--foreground)]">{client.name}</p>
              <p className="text-xs text-zinc-500">Age {client.age ?? "—"}</p>
            </div>
          </div>
          {clientTargets.length > 0 && (
            <span className="text-sm font-bold text-[var(--accent-cyan)]">{pct}%</span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="rounded-lg bg-[var(--glass-border)]/30 py-2">
            <p className="text-sm font-bold text-[var(--foreground)]">{clientCats.length}</p>
            <p className="text-xs text-zinc-600">areas</p>
          </div>
          <div className="rounded-lg bg-amber-400/10 py-2">
            <p className="text-sm font-bold text-amber-300">{newGoals}</p>
            <p className="text-xs text-zinc-600">new</p>
          </div>
          <div className="rounded-lg bg-[var(--accent-cyan)]/10 py-2">
            <p className="text-sm font-bold text-[var(--accent-cyan)]">{active}</p>
            <p className="text-xs text-zinc-600">in treatment</p>
          </div>
          <div className="rounded-lg bg-emerald-400/10 py-2">
            <p className="text-sm font-bold text-emerald-400">{mastered}</p>
            <p className="text-xs text-zinc-600">mastered</p>
          </div>
        </div>

        {/* Progress bar */}
        {clientTargets.length > 0 && (
          <div className="mb-4">
            <div className="h-1.5 w-full rounded-full bg-[var(--glass-border)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">{mastered}/{clientTargets.length} targets mastered</p>
          </div>
        )}

        {/* Category pills */}
        {clientCats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {clientCats.slice(0, 4).map((cat) => (
              <span
                key={cat.id}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: `${cat.color ?? categoryColor(cat.serverId ?? cat.id)}20`, color: cat.color ?? categoryColor(cat.serverId ?? cat.id) }}
              >
                {cat.name}
              </span>
            ))}
            {clientCats.length > 4 && (
              <span className="rounded-full px-2.5 py-0.5 text-xs text-zinc-500 bg-[var(--glass-border)]/50">
                +{clientCats.length - 4} more
              </span>
            )}
          </div>
        )}

        {clientTargets.length === 0 && (
          <p className="text-xs text-zinc-600 mb-4">No targets yet — click to add goals</p>
        )}
      </div>

      <Link
        href={`/clients/${client.id}/goals`}
        className="flex items-center justify-center gap-2 border-t border-[var(--glass-border)] px-5 py-3 text-sm font-medium text-zinc-400 hover:bg-[var(--accent-cyan)]/5 hover:text-[var(--accent-cyan)] transition-colors"
      >
        <BookOpen className="h-4 w-4" />
        Open Goals & Targets
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </motion.div>
  );
}

/* ─── Page Content (uses searchParams) ──────────────────────────────────── */

function GoalsAndTargetsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const action = searchParams.get("action");

  const [showCategoryModal, setShowCategoryModal] = useState(action === "new-category");
  const [showGoalModal, setShowGoalModal] = useState(action === "new-goal");
  const [search, setSearch] = useState("");

  // Handle sidebar shortcut actions
  useEffect(() => {
    if (action === "new-category") {
      setShowCategoryModal(true);
      router.replace("/goals-and-targets");
    } else if (action === "new-goal") {
      setShowGoalModal(true);
      router.replace("/goals-and-targets");
    }
  }, [action, router]);

  const storeTargets = useABAStore((s) => s.targets);
  const storeCategories = useABAStore((s) => s.categories);

  const { data: clients = [], isLoading } = useQuery<ClientSummary[]>({
    queryKey: ["clients-active"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/clients?limit=100");
      if (!res.ok) return [];
      const data = await res.json();
      return (data.clients ?? data ?? []).filter((c: ClientSummary) => !c.isArchived);
    },
    staleTime: 60_000,
  });

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Global stats
  const totalTargets = storeTargets.filter((t) => t.isActive).length;
  const masteredTargets = storeTargets.filter((t) => t.phase === "MASTERED").length;
  const activeTargets = storeTargets.filter((t) => t.phase === "ACQUISITION").length;
  const totalCategories = storeCategories.length;

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Goals &amp; Targets</h1>
            <p className="text-zinc-500 mt-1">
              {clients.length} client{clients.length !== 1 ? "s" : ""} · {totalCategories} skill areas · {totalTargets} targets
            </p>
          </div>
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="tap-target flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
            >
              <Layers className="h-4 w-4" />
              + Category
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => setShowGoalModal(true)}
              className="tap-target flex items-center gap-2 rounded-xl border border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/10 px-5 py-2.5 text-sm font-semibold text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 transition-colors"
            >
              <Target className="h-4 w-4" />
              + New Goals and Targets
            </motion.button>
          </div>
        </div>

        {/* Global stats */}
        {totalTargets > 0 && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Targets", value: totalTargets, icon: Target, color: "var(--foreground)" },
              { label: "In Acquisition", value: activeTargets, icon: Zap, color: "var(--accent-cyan)" },
              { label: "Mastered", value: masteredTargets, icon: CheckCircle2, color: "#34d399" },
              { label: "Skill Areas", value: totalCategories, icon: BarChart2, color: "var(--accent-purple)" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="glass-card rounded-2xl p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-current/10 shrink-0"
                    style={{ color: s.color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-zinc-500">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Search */}
      {clients.length > 4 && (
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="search" placeholder="Search clients…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="field-input w-full pl-9"
          />
        </div>
      )}

      {/* Client cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-[var(--glass-bg)] animate-pulse" />
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-20 text-center">
          <Users className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 font-semibold">
            {search ? "No clients match your search" : "No active clients"}
          </p>
          <Link href="/clients/new" className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--accent-cyan)] hover:underline">
            <Plus className="h-4 w-4" /> Add a client
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <ClientGoalCard
              key={client.id}
              client={client}
              storeTargets={storeTargets}
              storeCategories={storeCategories}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCategoryModal && (
          <QuickCategoryModal
            clients={clients}
            onClose={() => setShowCategoryModal(false)}
          />
        )}
        {showGoalModal && (
          <QuickGoalModal
            clients={clients}
            onClose={() => setShowGoalModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Page (wrapped in Suspense for useSearchParams) ────────────────────── */

export default function GoalsAndTargetsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-zinc-500">Loading…</div>}>
      <GoalsAndTargetsContent />
    </Suspense>
  );
}
