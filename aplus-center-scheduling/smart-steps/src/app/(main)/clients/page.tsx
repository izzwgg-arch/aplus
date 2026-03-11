"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

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
};

async function fetchClients(): Promise<ClientCard[]> {
  const res = await fetch("/api/clients");
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: fetchClients,
  });

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Clients</h1>
        <p className="text-zinc-500">Your caseload at a glance</p>
      </motion.div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card skeleton h-44 w-full max-w-sm rounded-2xl" />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05 } },
            hidden: {},
          }}
        >
          {clients.map((c) => (
            <motion.div key={c.id} variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
              <Link href={`/clients/${c.id}`} className="block">
                <motion.article
                  className="glass-card overflow-hidden transition-shadow hover:shadow-[var(--glow-cyan)]"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex gap-4 p-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--glass-border)]">
                      {c.photoUrl ? (
                        <img src={c.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-[var(--accent-cyan)]">
                          {c.name.slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-[var(--foreground)]">{c.name}</h3>
                      <p className="text-xs text-zinc-500">Age {c.age}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.diagnosis.map((d) => (
                          <span
                            key={d}
                            className="rounded-full bg-[var(--accent-purple)]/20 px-2 py-0.5 text-xs text-[var(--accent-purple)]"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        {c.assignedRbt && `RBT: ${c.assignedRbt}`}
                        {c.assignedBcba && ` · BCBA: ${c.assignedBcba}`}
                      </p>
                      <p className="text-xs text-zinc-500">Last: {c.lastSession ?? "—"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-bold text-[var(--accent-cyan)]">{c.progressPct}%</div>
                      <div className="text-xs text-zinc-500">progress</div>
                    </div>
                  </div>
                </motion.article>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
