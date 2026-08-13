"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Save, FileText } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

type BehaviorPlan = {
  id?: string;
  clientId: string;
  targetBehavior: string;
  behaviorFunction: string;
  replacementBehavior: string;
  preventionStrategies: string;
  teachingProcedures: string;
  reinforcementPlan: string;
  crisisPlan: string;
  dataCollectionMethod: string;
};

const FUNCTIONS = [
  "Attention",
  "Escape / Avoidance",
  "Access to tangibles",
  "Automatic / Sensory",
  "Communication",
  "Unknown",
];

const DATA_METHODS = [
  "Frequency",
  "Duration",
  "Rate",
  "Latency",
  "ABC recording",
  "Partial interval",
  "Whole interval",
  "Momentary time sampling",
];

export default function BehaviorPlanPage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const { data: sessionData } = useSession();
  const role = (sessionData?.user as { role?: string })?.role;
  const canEdit = role === "BCBA" || role === "ADMIN";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<BehaviorPlan>({
    clientId,
    targetBehavior: "",
    behaviorFunction: "Attention",
    replacementBehavior: "",
    preventionStrategies: "",
    teachingProcedures: "",
    reinforcementPlan: "",
    crisisPlan: "",
    dataCollectionMethod: "Frequency",
  });

  useEffect(() => {
    fetch(`/smart-steps/api/behavior-plan?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data) setPlan({ ...plan, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/smart-steps/api/behavior-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Behavior plan saved.");
    } catch {
      toast.error("Failed to save behavior plan.");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    label: string,
    key: keyof BehaviorPlan,
    placeholder: string,
    rows = 3
  ) => (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</label>
      {rows === 1 ? (
        <input
          type="text"
          value={plan[key] as string}
          onChange={(e) => setPlan({ ...plan, [key]: e.target.value })}
          placeholder={placeholder}
          disabled={!canEdit}
          className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20 disabled:opacity-60"
        />
      ) : (
        <textarea
          value={plan[key] as string}
          onChange={(e) => setPlan({ ...plan, [key]: e.target.value })}
          placeholder={placeholder}
          rows={rows}
          disabled={!canEdit}
          className="w-full resize-none rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20 disabled:opacity-60"
        />
      )}
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8 flex items-center gap-3">
          <Link
            href={`/clients/${clientId}`}
            className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Behavior Intervention Plan</h1>
            <p className="text-sm text-zinc-500">
              {canEdit ? "BCBA-level document — editable by BCBA/Admin" : "Read-only view"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-24 rounded-2xl" />)}
          </div>
        ) : (
          <form onSubmit={save} className="mx-auto max-w-2xl space-y-8">
            {/* Target behavior */}
            <div className="glass-card rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-[var(--accent-cyan)]" />
                <h2 className="font-semibold text-[var(--foreground)]">Target behavior</h2>
              </div>
              {field("Target behavior (operational definition) *", "targetBehavior",
                "Describe the behavior in observable, measurable terms", 2)}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Hypothesized function</label>
                <select
                  value={plan.behaviorFunction}
                  onChange={(e) => setPlan({ ...plan, behaviorFunction: e.target.value })}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] focus:border-[var(--accent-cyan)]/50 focus:outline-none disabled:opacity-60"
                >
                  {FUNCTIONS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              {field("Replacement behavior", "replacementBehavior",
                "Functionally equivalent replacement behavior", 2)}
            </div>

            {/* Strategies */}
            <div className="glass-card rounded-2xl p-6 space-y-5">
              <h2 className="font-semibold text-[var(--foreground)]">Intervention strategies</h2>
              {field("Prevention / antecedent strategies", "preventionStrategies",
                "Environmental modifications, schedules, visual supports…", 3)}
              {field("Teaching procedures", "teachingProcedures",
                "DTT, FCT, Social Stories, video modeling…", 3)}
              {field("Reinforcement plan", "reinforcementPlan",
                "Token economy, schedule, preferred items/activities…", 3)}
            </div>

            {/* Crisis & data */}
            <div className="glass-card rounded-2xl p-6 space-y-5">
              <h2 className="font-semibold text-[var(--foreground)]">Safety & data</h2>
              {field("Crisis / safety plan", "crisisPlan",
                "De-escalation steps, safety protocols, team notifications…", 3)}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Data collection method</label>
                <select
                  value={plan.dataCollectionMethod}
                  onChange={(e) => setPlan({ ...plan, dataCollectionMethod: e.target.value })}
                  disabled={!canEdit}
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] focus:border-[var(--accent-cyan)]/50 focus:outline-none disabled:opacity-60"
                >
                  {DATA_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={saving || !plan.targetBehavior.trim()}
                className="btn-primary tap-target w-full rounded-xl py-3 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save BIP"}
              </button>
            )}
          </form>
        )}
      </motion.div>
    </div>
  );
}
