"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileText, Download, FileSpreadsheet, BarChart2, ClipboardList } from "lucide-react";
import { toast } from "sonner";

type ReportType = "progress" | "session_summary" | "behavior" | "assessment_summary";

const REPORT_TYPES: { id: ReportType; label: string; desc: string; icon: typeof FileText }[] = [
  { id: "progress", label: "Progress report", desc: "Trial data, mastery % by target", icon: BarChart2 },
  { id: "session_summary", label: "Session summary", desc: "Per-session trial counts and results", icon: FileSpreadsheet },
  { id: "behavior", label: "Behavior report", desc: "Frequency, ABC events, intensity", icon: FileText },
  { id: "assessment_summary", label: "Assessment history", desc: "Completed assessments and scores", icon: ClipboardList },
];

const REPORT_TO_TYPE: Record<string, string> = {
  progress: "progress",
  session_summary: "trials",
  behavior: "behaviors",
  assessment_summary: "assessments",
};

type ClientOption = { id: string; name: string };

function ReportsInner() {
  const searchParams = useSearchParams();
  const [selectedClientId, setSelectedClientId] = useState<string>(searchParams.get("clientId") ?? "");
  const [selectedReport, setSelectedReport] = useState<ReportType>("progress");
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });
  const [exporting, setExporting] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/smart-steps/api/clients");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : [];
    },
  });

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewData(null);
    const type = REPORT_TO_TYPE[selectedReport] ?? "progress";
    const params = new URLSearchParams({ format: "json", type });
    if (selectedClientId) params.set("clientId", selectedClientId);
    if (dateRange.start) params.set("start", dateRange.start);
    if (dateRange.end) params.set("end", dateRange.end);

    try {
      const res = await fetch(`/smart-steps/api/reports?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load report");
      const data = await res.json();
      setPreviewData(data);
    } catch {
      toast.error("Failed to load report preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExport() {
    if (!selectedClientId) return toast.error("Please select a client");
    setExporting(true);
    const type = REPORT_TO_TYPE[selectedReport] ?? "progress";
    const params = new URLSearchParams({ format: "csv", type });
    params.set("clientId", selectedClientId);
    if (dateRange.start) params.set("start", dateRange.start);
    if (dateRange.end) params.set("end", dateRange.end);

    try {
      const res = await fetch(`/smart-steps/api/reports?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smart-steps-${type}-${dateRange.start}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Reports</h1>
        <p className="text-zinc-500 text-sm">Export real data from DB — trial records, behavior events, assessments</p>
      </motion.div>

      <div className="space-y-6">
        {/* Report type */}
        <div className="glass-card rounded-2xl p-5">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Report type</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {REPORT_TYPES.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setSelectedReport(r.id); setPreviewData(null); }}
                  className={`text-left rounded-2xl p-4 border transition-all ${
                    selectedReport === r.id
                      ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10"
                      : "border-[var(--glass-border)] glass-card hover:border-[var(--accent-cyan)]/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 shrink-0 ${selectedReport === r.id ? "text-[var(--accent-cyan)]" : "text-zinc-500"}`} />
                    <div>
                      <p className="font-semibold text-[var(--foreground)] text-sm">{r.label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{r.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Filters</h2>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Client</label>
            <select
              value={selectedClientId}
              onChange={(e) => { setSelectedClientId(e.target.value); setPreviewData(null); }}
              className="field-input w-full"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-xs text-zinc-600 mt-1">No clients found — create a client first</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Start date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => { setDateRange((d) => ({ ...d, start: e.target.value })); setPreviewData(null); }}
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">End date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => { setDateRange((d) => ({ ...d, end: e.target.value })); setPreviewData(null); }}
                className="field-input w-full"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={loadPreview}
            disabled={previewLoading}
            className="btn-secondary flex-1 tap-target rounded-xl py-3 text-sm font-semibold disabled:opacity-60"
          >
            {previewLoading ? "Loading…" : "Preview report"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || !selectedClientId}
            className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>

        {!selectedClientId && (
          <p className="text-xs text-zinc-600 text-center">Select a client to enable CSV export</p>
        )}

        {/* Preview */}
        {previewData && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-5 space-y-3"
          >
            <h2 className="font-semibold text-[var(--foreground)]">Report preview</h2>

            {selectedReport === "progress" && (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Total trials", value: (previewData as { total?: number }).total ?? 0 },
                    { label: "Correct", value: (previewData as { correct?: number }).correct ?? 0 },
                    { label: "Correct %", value: `${(previewData as { pct?: number }).pct ?? 0}%` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3 text-center">
                      <p className="text-2xl font-bold text-[var(--accent-cyan)]">{s.value}</p>
                      <p className="text-xs text-zinc-500">{s.label}</p>
                    </div>
                  ))}
                </div>
                {((previewData as { rows?: unknown[] }).rows?.length ?? 0) === 0 && (
                  <p className="text-sm text-zinc-500 text-center py-4">
                    No trial data found for this period.
                    {selectedClientId ? "" : " Select a client to narrow results."}
                  </p>
                )}
              </div>
            )}

            {selectedReport === "behavior" && (
              <div>
                <p className="text-sm text-zinc-400">
                  {(previewData as { count?: number }).count ?? 0} behavior event{((previewData as { count?: number }).count ?? 0) !== 1 ? "s" : ""} in selected range
                </p>
                {((previewData as { count?: number }).count ?? 0) === 0 && (
                  <p className="text-xs text-zinc-600 mt-1">No behavior events recorded in this period</p>
                )}
              </div>
            )}

            {selectedReport === "session_summary" && (
              <div>
                <p className="text-sm text-zinc-400">
                  {(previewData as { total?: number }).total ?? 0} trial record{((previewData as { total?: number }).total ?? 0) !== 1 ? "s" : ""} found
                </p>
              </div>
            )}

            {selectedReport === "assessment_summary" && (
              <div>
                <p className="text-sm text-zinc-400">Assessment report not yet available via CSV — view individual assessments in the client profile.</p>
              </div>
            )}

            {((previewData as { total?: number; count?: number }).total ?? (previewData as { count?: number }).count ?? 0) > 0 && (
              <p className="text-xs text-zinc-600">Click "Export CSV" to download the full dataset.</p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="p-8"><div className="glass-card skeleton h-64 rounded-2xl" /></div>}>
      <ReportsInner />
    </Suspense>
  );
}
