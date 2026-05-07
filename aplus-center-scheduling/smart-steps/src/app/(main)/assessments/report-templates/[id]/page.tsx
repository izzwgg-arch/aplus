"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Pencil } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";

type Section  = { id: string; title: string; order: number; content: string };
type Template = { id: string; name: string; type: string; description?: string | null; sections: Section[] };

export default function ReportTemplateBuilderPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [template, setTemplate]  = useState<Template | null>(null);
  const [sections, setSections]  = useState<Section[]>([]);
  const [activeId,  setActiveId] = useState<string | null>(null);
  const [loading,   setLoading]  = useState(true);
  const [saving,    setSaving]   = useState(false);
  const [dirty,     setDirty]    = useState(false);
  const [editName,  setEditName] = useState(false);
  const [nameVal,   setNameVal]  = useState("");
  const dragIdx  = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/smart-steps/api/report-templates/${id}`);
      if (!res.ok) throw new Error();
      const data: Template = await res.json();
      setTemplate(data);
      setNameVal(data.name);
      setSections(data.sections);
      if (data.sections.length > 0) setActiveId(data.sections[0].id);
    } catch {
      toast.error("Could not load template.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); if (dirty) save(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  async function save() {
    if (saving || !template) return;
    setSaving(true);
    try {
      const res = await fetch(`/smart-steps/api/report-templates/${id}/sections`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: sections.map((s, i) => ({ title: s.title, content: s.content || "", order: i })) }),
      });
      if (!res.ok) throw new Error();
      const updated: Template = await res.json();
      if (nameVal !== template.name) {
        await fetch(`/smart-steps/api/report-templates/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nameVal }),
        });
        setTemplate((p) => p ? { ...p, name: nameVal } : p);
      }
      setSections(updated.sections);
      setDirty(false);
      toast.success("Saved");
    } catch {
      toast.error("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function addSection() {
    try {
      const res = await fetch(`/smart-steps/api/report-templates/${id}/sections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Section", content: "" }),
      });
      const sec: Section = await res.json();
      setSections((p) => [...p, sec]);
      setActiveId(sec.id);
    } catch { toast.error("Could not add section."); }
  }

  async function deleteSection(sectionId: string) {
    if (!confirm("Delete this section?")) return;
    try {
      await fetch(`/smart-steps/api/report-templates/${id}/sections/${sectionId}`, { method: "DELETE" });
      setSections((p) => {
        const next = p.filter((s) => s.id !== sectionId);
        if (activeId === sectionId) setActiveId(next[0]?.id ?? null);
        return next;
      });
    } catch { toast.error("Could not delete."); }
  }

  function updateSection(sectionId: string, field: "title" | "content", value: string) {
    setSections((p) => p.map((s) => s.id === sectionId ? { ...s, [field]: value } : s));
    setDirty(true);
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

  const activeSection = sections.find((s) => s.id === activeId);

  if (loading) return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="space-y-3 w-80">
        {[1, 2, 3].map((i) => <div key={i} className="h-12 glass-card animate-pulse rounded-xl" />)}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col p-4 md:p-6 gap-4">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={() => router.push("/assessments")}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-[var(--foreground)] hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex-1 min-w-0">
          {editName ? (
            <input
              autoFocus
              className="field-input w-full max-w-sm font-bold text-base"
              value={nameVal}
              onChange={(e) => { setNameVal(e.target.value); setDirty(true); }}
              onBlur={() => setEditName(false)}
              onKeyDown={(e) => { if (e.key === "Enter") setEditName(false); }}
            />
          ) : (
            <button type="button" className="group flex items-center gap-2" onClick={() => setEditName(true)}>
              <h1 className="font-bold text-[var(--foreground)] text-base">{nameVal}</h1>
              <Pencil className="h-3.5 w-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          <p className="text-[11px] text-zinc-500">
            {sections.length} sections
            {dirty && <span className="ml-2 text-amber-400 font-medium">· Unsaved</span>}
          </p>
        </div>

        <button type="button" onClick={save} disabled={saving || !dirty}
          className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm disabled:opacity-40">
          {saving
            ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Split layout */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Sections sidebar */}
        <aside className="flex w-60 shrink-0 flex-col rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Sections</p>
            <button type="button" onClick={addSection}
              className="rounded-lg p-1 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-white/5 transition-colors" title="Add section">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {sections.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <p className="text-xs text-zinc-600">No sections yet</p>
                <button type="button" className="text-xs text-[var(--accent-cyan)] underline" onClick={addSection}>Add one</button>
              </div>
            ) : sections.map((sec, idx) => (
              <div
                key={sec.id}
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDrop={onDrop}
                onDragEnd={() => { dragIdx.current = null; dragOver.current = null; }}
                onClick={() => setActiveId(sec.id)}
                className={`group flex cursor-pointer items-center gap-2 border-b border-[var(--glass-border)] px-3 py-2.5 last:border-b-0 transition-colors ${
                  sec.id === activeId
                    ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-zinc-600 active:cursor-grabbing" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{sec.title || "Untitled"}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteSection(sec.id); }}
                  className="shrink-0 rounded opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-[var(--glass-border)] p-3">
            <button type="button" onClick={addSection}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-700 py-2 text-xs font-medium text-zinc-600 hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)] transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Section
            </button>
          </div>
        </aside>

        {/* Editor */}
        <main className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
          {!activeSection ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-zinc-500">Select a section or add a new one</p>
              <button type="button" className="btn-primary rounded-xl px-4 py-2 text-sm flex items-center gap-1.5" onClick={addSection}>
                <Plus className="h-4 w-4" /> Add Section
              </button>
            </div>
          ) : (
            <motion.div
              key={activeSection.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}
              className="p-6 space-y-6"
            >
              {/* Section title */}
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Section Title</label>
                <input
                  className="field-input w-full text-lg font-bold"
                  value={activeSection.title}
                  onChange={(e) => updateSection(activeSection.id, "title", e.target.value)}
                  placeholder="Section title"
                />
              </div>

              {/* Rich text content */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Default Content / Guidance</label>
                  <div className="flex-1 border-t border-[var(--glass-border)]" />
                  <span className="text-[10px] text-zinc-600">supports rich text &amp; tables</span>
                </div>
                <RichTextEditor
                  key={activeSection.id}
                  value={activeSection.content || ""}
                  onChange={(v) => updateSection(activeSection.id, "content", v)}
                  placeholder={`Add default guidance for this section.\n\nExample:\n• Service period: [start date] – [end date]\n• Provider: {{provider_name}}, BCBA`}
                />
                <p className="mt-1.5 text-[11px] text-zinc-600">
                  Default content is copied into all reports from this template. Use <code className="text-[var(--accent-cyan)]">{"{{client_name}}"}</code>, <code className="text-[var(--accent-cyan)]">{"{{dob}}"}</code>, <code className="text-[var(--accent-cyan)]">{"{{provider_name}}"}</code>, <code className="text-[var(--accent-cyan)]">{"{{assessment_date}}"}</code>, <code className="text-[var(--accent-cyan)]">{"{{address}}"}</code> for auto-fill.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--glass-border)] bg-white/3 px-4 py-3">
                <p className="text-xs text-zinc-500">
                  Position {sections.findIndex((s) => s.id === activeSection.id) + 1} of {sections.length}
                  <span className="ml-2 text-zinc-600">· Drag sidebar items to reorder</span>
                </p>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
