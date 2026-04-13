"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, BookOpen, Archive, CheckCircle, Circle } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

type Program = {
  id: string;
  clientId: string;
  name: string;
  domain: string;
  description?: string;
  isActive: boolean;
  targetCount: number;
  masteredCount: number;
};

const DOMAIN_COLORS: Record<string, string> = {
  Mand: "text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10",
  Tact: "text-[var(--accent-purple)] bg-[var(--accent-purple)]/10",
  Intraverbal: "text-[var(--accent-pink)] bg-[var(--accent-pink)]/10",
  Social: "text-emerald-400 bg-emerald-400/10",
  ADL: "text-amber-400 bg-amber-400/10",
  Academic: "text-blue-400 bg-blue-400/10",
  Echoic: "text-rose-400 bg-rose-400/10",
  Other: "text-zinc-400 bg-zinc-400/10",
};

function domainColor(domain: string) {
  return DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.Other;
}

export default function ProgramsPage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const qc = useQueryClient();
  const { data: sessionData } = useSession();
  const role = (sessionData?.user as { role?: string })?.role;
  const canEdit = role === "BCBA" || role === "ADMIN";

  const { data: programs = [], isLoading } = useQuery<Program[]>({
    queryKey: ["programs", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/programs?clientId=${clientId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId,
  });

  const archiveMutation = useMutation({
    mutationFn: async (programId: string) => {
      const res = await fetch(`/smart-steps/api/programs/${programId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programs", clientId] });
      toast.success("Program archived.");
    },
    onError: () => toast.error("Failed to archive program."),
  });

  return (
    <div className="p-6 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <Link
            href={`/clients/${clientId}`}
            className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Goals &amp; Targets</h1>
            <p className="text-sm text-zinc-500">{programs.length} active program{programs.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        {canEdit && (
          <Link
            href={`/clients/${clientId}/programs/new`}
            className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5"
          >
            <Plus className="h-4 w-4" />
            + Program
          </Link>
        )}
      </motion.div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-zinc-600" />
          <p className="font-medium text-zinc-400">No programs yet</p>
          <p className="text-sm text-zinc-600">Create programs (e.g. Communication, Manding) to organize goals and targets.</p>
          {canEdit && (
            <Link
              href={`/clients/${clientId}/programs/new`}
              className="btn-primary mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm"
            >
              <Plus className="h-4 w-4" />
              + Program
            </Link>
          )}
        </div>
      ) : (
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.04 } }, hidden: {} }}
        >
          {programs.map((p) => (
            <motion.div
              key={p.id}
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            >
              <Link href={`/clients/${clientId}/programs/${p.id}`} className="block">
                <motion.div
                  whileHover={{ y: -1 }}
                  className="glass-card flex items-center gap-4 rounded-2xl p-4 hover:shadow-[var(--glow-cyan)] transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[var(--foreground)]">{p.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${domainColor(p.domain)}`}>
                        {p.domain}
                      </span>
                      {!p.isActive && (
                        <span className="rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-zinc-400">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Circle className="h-3 w-3" />
                        {p.targetCount} targets
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle className="h-3 w-3" />
                        {p.masteredCount} mastered
                      </span>
                    </div>
                    {/* Mastery progress bar */}
                    <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--glass-border)]">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] transition-all"
                        style={{ width: `${p.targetCount > 0 ? (p.masteredCount / p.targetCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        archiveMutation.mutate(p.id);
                      }}
                      className="tap-target rounded-xl p-2 text-zinc-600 hover:text-[var(--accent-pink)]"
                      title="Archive program"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
