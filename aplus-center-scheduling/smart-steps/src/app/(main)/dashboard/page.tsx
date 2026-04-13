"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Search, Calendar, Target, Users, ClipboardList, ChevronRight } from "lucide-react";

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

type DashboardStats = {
  sessionsToday: number;
  totalClients: number;
  activeTargets: number;
  assessmentsInProgress: number;
  recentSessions: Array<{
    id: string;
    clientId: string;
    clientName: string;
    therapistName: string | null;
    startedAt: string;
    trialCount: number;
  }>;
};

export default function DashboardPage() {
  const [search, setSearch] = useState("");

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: clients = [], isLoading } = useQuery<ClientCard[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/clients");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter((c) => {
      if (c.isArchived) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.diagnosis.some((d) => d.toLowerCase().includes(q)) ||
        c.assignedRbt?.toLowerCase().includes(q) ||
        c.assignedBcba?.toLowerCase().includes(q)
      );
    });
  }, [clients, search]);

  const activeClients = clients.filter((c) => !c.isArchived);

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Dashboard</h1>
        <p className="text-zinc-500 text-sm">Your Smart Steps command center</p>
      </motion.div>

      {/* Real stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {[
          {
            icon: Calendar,
            label: "Sessions today",
            value: stats ? String(stats.sessionsToday) : "—",
            color: "var(--accent-cyan)",
            sub: stats?.sessionsToday === 0 ? "None recorded yet" : undefined,
          },
          {
            icon: Users,
            label: "Active clients",
            value: stats ? String(stats.totalClients) : "—",
            color: "var(--accent-purple)",
          },
          {
            icon: Target,
            label: "Active targets",
            value: stats ? String(stats.activeTargets) : "—",
            color: "var(--accent-pink)",
          },
          {
            icon: ClipboardList,
            label: "Assessments in progress",
            value: stats ? String(stats.assessmentsInProgress) : "—",
            color: "#34d399",
          },
        ].map((stat) => (
          <div key={stat.label} className="glass-card flex items-center gap-4 rounded-2xl p-4">
            <div className="rounded-xl p-3 shrink-0" style={{ background: `color-mix(in srgb, ${stat.color} 15%, transparent)` }}>
              <stat.icon className="h-6 w-6" style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[var(--foreground)]">{stat.value}</p>
              <p className="text-xs text-zinc-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Recent sessions */}
      {stats?.recentSessions && stats.recentSessions.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="mb-8"
        >
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Recent sessions</h2>
          <div className="glass-card rounded-2xl overflow-hidden">
            {stats.recentSessions.map((s, i) => (
              <Link
                key={s.id}
                href={`/clients/${s.clientId}?tab=sessions`}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.04] ${i < stats.recentSessions.length - 1 ? "border-b border-[var(--glass-border)]" : ""}`}
              >
                <div className="h-2 w-2 rounded-full bg-[var(--accent-cyan)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[var(--foreground)] text-sm">{s.clientName}</span>
                  {s.therapistName && <span className="text-zinc-500 text-xs ml-2">· {s.therapistName}</span>}
                </div>
                <span className="text-xs text-zinc-600">{s.trialCount} trial{s.trialCount !== 1 ? "s" : ""}</span>
                <span className="text-xs text-zinc-500">{new Date(s.startedAt).toLocaleDateString()}</span>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-700 shrink-0" />
              </Link>
            ))}
          </div>
        </motion.section>
      )}

      {/* Client directory */}
      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Client directory</h2>
            {activeClients.length === 0 && !isLoading && (
              <p className="text-sm text-zinc-500">No clients yet — add your first client to get started</p>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] py-2.5 pl-9 pr-4 text-sm text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20 sm:w-56"
              />
            </div>
            <Link
              href="/clients/new"
              className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              New
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-32 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-12 text-center">
            {activeClients.length === 0 ? (
              <div>
                <p className="text-zinc-400 mb-3">Start by adding your first client</p>
                <Link href="/clients/new" className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
                  <Plus className="h-4 w-4" /> Add client
                </Link>
              </div>
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
                <Link href={`/clients/${c.id}`} className="block">
                  <motion.article
                    className="glass-card overflow-hidden transition-shadow hover:shadow-[var(--glow-cyan)]"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex gap-4 p-4">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--glass-border)] flex items-center justify-center text-2xl font-bold text-[var(--accent-cyan)]">
                        {c.photoUrl
                          ? <img src={c.photoUrl} alt="" className="h-full w-full object-cover" />
                          : c.name.slice(0, 1).toUpperCase()
                        }
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-[var(--foreground)]">{c.name}</h3>
                        <p className="text-xs text-zinc-500">Age {c.age}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.diagnosis.map((d) => (
                            <span key={d} className="rounded-full bg-[var(--accent-purple)]/20 px-2 py-0.5 text-xs text-[var(--accent-purple)]">{d}</span>
                          ))}
                        </div>
                        {c.lastSession && <p className="text-xs text-zinc-500 mt-0.5">Last session: {c.lastSession}</p>}
                      </div>
                    </div>
                  </motion.article>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}
