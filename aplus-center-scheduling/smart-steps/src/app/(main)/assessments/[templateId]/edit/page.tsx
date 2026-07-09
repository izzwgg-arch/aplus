"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";

type Item = {
  id?: string;
  text: string;
  description: string;
  responseType: string;
  options: string;
  scoreValue: string;
  isRequired: boolean;
};

type Section = {
  id?: string;
  title: string;
  description: string;
  expanded: boolean;
  items: Item[];
};

const RESPONSE_TYPES = [
  { value: "YES_NO", label: "Yes / No" },
  { value: "SCALE", label: "Scale (1–5)" },
  { value: "NUMERIC", label: "Numeric" },
  { value: "TEXT", label: "Free text" },
  { value: "SINGLE_SELECT", label: "Single select" },
  { value: "MULTI_SELECT", label: "Multi select" },
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "PROMPT_LEVEL", label: "Prompt level" },
];

const CATEGORIES = ["Adaptive", "Behavioral", "Language", "Academic", "Social", "Vocational", "Custom"];
const SCORING_METHODS = ["total_score", "section_score", "pass_fail", "narrative", "none"];

export default function EditTemplatePage() {
  const params = useParams();
  const templateId = String(params.templateId ?? "");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [version, setVersion] = useState("1.0");
  const [scoringMethod, setScoringMethod] = useState("total_score");
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    fetch(`/smart-steps/api/assessments/templates/${templateId}`)
      .then((r) => r.json())
      .then((data) => {
        setName(data.name ?? "");
        setDescription(data.description ?? "");
        setCategory(data.category ?? "");
        setVersion(data.version ?? "1.0");
        setScoringMethod(data.scoringMethod ?? "total_score");
        setSections(
          (data.sections ?? []).map((s: { id: string; title: string; description?: string; items: Array<{ id: string; text: string; description?: string; responseType: string; options?: string[]; scoreValue?: number; isRequired: boolean }> }) => ({
            id: s.id,
            title: s.title,
            description: s.description ?? "",
            expanded: true,
            items: (s.items ?? []).map((item) => ({
              id: item.id,
              text: item.text,
              description: item.description ?? "",
              responseType: item.responseType,
              options: Array.isArray(item.options) ? item.options.join("\n") : "",
              scoreValue: item.scoreValue !== null && item.scoreValue !== undefined ? String(item.scoreValue) : "",
              isRequired: item.isRequired ?? false,
            })),
          }))
        );
        setLoading(false);
      })
      .catch(() => { toast.error("Failed to load template"); setLoading(false); });
  }, [templateId]);

  function updateSection(idx: number, field: keyof Section, value: unknown) {
    setSections((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }
  function addSection() { setSections((prev) => [...prev, { title: "", description: "", expanded: true, items: [{ text: "", description: "", responseType: "YES_NO", options: "", scoreValue: "", isRequired: false }] }]); }
  function removeSection(idx: number) { setSections((prev) => prev.filter((_, i) => i !== idx)); }
  function addItem(sIdx: number) { setSections((prev) => prev.map((s, i) => i === sIdx ? { ...s, items: [...s.items, { text: "", description: "", responseType: "YES_NO", options: "", scoreValue: "", isRequired: false }] } : s)); }
  function removeItem(sIdx: number, iIdx: number) { setSections((prev) => prev.map((s, i) => i === sIdx ? { ...s, items: s.items.filter((_, ii) => ii !== iIdx) } : s)); }
  function updateItem(sIdx: number, iIdx: number, field: keyof Item, value: unknown) {
    setSections((prev) => prev.map((s, i) =>
      i === sIdx ? { ...s, items: s.items.map((item, ii) => ii === iIdx ? { ...item, [field]: value } : item) } : s
    ));
  }

  async function handleSave() {
    if (!name.trim()) return toast.error("Name required");
    if (sections.some((s) => !s.title.trim())) return toast.error("All sections need a title");
    if (sections.some((s) => s.items.some((item) => !item.text.trim()))) return toast.error("All items need text");

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        category: category || null,
        version,
        scoringMethod,
        sections: sections.map((s, si) => ({
          title: s.title,
          description: s.description || null,
          sortOrder: si,
          items: s.items.map((item, ii) => ({
            text: item.text,
            description: item.description || null,
            responseType: item.responseType,
            options: (item.responseType === "SINGLE_SELECT" || item.responseType === "MULTI_SELECT")
              ? item.options.split("\n").map((o) => o.trim()).filter(Boolean)
              : null,
            scoreValue: item.scoreValue ? parseFloat(item.scoreValue) : null,
            isRequired: item.isRequired,
            sortOrder: ii,
          })),
        })),
      };

      const res = await fetch(`/smart-steps/api/assessments/templates/${templateId}/rebuild`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save");
      }

      toast.success("Template saved");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <div className="glass-card skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/assessments" className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Edit template</h1>
            <p className="text-zinc-500 text-sm">{name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
        </button>
      </motion.div>

      <div className="space-y-6">
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Template info</h2>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="field-input w-full resize-none" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="field-input w-full">
                <option value="">Select…</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Version</label>
              <input value={version} onChange={(e) => setVersion(e.target.value)} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Scoring</label>
              <select value={scoringMethod} onChange={(e) => setScoringMethod(e.target.value)} className="field-input w-full">
                {SCORING_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="glass-card rounded-2xl overflow-hidden border border-[var(--glass-border)]">
              <div className="flex items-center gap-3 p-4 bg-[var(--glass-bg)]/40">
                <button type="button" onClick={() => updateSection(sIdx, "expanded", !section.expanded)} className="text-zinc-400">
                  {section.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className="text-xs text-zinc-500 shrink-0">§{sIdx + 1}</span>
                <input
                  value={section.title}
                  onChange={(e) => updateSection(sIdx, "title", e.target.value)}
                  placeholder="Section title…"
                  className="flex-1 bg-transparent text-sm font-medium text-[var(--foreground)] placeholder:text-zinc-600 outline-none"
                />
                <span className="text-xs text-zinc-600">{section.items.length} item{section.items.length !== 1 ? "s" : ""}</span>
                {sections.length > 1 && (
                  <button type="button" onClick={() => removeSection(sIdx)} className="text-zinc-600 hover:text-[var(--accent-pink)] p-1">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <AnimatePresence>
                {section.expanded && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="p-4 space-y-3">
                      <input value={section.description} onChange={(e) => updateSection(sIdx, "description", e.target.value)} placeholder="Section description (optional)" className="field-input w-full text-sm" />
                      {section.items.map((item, iIdx) => (
                        <div key={iIdx} className="rounded-xl border border-[var(--glass-border)] p-3 space-y-2">
                          <div className="flex gap-2">
                            <input required value={item.text} onChange={(e) => updateItem(sIdx, iIdx, "text", e.target.value)} placeholder={`Item ${iIdx + 1}…`} className="field-input flex-1 text-sm" />
                            <select value={item.responseType} onChange={(e) => updateItem(sIdx, iIdx, "responseType", e.target.value)} className="field-input text-sm">
                              {RESPONSE_TYPES.map((rt) => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                            </select>
                            {section.items.length > 1 && (
                              <button type="button" onClick={() => removeItem(sIdx, iIdx)} className="text-zinc-600 hover:text-[var(--accent-pink)] p-1.5"><Trash2 className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <input value={item.description} onChange={(e) => updateItem(sIdx, iIdx, "description", e.target.value)} placeholder="Definition (optional)" className="field-input text-sm col-span-2" />
                            <input type="number" value={item.scoreValue} onChange={(e) => updateItem(sIdx, iIdx, "scoreValue", e.target.value)} placeholder="Max score" className="field-input text-sm" />
                          </div>
                          {(item.responseType === "SINGLE_SELECT" || item.responseType === "MULTI_SELECT") && (
                            <textarea value={item.options} onChange={(e) => updateItem(sIdx, iIdx, "options", e.target.value)} placeholder={"Option A\nOption B\nOption C"} rows={3} className="field-input w-full text-sm resize-none" />
                          )}
                          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                            <input type="checkbox" checked={item.isRequired} onChange={(e) => updateItem(sIdx, iIdx, "isRequired", e.target.checked)} className="rounded" />
                            Required
                          </label>
                        </div>
                      ))}
                      <button type="button" onClick={() => addItem(sIdx)} className="w-full flex items-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-3 py-2 text-xs text-zinc-500 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add item
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        <button type="button" onClick={addSection} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--glass-border)] py-3 text-sm text-zinc-500 hover:border-[var(--accent-purple)]/50 hover:text-[var(--accent-purple)] transition-colors">
          <Plus className="h-4 w-4" /> Add section
        </button>
      </div>
    </div>
  );
}
