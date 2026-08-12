"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Search, Archive } from "lucide-react";
import { toast } from "sonner";

type ClientCard = {
  id: string;
  name: string;
  photoUrl?: string | null;
  dob: string;
  age: number;
  diagnosis: string[];
  assignedRbt?: string;
  assignedBcba?: string;
  lastSession?: string;
  progressPct: number;
  isArchived: boolean;
};

function ClientCardItem({ c }: { c: ClientCard }) {
  return (
    <Link href={`/clients/${c.id}`} className="block">
      <motion.article
        className="glass-card overflow-hidden transition-shadow hover:shadow-[var(--glow-cyan)]"
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex gap-4 p-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--glass-border)] flex items-center justify-center text-2xl font-bold text-[var(--accent-cyan)]">
            {c.photoUrl ? (
              <img src={c.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              c.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-[var(--foreground)]">{c.name}</h3>
            <p className="text-xs text-zinc-500">Age {c.age} · DOB {new Date(c.dob + "T00:00:00").toLocaleDateString()}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {c.diagnosis.map((d) => (
                <span key={d} className="rounded-full bg-[var(--accent-purple)]/20 px-2 py-0.5 text-xs text-[var(--accent-purple)]">
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {c.assignedRbt && `RBT: ${c.assignedRbt}`}
              {c.assignedBcba && ` · BCBA: ${c.assignedBcba}`}
            </p>
            {c.lastSession && <p className="text-xs text-zinc-500">Last session: {c.lastSession}</p>}
          </div>
        </div>
      </motion.article>
    </Link>
  );
}

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const qc = useQueryClient();

  const { data: clients = [], isLoading, error } = useQuery<ClientCard[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter((c) => {
      if (!showArchived && c.isArchived) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.diagnosis.some((d) => d.toLowerCase().includes(q)) ||
        c.assignedRbt?.toLowerCase().includes(q) ||
        c.assignedBcba?.toLowerCase().includes(q)
      );
    });
  }, [clients, search, showArchived]);

  const archivedCount = clients.filter((c) => c.isArchived).length;

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Clients</h1>
          <p className="text-zinc-500 text-sm">{clients.filter((c) => !c.isArchived).length} active client{clients.filter((c) => !c.isArchived).length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/clients/new"
          className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New client
        </Link>
      </motion.div>

      {error && (
        <div className="mb-6 rounded-2xl border border-[var(--accent-pink)]/30 bg-[var(--accent-pink)]/10 p-4 text-sm text-[var(--accent-pink)]">
          Failed to load clients. Please check your database connection.
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            placeholder="Search by name, diagnosis, therapist…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] py-2.5 pl-9 pr-4 text-sm text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20"
          />
        </div>
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2.5 text-xs text-zinc-400 hover:text-[var(--foreground)] transition-colors"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Hide" : "Show"} archived ({archivedCount})
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-32 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
          {clients.length === 0 ? (
            <>
              <p className="text-zinc-400 font-medium mb-1">No clients yet</p>
              <p className="text-zinc-600 text-sm mb-4">Create your first client to get started</p>
              <Link href="/clients/new" className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
                <Plus className="h-4 w-4" /> Add first client
              </Link>
            </>
          ) : (
            <p className="text-zinc-500">No clients match your search</p>
          )}
        </div>
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.04 } }, hidden: {} }}
        >
          {filtered.map((c) => (
            <motion.div key={c.id} variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
              <ClientCardItem c={c} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
