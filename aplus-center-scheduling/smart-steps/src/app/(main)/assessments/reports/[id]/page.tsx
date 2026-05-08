"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";
import { escapeHtml } from "@/lib/sanitizeHtml";

type Section = { id: string; title: string; order: number; content: string };
type Report  = {
  id: string; title: string; status: string; createdAt: string; updatedAt: string;
  client:   { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  sections: Section[];
};

const STATUS_OPTIONS = ["DRAFT", "IN_PROGRESS", "COMPLETED", "FINAL"];
const STATUS_STYLES: Record<string, string> = {
  DRAFT:       "border border-zinc-600 bg-transparent text-zinc-400",
  IN_PROGRESS: "bg-amber-500/15 border border-amber-500/30 text-amber-400",
  COMPLETED:   "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400",
  FINAL:       "bg-zinc-100 text-zinc-900 border border-zinc-200",
};

// ── Print / Save as PDF ───────────────────────────────────────────────────────

function printReport(report: Report, sections: Section[]) {
  const win = window.open("", "_blank");
  if (!win) { toast.error("Pop-up blocked — allow pop-ups and try again."); return; }

  const clientName = escapeHtml(report.client?.name ?? "");
  const title      = escapeHtml(report.title);
  const updated    = new Date(report.updatedAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const sectionsHtml = sections
    .map((s) => `
      <section class="report-section">
        <h2>${escapeHtml(s.title)}</h2>
        <div class="section-content">${s.content || "<p><em>(empty)</em></p>"}</div>
      </section>`)
    .join("");

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #111;
      background: #fff;
      padding: 1in;
      max-width: 8.5in;
      margin: 0 auto;
    }
    .report-header {
      border-bottom: 2px solid #333;
      padding-bottom: 12pt;
      margin-bottom: 24pt;
    }
    .report-header h1 { font-size: 18pt; font-weight: bold; margin-bottom: 6pt; }
    .report-meta { font-size: 10pt; color: #444; display: flex; gap: 24pt; flex-wrap: wrap; }
    .report-section { margin-bottom: 24pt; page-break-inside: avoid; }
    .report-section h2 {
      font-size: 13pt;
      font-weight: bold;
      color: #1a1a2e;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4pt;
      margin-bottom: 10pt;
    }
    .section-content { font-size: 11pt; }
    p  { margin-bottom: 8pt; }
    ul, ol { margin: 8pt 0 8pt 20pt; }
    li { margin-bottom: 4pt; }
    h3 { font-size: 11pt; font-weight: bold; margin: 10pt 0 6pt; }
    h2 { font-size: 12pt; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    u  { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
      font-size: 10pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #aaa;
      padding: 5pt 8pt;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f0f0f0; font-weight: bold; }
    @media print {
      body { padding: 0.5in; }
      .report-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${title}</h1>
    <div class="report-meta">
      ${clientName ? `<span><strong>Client:</strong> ${clientName}</span>` : ""}
      <span><strong>Status:</strong> ${escapeHtml(report.status.replace("_", " "))}</span>
      <span><strong>Updated:</strong> ${escapeHtml(updated)}</span>
    </div>
  </div>
  ${sectionsHtml}
</body>
</html>`);

  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientReportEditorPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [report,   setReport]   = useState<Report | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [editTitle, setEditTitle] = useState(false);
  const [titleVal,  setTitleVal]  = useState("");
  const [status,    setStatus]    = useState("DRAFT");
  const [showAddSection, setShowAddSection] = useState(false);
  const [newTitle,  setNewTitle]  = useState("");
  const dragIdx  = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/smart-steps/api/client-reports/${id}`);
      if (!res.ok) throw new Error();
      const data: Report = await res.json();
      setReport(data);
      setTitleVal(data.title);
      setStatus(data.status);
      setSections(data.sections);
    } catch {
      toast.error("Could not load report.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Ctrl+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // Auto-save 3 s debounce
  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 3000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, titleVal, status, dirty]);

  async function save() {
    if (saving || !report) return;
    setSaving(true);
    try {
      await fetch(`/smart-steps/api/client-reports/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleVal, status }),
      });
      const res = await fetch(`/smart-steps/api/client-reports/${id}/sections`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: sections.map((s, i) => ({ title: s.title, content: s.content || "", order: i })) }),
      });
      if (!res.ok) throw new Error();
      const refreshed: Report = await res.json();
      setReport((p) => p ? { ...p, title: titleVal, status } : p);
      setSections(refreshed.sections);
      setDirty(false);
    } catch {
      toast.error("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(sectionId: string, field: "title" | "content", value: string) {
    setSections((p) => p.map((s) => s.id === sectionId ? { ...s, [field]: value } : s));
    setDirty(true);
  }

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`/smart-steps/api/client-reports/${id}/sections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: "" }),
      });
      const sec: Section = await res.json();
      setSections((p) => [...p, sec]);
      setNewTitle(""); setShowAddSection(false);
    } catch { toast.error("Could not add section."); }
  }

  async function deleteSection(sectionId: string) {
    if (!confirm("Remove this section?")) return;
    try {
      await fetch(`/smart-steps/api/client-reports/${id}/sections/${sectionId}`, { method: "DELETE" });
      setSections((p) => p.filter((s) => s.id !== sectionId));
    } catch { toast.error("Could not delete."); }
  }

  function onDragStart(e: React.DragEvent, idx: number) { dragIdx.current = idx; e.dataTransfer.effectAllowed = "move"; }
  function onDragOver(e: React.DragEvent, idx: number)  { e.preventDefault(); dragOver.current = idx; }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = dragIdx.current; const to = dragOver.current;
    if (from === null || to === null || from === to) return;
    setSections((p) => { const n = [...p]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
    setDirty(true); dragIdx.current = null; dragOver.current = null;
  }

  if (loading) return (
    <div className="p-8 space-y-4 max-w-3xl mx-auto">
      {[1, 2, 3].map((i) => <div key={i} className="h-44 glass-card animate-pulse rounded-2xl" />)}
    </div>
  );

  if (!report) return (
    <div className="flex h-full items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm text-zinc-500">Report not found.</p>
      <button type="button" className="btn-secondary rounded-xl px-4 py-2 text-sm" onClick={() => router.push("/assessments")}>Back</button>
    </div>
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 px-6 py-4 border-b border-[var(--glass-border)]">
        <button type="button" onClick={() => router.push("/assessments")}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-sm text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Assessments
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-zinc-500">
            {report.client?.name}
            {report.template && <> · <span className="text-zinc-600">{report.template.name}</span></>}
            {dirty  && <span className="ml-2 text-amber-400 font-medium">· Unsaved</span>}
            {saving && <span className="ml-2 text-zinc-500">· Saving…</span>}
          </p>
        </div>

        <select
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold cursor-pointer ${STATUS_STYLES[status] || STATUS_STYLES.DRAFT}`}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>

        <button
          type="button"
          onClick={() => printReport(report, sections)}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-sm text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/10 transition-colors"
          title="Print / Save as PDF"
        >
          <Printer className="h-4 w-4" /> Print
        </button>

        <button type="button" onClick={save} disabled={saving || !dirty}
          className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm disabled:opacity-40">
          {saving
            ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Document */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 md:px-6">
          {/* Document header card */}
          <div className="glass-card mb-6 rounded-2xl p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              {editTitle ? (
                <input
                  autoFocus
                  className="field-input flex-1 text-xl font-bold"
                  value={titleVal}
                  onChange={(e) => { setTitleVal(e.target.value); setDirty(true); }}
                  onBlur={() => setEditTitle(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditTitle(false); }}
                />
              ) : (
                <button type="button" className="group flex items-start gap-2 text-left flex-1" onClick={() => setEditTitle(true)}>
                  <h1 className="text-xl font-bold text-[var(--foreground)] leading-tight">{titleVal}</h1>
                  <Pencil className="mt-1 h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.DRAFT}`}>
                {status.replace("_", " ")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-zinc-500 sm:grid-cols-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Client</span>
                <span className="font-medium text-zinc-300">{report.client?.name ?? "—"}</span>
              </div>
              {report.template && (
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Template</span>
                  <span className="font-medium text-zinc-300">{report.template.name}</span>
                </div>
              )}
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Updated</span>
                <span className="font-medium text-zinc-300">
                  {new Date(report.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-zinc-600">Sections</span>
                <span className="font-medium text-zinc-300">{sections.length}</span>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            {sections.map((sec, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={onDrop}
                onDragEnd={() => { dragIdx.current = null; dragOver.current = null; }}
                className="glass-card group rounded-2xl border border-[var(--glass-border)] overflow-hidden transition-all hover:border-[var(--glass-border)]/80"
              >
                {/* Section header */}
                <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-4 py-3">
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-700 active:cursor-grabbing" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--foreground)] focus:outline-none placeholder:text-zinc-600"
                    value={sec.title}
                    onChange={(e) => updateSection(sec.id, "title", e.target.value)}
                    placeholder="Section title"
                  />
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-zinc-600">§{idx + 1}</span>
                    <button type="button" onClick={() => deleteSection(sec.id)}
                      className="rounded p-1 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Rich text content — key uses idx (not sec.id) so editors don't remount
                    when the PUT route rebuilds sections with new IDs on each save */}
                <div className="px-4 pb-4 pt-3">
                  <RichTextEditor
                    key={idx}
                    value={sec.content || ""}
                    onChange={(v) => updateSection(sec.id, "content", v)}
                    placeholder={`Write clinical notes for "${sec.title}"…`}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add section */}
          <div className="mt-4">
            <AnimatePresence>
              {showAddSection ? (
                <motion.form
                  key="form"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  onSubmit={addSection}
                  className="glass-card rounded-2xl p-4 border border-[var(--accent-cyan)]/20"
                >
                  <p className="mb-2 text-xs font-semibold text-[var(--accent-cyan)]">New Section</p>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      className="field-input flex-1 text-sm"
                      placeholder="Section title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                    <button type="submit" className="btn-primary rounded-xl px-4 py-2 text-sm" disabled={!newTitle.trim()}>Add</button>
                    <button type="button" className="btn-secondary rounded-xl px-4 py-2 text-sm"
                      onClick={() => { setShowAddSection(false); setNewTitle(""); }}>Cancel</button>
                  </div>
                </motion.form>
              ) : (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  type="button"
                  onClick={() => setShowAddSection(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 py-3 text-sm font-medium text-zinc-600 hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/5 transition-all"
                >
                  <Plus className="h-4 w-4" /> Add Section
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {sections.length > 0 && (
            <p className="mt-6 text-center text-xs text-zinc-600">
              Drag sections to reorder · Click title to rename · Auto-saves every 3 seconds · <button type="button" className="underline hover:text-zinc-400" onClick={() => printReport(report, sections)}>Print / Save as PDF</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
