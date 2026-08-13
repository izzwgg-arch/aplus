"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, ChevronRight, CheckCircle, Clock, Target, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { evaluateMastery } from "@/lib/masteryEngine";

type TargetRow = {
  id: string;
  programId: string;
  definition: string;
  targetType: string;
  phase: string;
  masteryRule: Record<string, unknown> | null;
  masteryEval: ReturnType<typeof evaluateMastery> | null;
  trialCount: number;
};

const PHASE_COLORS: Record<string, string> = {
  BASELINE: "text-zinc-400 bg-zinc-700/40",
  ACQUISITION: "text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10",
  FLUENCY: "text-[var(--accent-purple)] bg-[var(--accent-purple)]/10",
  MAINTENANCE: "text-emerald-400 bg-emerald-400/10",
  GENERALIZATION: "text-amber-400 bg-amber-400/10",
  MASTERED: "text-emerald-400 bg-emerald-500/20",
};

const TARGET_TYPES = [
  { value: "DISCRETE_TRIAL", label: "Discrete Trial (DTT)" },
  { value: "TASK_ANALYSIS_CHAIN_FWD", label: "Task Analysis — Forward Chain" },
  { value: "TASK_ANALYSIS_CHAIN_BWD", label: "Task Analysis — Backward Chain" },
  { value: "TASK_ANALYSIS_CHAIN_TOTAL", label: "Task Analysis — Total Task" },
  { value: "COLD_PROBE", label: "Cold Probe" },
  { value: "GEN_PROBE", label: "Generalization Probe" },
];

export default function ProgramDetailPage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const programId = String(params.programId ?? "");
  const router = useRouter();
  const qc = useQueryClient();
  const { data: sessionData } = useSession();
  const role = (sessionData?.user as { role?: string })?.role;
  const canEdit = role === "BCBA" || role === "ADMIN";

  const [showAddTarget, setShowAddTarget] = useState(false);
  const [newDef, setNewDef] = useState("");
  const [newType, setNewType] = useState("DISCRETE_TRIAL");
  const [addingTarget, setAddingTarget] = useState(false);

  const { data: program } = useQuery({
    queryKey: ["program", programId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/programs/${programId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: targets = [], isLoading } = useQuery<TargetRow[]>({
    queryKey: ["targets", programId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/programs/${programId}/targets`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!programId,
  });

  const addTargetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/smart-steps/api/programs/${programId}/targets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: newDef.trim(), targetType: newType }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["targets", programId] });
      toast.success("Target added.");
      setNewDef("");
      setShowAddTarget(false);
    },
    onError: () => toast.error("Failed to add target."),
  });

  const advancePhaseMutation = useMutation({
    mutationFn: async ({ targetId, phase }: { targetId: string; phase: string }) => {
      const res = await fetch(`/smart-steps/api/targets/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["targets", programId] });
      toast.success("Phase updated!");
    },
    onError: () => toast.error("Failed to update phase."),
  });

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Link
            href={`/clients/${clientId}/programs`}
            className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {program?.name ?? "Program"}
            </h1>
            <p className="text-sm text-zinc-500">{program?.domain ?? ""}</p>
          </div>
        </div>
      </motion.div>

      {/* Add target form */}
      {canEdit && (
        <div className="mb-6">
          <AnimatePresence>
            {!showAddTarget ? (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                type="button"
                onClick={() => setShowAddTarget(true)}
                className="tap-target inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-2.5 text-sm text-zinc-400 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)]"
              >
                <Plus className="h-4 w-4" />
                Add target
              </motion.button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="glass-card rounded-2xl p-5 space-y-4"
              >
                <h3 className="font-semibold text-[var(--foreground)]">New target</h3>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Operational definition *</label>
                  <input
                    type="text"
                    value={newDef}
                    onChange={(e) => setNewDef(e.target.value)}
                    placeholder="e.g. Touch nose when instructed without prompt"
                    className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)]/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-400">Target type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-sm text-[var(--foreground)]"
                  >
                    {TARGET_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddTarget(false)}
                    className="tap-target flex-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] py-2.5 text-sm text-zinc-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => addTargetMutation.mutate()}
                    disabled={!newDef.trim() || addTargetMutation.isPending}
                    className="btn-primary tap-target flex-1 rounded-xl py-2.5 text-sm disabled:opacity-50"
                  >
                    {addTargetMutation.isPending ? "Adding…" : "Add target"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Target list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-20 rounded-2xl" />)}
        </div>
      ) : targets.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--glass-border)] py-12 text-center">
          <Target className="mb-3 h-8 w-8 text-zinc-600" />
          <p className="text-zinc-400">No targets yet — add the first one above.</p>
        </div>
      ) : (
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.04 } }, hidden: {} }}
        >
          {targets.map((t) => (
            <motion.div
              key={t.id}
              variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              className="glass-card rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[var(--foreground)] mb-1">{t.definition}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${PHASE_COLORS[t.phase] ?? PHASE_COLORS.ACQUISITION}`}>
                      {t.phase}
                    </span>
                    <span className="text-zinc-500">{t.targetType.replace(/_/g, " ")}</span>
                    <span className="text-zinc-600">{t.trialCount} trials</span>
                    {t.masteryEval && (
                      <span className="text-zinc-500">{t.masteryEval.pctCorrect}% correct</span>
                    )}
                    {t.masteryEval?.isMastered && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle className="h-3 w-3" />
                        Mastered
                      </span>
                    )}
                  </div>
                  {/* Mastery progress */}
                  {t.masteryEval && t.phase !== "MASTERED" && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-[var(--glass-border)]">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] transition-all"
                          style={{ width: `${Math.min(t.masteryEval.pctCorrect, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 tabular-nums">{t.masteryEval.pctCorrect}%</span>
                    </div>
                  )}
                </div>
                {canEdit && t.masteryEval?.isMastered && t.phase !== "MASTERED" && (
                  <button
                    type="button"
                    onClick={() => advancePhaseMutation.mutate({ targetId: t.id, phase: "MASTERED" })}
                    className="shrink-0 tap-target rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/30"
                  >
                    Mark mastered
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
