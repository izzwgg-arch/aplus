"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, ClipboardList, CheckCircle, Clock, FileText, ExternalLink } from "lucide-react";
import { RequirePermission } from "@/components/common/RequirePermission";

type ClientAssessmentSummary = {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  totalScore?: number | null;
  notes?: string | null;
  template: {
    id: string;
    name: string;
    category?: string | null;
    scoringMethod?: string | null;
  };
  completedBy?: { name: string | null } | null;
  _count: { responses: number };
};

type ClientReport = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  template: { id: string; name: string; type: string };
  _count: { sections: number };
};

const REPORT_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:     { bg: "bg-zinc-500/20",    text: "text-zinc-400",    label: "Draft" },
  FINAL:     { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Final" },
  ARCHIVED:  { bg: "bg-amber-500/20",   text: "text-amber-400",   label: "Archived" },
};

export default function ClientAssessmentsPage() {
  return (
    <RequirePermission anyOf={["smartsteps.assessments.view.all", "smartsteps.reports.view.all"]}>
      <ClientAssessmentsPageInner />
    </RequirePermission>
  );
}

function ClientAssessmentsPageInner() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");

  const { data: assessments = [], isLoading, error } = useQuery<ClientAssessmentSummary[]>({
    queryKey: ["client-assessments", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/assessments`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!clientId,
  });

  const {
    data: reports = [],
    isLoading: loadingReports,
    error: reportsError,
  } = useQuery<ClientReport[]>({
    queryKey: ["client-reports", clientId],
    queryFn: async () => {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/reports`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!clientId,
  });

  const completed  = assessments.filter((a) => a.status === "COMPLETED");
  const inProgress = assessments.filter((a) => a.status === "IN_PROGRESS");

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/clients/${clientId}`} className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Assessments</h1>
            <p className="text-zinc-500 text-sm">
              {completed.length} scoring completed · {inProgress.length} in progress · {reports.length} clinical report{reports.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Link
          href={`/clients/${clientId}/assessments/new`}
          className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New assessment
        </Link>
      </motion.div>

      {error && (
        <div className="mb-4 rounded-2xl border border-[var(--accent-pink)]/30 bg-[var(--accent-pink)]/10 p-4 text-sm text-[var(--accent-pink)]">
          Failed to load assessments.
        </div>
      )}

      {/* ── Scoring assessments ──────────────────────────────────────────────── */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-2">
        <ClipboardList className="h-4 w-4" /> Scoring Assessments
      </h2>

      {isLoading ? (
        <div className="space-y-3 mb-10">
          {[1, 2].map((i) => <div key={i} className="glass-card skeleton h-24 rounded-2xl" />)}
        </div>
      ) : assessments.length === 0 ? (
        <div className="mb-10 rounded-2xl border border-dashed border-[var(--glass-border)] py-12 text-center">
          <ClipboardList className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium mb-1">No assessments yet</p>
          <p className="text-zinc-600 text-sm mb-4">Assign an assessment template to start evaluating this client</p>
          <Link href={`/clients/${clientId}/assessments/new`} className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            <Plus className="h-4 w-4" /> Start assessment
          </Link>
        </div>
      ) : (
        <motion.div
          className="space-y-3 mb-10"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } }, hidden: {} }}
        >
          {assessments.map((a) => (
            <motion.div key={a.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
              <Link href={`/clients/${clientId}/assessments/${a.id}`}>
                <div className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:shadow-[var(--glow-cyan)] transition-shadow">
                  <div className={`rounded-xl p-3 shrink-0 ${a.status === "COMPLETED" ? "bg-emerald-500/20" : "bg-amber-500/20"}`}>
                    {a.status === "COMPLETED"
                      ? <CheckCircle className="h-5 w-5 text-emerald-400" />
                      : <Clock className="h-5 w-5 text-amber-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[var(--foreground)] truncate">{a.template.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                        a.status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                      }`}>
                        {a.status === "COMPLETED" ? "Completed" : "In progress"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {a.template.category && `${a.template.category} · `}
                      Started {new Date(a.startedAt).toLocaleDateString()}
                      {a.completedAt && ` · Completed ${new Date(a.completedAt).toLocaleDateString()}`}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {a._count.responses} response{a._count.responses !== 1 ? "s" : ""} saved
                      {a.completedBy?.name && ` · by ${a.completedBy.name}`}
                    </p>
                  </div>
                  {a.totalScore !== null && a.totalScore !== undefined && (
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-[var(--accent-cyan)]">{a.totalScore.toFixed(0)}</p>
                      <p className="text-xs text-zinc-500">total score</p>
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Clinical Reports ─────────────────────────────────────────────────── */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-2">
        <FileText className="h-4 w-4" /> Clinical Reports
      </h2>

      {reportsError && (
        <div className="mb-4 rounded-2xl border border-[var(--accent-pink)]/30 bg-[var(--accent-pink)]/10 p-4 text-sm text-[var(--accent-pink)]">
          Failed to load clinical reports.
        </div>
      )}

      {loadingReports ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="glass-card skeleton h-20 rounded-2xl" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-12 text-center">
          <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium mb-1">No clinical reports yet</p>
          <p className="text-zinc-600 text-sm">
            Generate a report from{" "}
            <Link href="/assessments" className="text-[var(--accent-cyan)] hover:underline">
              Assessment Templates
            </Link>{" "}
            to create a clinical report for this client.
          </p>
        </div>
      ) : (
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } }, hidden: {} }}
        >
          {reports.map((r) => {
            const statusStyle = REPORT_STATUS_STYLES[r.status] ?? REPORT_STATUS_STYLES.DRAFT;
            return (
              <motion.div key={r.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <Link href={`/assessments/reports/${r.id}`} target="_blank" rel="noopener noreferrer">
                  <div className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:shadow-[var(--glow-cyan)] transition-shadow">
                    <div className="rounded-xl p-3 shrink-0 bg-[var(--accent-cyan)]/15">
                      <FileText className="h-5 w-5 text-[var(--accent-cyan)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-[var(--foreground)] truncate">{r.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
                          {statusStyle.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]">
                          {r.template.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Template: {r.template.name} · {r._count.sections} section{r._count.sections !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        Created {new Date(r.createdAt).toLocaleDateString()}
                        {r.updatedAt !== r.createdAt && ` · Updated ${new Date(r.updatedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-zinc-600 shrink-0" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
