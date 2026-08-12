"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ClipboardList, Edit2, Archive, FileText, X, ChevronRight, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/common/RequirePermission";

// ── Existing scoring-template types ──────────────────────────────────────────
type Template = {
  id: string; name: string; description?: string | null;
  category?: string | null; version: string; scoringMethod?: string | null;
  isActive: boolean; createdAt: string;
  sections: { id: string; title: string; items: { id: string }[] }[];
  _count: { clientAssessments: number };
};

// ── Report-template types ─────────────────────────────────────────────────────
type ReportTemplate = {
  id: string; name: string; type: string; description?: string | null;
  isActive: boolean; createdAt: string;
  sections: { id: string; title: string; order: number }[];
  _count: { reports: number };
};

function itemCount(t: Template) {
  return t.sections.reduce((acc, s) => acc + s.items.length, 0);
}

// ── Create Report Template Modal ──────────────────────────────────────────────
function CreateReportTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: ReportTemplate) => void }) {
  const [name, setName]   = useState("ABA Comprehensive Assessment");
  const [type, setType]   = useState("ABA_ASSESSMENT");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/smart-steps/api/report-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      if (!res.ok) throw new Error(await res.text());
      const tmpl = await res.json();
      toast.success("Template created!");
      onCreated(tmpl);
    } catch {
      toast.error("Could not create template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
        className="glass-card w-full max-w-md rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">Create Report Template</h2>
            <p className="mt-0.5 text-xs text-zinc-500">18 ABA clinical sections are pre-built and ready to edit.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:text-[var(--foreground)] hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Template Name *</label>
            <input
              autoFocus
              className="field-input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual ABA Assessment"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Type</label>
            <select className="field-input w-full" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="ABA_ASSESSMENT">ABA Assessment</option>
              <option value="PROGRESS_NOTE">Progress Note</option>
              <option value="TREATMENT_PLAN">Treatment Plan</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="rounded-xl border border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/5 p-3">
            <p className="text-xs font-semibold text-[var(--accent-cyan)]">Pre-built sections included:</p>
            <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
              Service Period · Biopsychosocial Info · Why ABA Needed · Skill Domains (Language, Social, Behavior, Adaptive) ·
              Goals · Coordination · Team Training · Parent Involvement · Crisis Plan · Transition · Discharge ·
              Treatment Hours · Schedule · Summary
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1 rounded-xl py-2.5 text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary flex-1 rounded-xl py-2.5 text-sm" disabled={saving}>
              {saving ? "Creating…" : "Create Template"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Create Report Modal (pick client) ────────────────────────────────────────
type Client = { id: string; name: string };
type BcbaAssignment = { userId: string; userName: string; userEmail: string };

function CreateReportModal({
  template, clients, onClose, onCreated,
}: {
  template: ReportTemplate; clients: Client[];
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [clientId, setClientId]                     = useState("");
  const [title, setTitle]                           = useState(template.name);
  const [servicePeriodStart, setServicePeriodStart] = useState("");
  const [servicePeriodEnd,   setServicePeriodEnd]   = useState("");
  const [assessmentType, setAssessmentType]         = useState<"initial" | "reassessment">("reassessment");
  const [bcbaUserId, setBcbaUserId]                 = useState("");
  const [bcbaOptions, setBcbaOptions]               = useState<BcbaAssignment[]>([]);
  const [loadingBcba, setLoadingBcba]               = useState(false);
  const [showManualProvider, setShowManualProvider] = useState(false);
  const [bcbaManualName, setBcbaManualName]         = useState("");
  const [bcbaManualEmail, setBcbaManualEmail]       = useState("");
  const [bcbaManualCreds, setBcbaManualCreds]       = useState("");
  const [saving, setSaving]                         = useState(false);

  // Load BCBA assignments when client changes
  useEffect(() => {
    if (!clientId) { setBcbaOptions([]); setBcbaUserId(""); return; }
    setLoadingBcba(true);
    setBcbaUserId("");
    fetch(`/smart-steps/api/clients/${clientId}/assignments`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: { role: string; userId: string; name?: string | null; email?: string | null }[]) => {
        const bcbas = data
          .filter((a) => a.role === "BCBA")
          .map((a) => ({
            userId:    a.userId,
            userName:  a.name  ?? a.email ?? a.userId,
            userEmail: a.email ?? "",
          }));
        setBcbaOptions(bcbas);
        if (bcbas.length === 1) setBcbaUserId(bcbas[0].userId);
      })
      .catch(() => setBcbaOptions([]))
      .finally(() => setLoadingBcba(false));
  }, [clientId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { toast.error("Select a client"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/smart-steps/api/report-templates/${template.id}/generate-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          title: title.trim() || template.name,
          assessmentType,
          ...(bcbaUserId                  && { bcbaUserId }),
          ...(bcbaManualName.trim()       && { bcbaManualName: bcbaManualName.trim() }),
          ...(bcbaManualEmail.trim()      && { bcbaManualEmail: bcbaManualEmail.trim() }),
          ...(bcbaManualCreds.trim()      && { bcbaManualCredentials: bcbaManualCreds.trim() }),
          ...(servicePeriodStart          && { servicePeriodStart }),
          ...(servicePeriodEnd            && { servicePeriodEnd }),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const report = await res.json();
      toast.success("Report created!");
      onCreated(report.id);
    } catch {
      toast.error("Could not create report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}
        className="glass-card w-full max-w-md rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">Create Client Report</h2>
            <p className="mt-0.5 text-xs text-zinc-500">From template: <span className="text-[var(--accent-cyan)]">{template.name}</span></p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:text-[var(--foreground)] hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">

          {/* Client */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Client *</label>
            <select className="field-input w-full" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Assessment type */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Assessment Type *</label>
            <div className="flex gap-2">
              {(["initial", "reassessment"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAssessmentType(t)}
                  className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-all ${
                    assessmentType === t
                      ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]"
                      : "border-[var(--glass-border)] bg-[var(--glass-bg)] text-zinc-400 hover:text-[var(--foreground)]"
                  }`}
                >
                  {t === "initial" ? "Initial" : "Reassessment"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">
              {assessmentType === "initial"
                ? "No mastered goals — paragraph summaries focus on current & future treatment."
                : "Includes mastered goals, progress summaries, and in-treatment targets."}
            </p>
          </div>

          {/* BCBA selector */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">BCBA / Provider</label>
            {!clientId ? (
              <p className="text-xs text-zinc-600 italic">Select a client to load assigned BCBAs</p>
            ) : loadingBcba ? (
              <p className="text-xs text-zinc-500">Loading BCBAs…</p>
            ) : bcbaOptions.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">No BCBA assigned to this client — enter manually below or leave blank for placeholders</p>
            ) : (
              <select className="field-input w-full" value={bcbaUserId} onChange={(e) => setBcbaUserId(e.target.value)}>
                <option value="">Select BCBA…</option>
                {bcbaOptions.map((b) => (
                  <option key={b.userId} value={b.userId}>
                    {b.userName}{b.userEmail ? ` (${b.userEmail})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Manual provider entry */}
          <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
            <button
              type="button"
              onClick={() => setShowManualProvider((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wide"
            >
              <span>Manual Provider Entry {bcbaManualName.trim() ? `— ${bcbaManualName.trim()}` : "(optional)"}</span>
              <span className="text-zinc-600">{showManualProvider ? "▲" : "▼"}</span>
            </button>
            {showManualProvider && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] text-zinc-500">
                  For external BCBAs, contractors, or non-system providers.
                  {bcbaUserId ? " A selected BCBA above takes priority." : " Leave blank to use placeholders."}
                </p>
                <input
                  className="field-input w-full"
                  placeholder="Provider name"
                  value={bcbaManualName}
                  onChange={(e) => setBcbaManualName(e.target.value)}
                />
                <input
                  className="field-input w-full"
                  placeholder="Provider email (optional)"
                  value={bcbaManualEmail}
                  onChange={(e) => setBcbaManualEmail(e.target.value)}
                />
                <input
                  className="field-input w-full"
                  placeholder="Credentials e.g. BCBA, LBA, MS (optional)"
                  value={bcbaManualCreds}
                  onChange={(e) => setBcbaManualCreds(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Report Title</label>
            <input
              className="field-input w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Report title"
            />
          </div>

          {/* Service period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Service Period Start</label>
              <input type="date" className="field-input w-full" value={servicePeriodStart} onChange={(e) => setServicePeriodStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Service Period End</label>
              <input type="date" className="field-input w-full" value={servicePeriodEnd} onChange={(e) => setServicePeriodEnd(e.target.value)} />
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 -mt-1">
            Client info, BCBA details, category summaries, and goal tables are auto-populated. Everything remains editable after generation.
          </p>

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1 rounded-xl py-2.5 text-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary flex-1 rounded-xl py-2.5 text-sm" disabled={saving || !clientId}>
              {saving ? "Generating…" : "Generate Report"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AssessmentTemplatesPage() {
  return (
    <RequirePermission
      anyOf={[
        "smartsteps.assessment_templates.view",
        "smartsteps.assessment_templates.manage",
        "smartsteps.report_templates.view",
        "smartsteps.report_templates.manage",
      ]}
    >
      <AssessmentTemplatesPageInner />
    </RequirePermission>
  );
}

function AssessmentTemplatesPageInner() {
  const router = useRouter();
  const qc     = useQueryClient();
  const [tab,   setTab]   = useState<"scoring" | "report">("scoring");
  const [showCreateReport, setShowCreateReport]         = useState(false);
  const [showCreateFromTemplate, setShowCreateFromTemplate] = useState<ReportTemplate | null>(null);

  // Existing scoring templates
  const { data: templates = [], isLoading: loadingTemplates } = useQuery<Template[]>({
    queryKey: ["assessment-templates"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/assessments/templates");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // New report templates
  const { data: reportTemplates = [], isLoading: loadingReports } = useQuery<ReportTemplate[]>({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/report-templates");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Clients (for "Create Report" modal)
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/clients");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!showCreateFromTemplate,
  });

  async function archiveTemplate(id: string, name: string) {
    if (!confirm(`Archive "${name}"?`)) return;
    const res = await fetch(`/smart-steps/api/assessments/templates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.ok) { toast.success("Template archived"); qc.invalidateQueries({ queryKey: ["assessment-templates"] }); }
    else toast.error("Failed to archive");
  }

  async function deleteReportTemplate(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/smart-steps/api/report-templates/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["report-templates"] }); }
    else toast.error("Could not delete.");
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Assessments</h1>
          <p className="text-zinc-500 text-sm">Build assessment instruments and clinical report templates</p>
        </div>
        {tab === "scoring" ? (
          <Link href="/assessments/new" className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            <Plus className="h-4 w-4" /> New template
          </Link>
        ) : (
          <button
            type="button"
            className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
            onClick={() => setShowCreateReport(true)}
          >
            <Plus className="h-4 w-4" /> Create Template
          </button>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-[var(--glass-border)]">
        {([
          { id: "scoring", label: "Assessment Templates", icon: ClipboardList },
          { id: "report",  label: "Report Templates",    icon: FileText },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`mr-6 flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors ${
              tab === id
                ? "border-[var(--accent-cyan)] text-[var(--accent-cyan)]"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              tab === id ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" : "bg-white/10 text-zinc-500"
            }`}>
              {id === "scoring" ? templates.length : reportTemplates.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Scoring templates tab (UNCHANGED) ── */}
      {tab === "scoring" && (
        loadingTemplates ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-40 rounded-2xl" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
            <ClipboardList className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium mb-1">No assessment templates yet</p>
            <p className="text-zinc-600 text-sm mb-4">Create your first template to start assessing clients</p>
            <Link href="/assessments/new" className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
              <Plus className="h-4 w-4" /> Create template
            </Link>
          </div>
        ) : (
          <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } }, hidden: {} }}>
            {templates.map((t) => (
              <motion.div key={t.id} variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
                <div className="glass-card rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[var(--foreground)] truncate">{t.name}</h3>
                      {t.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{t.description}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Link href={`/assessments/${t.id}/edit`} className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Link>
                      <button type="button" onClick={() => archiveTemplate(t.id, t.name)} className="rounded-lg p-1.5 text-zinc-600 hover:text-amber-400 transition-colors">
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {t.category && <span className="rounded-full bg-[var(--accent-purple)]/20 px-2.5 py-0.5 text-[var(--accent-purple)]">{t.category}</span>}
                    <span className="rounded-full bg-[var(--glass-border)] px-2.5 py-0.5 text-zinc-400">v{t.version}</span>
                    {t.scoringMethod && <span className="rounded-full bg-[var(--glass-border)] px-2.5 py-0.5 text-zinc-400">{t.scoringMethod}</span>}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {t.sections.length} section{t.sections.length !== 1 ? "s" : ""} · {itemCount(t)} item{itemCount(t) !== 1 ? "s" : ""} · used {t._count.clientAssessments}×
                  </div>
                  <Link href={`/assessments/${t.id}/edit`} className="btn-secondary tap-target rounded-xl py-2 text-sm text-center font-medium">Edit template</Link>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )
      )}

      {/* ── Report templates tab (NEW) ── */}
      {tab === "report" && (
        loadingReports ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-44 rounded-2xl" />)}
          </div>
        ) : reportTemplates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
            <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400 font-medium mb-1">No report templates yet</p>
            <p className="text-zinc-600 text-sm mb-4">Create a document-style ABA assessment report template</p>
            <button type="button" className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold" onClick={() => setShowCreateReport(true)}>
              <Plus className="h-4 w-4" /> Create Template
            </button>
          </div>
        ) : (
          <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } }, hidden: {} }}>
            {reportTemplates.map((t) => (
              <motion.div key={t.id} variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
                <div className="glass-card group rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="rounded-full bg-[var(--accent-cyan)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-cyan)]">
                        {t.type.replace("_", " ")}
                      </span>
                      <h3 className="mt-1.5 font-semibold text-[var(--foreground)] truncate">{t.name}</h3>
                      {t.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{t.description}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteReportTemplate(t.id, t.name)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg p-1.5 text-zinc-600 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Section preview */}
                  <div className="space-y-1">
                    {t.sections.slice(0, 3).map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5">
                        <div className="h-1 w-1 rounded-full bg-zinc-600" />
                        <span className="text-[11px] text-zinc-500 truncate">{s.title}</span>
                      </div>
                    ))}
                    {t.sections.length > 3 && (
                      <span className="text-[11px] text-zinc-600">+ {t.sections.length - 3} more sections</span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-600">{t.sections.length} sections · used {t._count.reports}×</p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary flex-1 rounded-xl py-2 text-xs font-medium flex items-center justify-center gap-1.5"
                      onClick={() => router.push(`/assessments/report-templates/${t.id}`)}
                    >
                      <Edit2 className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn-primary flex-1 rounded-xl py-2 text-xs font-medium flex items-center justify-center gap-1.5"
                      onClick={() => setShowCreateFromTemplate(t)}
                    >
                      <Users className="h-3 w-3" /> Create Report
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )
      )}

      {/* Modals */}
      <AnimatePresence>
        {showCreateReport && (
          <CreateReportTemplateModal
            onClose={() => setShowCreateReport(false)}
            onCreated={(tmpl) => {
              setShowCreateReport(false);
              qc.invalidateQueries({ queryKey: ["report-templates"] });
              router.push(`/assessments/report-templates/${tmpl.id}`);
            }}
          />
        )}
        {showCreateFromTemplate && (
          <CreateReportModal
            template={showCreateFromTemplate}
            clients={clients}
            onClose={() => setShowCreateFromTemplate(null)}
            onCreated={(reportId) => {
              setShowCreateFromTemplate(null);
              router.push(`/assessments/reports/${reportId}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
