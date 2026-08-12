"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/common/RequirePermission";

type AssessmentItem = {
  id: string;
  text: string;
  description?: string | null;
  responseType: string;
  options?: string[] | null;
  scoreValue?: number | null;
  isRequired: boolean;
  sortOrder: number;
};

type Section = {
  id: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  items: AssessmentItem[];
};

type AssessmentDetail = {
  id: string;
  clientId: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  totalScore?: number | null;
  notes?: string | null;
  template: {
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    scoringMethod?: string | null;
    sections: Section[];
  };
  responses: Array<{
    id: string;
    itemId: string;
    responseValue?: string | null;
    responseScore?: number | null;
    notes?: string | null;
  }>;
  completedBy?: { name: string | null; role: string } | null;
};

const PROMPT_LEVELS = ["Independent", "Verbal Prompt", "Gestural", "Model", "Partial Physical", "Full Physical", "Not Observed"];

function ResponseInput({
  item,
  value,
  onChange,
}: {
  item: AssessmentItem;
  value: string;
  onChange: (v: string) => void;
}) {
  switch (item.responseType) {
    case "YES_NO":
      return (
        <div className="flex gap-3">
          {["Yes", "No"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(value === opt ? "" : opt)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition-all ${
                value === opt
                  ? opt === "Yes" ? "border-emerald-400 bg-emerald-400/20 text-emerald-300" : "border-[var(--accent-pink)] bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                  : "border-[var(--glass-border)] text-zinc-400 hover:border-[var(--glass-border)]/80"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );

    case "SCALE":
      return (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(value === String(n) ? "" : String(n))}
              className={`h-10 w-10 rounded-xl text-sm font-bold border transition-all ${
                value === String(n) ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" : "border-[var(--glass-border)] text-zinc-400 hover:border-[var(--accent-cyan)]/40"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      );

    case "NUMERIC":
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field-input w-32"
          placeholder="0"
        />
      );

    case "PERCENTAGE":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="100"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="field-input w-24"
            placeholder="0"
          />
          <span className="text-zinc-400">%</span>
        </div>
      );

    case "TEXT":
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="field-input w-full resize-none"
          placeholder="Enter notes or observations…"
        />
      );

    case "SINGLE_SELECT":
      return (
        <div className="flex flex-wrap gap-2">
          {(item.options ?? []).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(value === opt ? "" : opt)}
              className={`rounded-xl px-3 py-2 text-sm border transition-all ${
                value === opt ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]" : "border-[var(--glass-border)] text-zinc-400 hover:border-[var(--accent-cyan)]/40"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      );

    case "MULTI_SELECT": {
      const selected = value ? value.split(",") : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(item.options ?? []).map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const next = isSelected ? selected.filter((s) => s !== opt) : [...selected, opt];
                  onChange(next.join(","));
                }}
                className={`rounded-xl px-3 py-2 text-sm border transition-all ${
                  isSelected ? "border-[var(--accent-purple)] bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]" : "border-[var(--glass-border)] text-zinc-400 hover:border-[var(--accent-purple)]/40"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    case "PROMPT_LEVEL":
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field-input"
        >
          <option value="">Select prompt level…</option>
          {PROMPT_LEVELS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}
        </select>
      );

    default:
      return (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="field-input w-full" placeholder="Enter response…" />
      );
  }
}

function getScore(item: AssessmentItem, value: string): number | null {
  if (!value || item.scoreValue === null || item.scoreValue === undefined) return null;
  switch (item.responseType) {
    case "YES_NO": return value === "Yes" ? item.scoreValue : 0;
    case "SCALE": return ((parseFloat(value) - 1) / 4) * item.scoreValue;
    case "NUMERIC": case "PERCENTAGE": {
      const n = parseFloat(value);
      if (isNaN(n)) return null;
      if (item.responseType === "PERCENTAGE") return (n / 100) * item.scoreValue;
      return Math.min(n, item.scoreValue);
    }
    default: return value ? item.scoreValue : 0;
  }
}

export default function AssessmentDetailPage() {
  return (
    <RequirePermission anyOf={["smartsteps.assessments.view.all"]}>
      <AssessmentDetailPageInner />
    </RequirePermission>
  );
}

function AssessmentDetailPageInner() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const assessmentId = String(params.assessmentId ?? "");
  const router = useRouter();

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/smart-steps/api/clients/${clientId}/assessments/${assessmentId}`)
      .then((r) => r.json())
      .then((data) => {
        setAssessment(data);
        const initial: Record<string, string> = {};
        for (const r of data.responses ?? []) {
          if (r.itemId) initial[r.itemId] = r.responseValue ?? "";
        }
        setResponses(initial);
        setLoading(false);
      })
      .catch(() => { toast.error("Failed to load assessment"); setLoading(false); });
  }, [assessmentId, clientId]);

  function setResponse(itemId: string, value: string) {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
    // Auto-save after 2s idle
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveResponses({ ...responses, [itemId]: value }), 2000);
  }

  async function saveResponses(currentResponses: Record<string, string> = responses) {
    if (!assessment) return;
    setSaving(true);
    try {
      const allItems = assessment.template.sections.flatMap((s) => s.items);
      const payload = allItems.map((item) => {
        const value = currentResponses[item.id] ?? "";
        return {
          itemId: item.id,
          responseValue: value || null,
          responseScore: value ? getScore(item, value) : null,
        };
      });

      await fetch(`/smart-steps/api/clients/${clientId}/assessments/${assessmentId}/responses`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: payload }),
      });
    } catch {
      // Silent fail for auto-save
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveResponses();
      toast.success("Progress saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!assessment) return;
    const allItems = assessment.template.sections.flatMap((s) => s.items);
    const required = allItems.filter((i) => i.isRequired);
    const missing = required.filter((i) => !responses[i.id]);
    if (missing.length > 0) {
      toast.error(`${missing.length} required item${missing.length > 1 ? "s" : ""} not answered`);
      return;
    }

    setCompleting(true);
    try {
      await saveResponses();
      const res = await fetch(`/smart-steps/api/clients/${clientId}/assessments/${assessmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Assessment completed!");
      router.push(`/clients/${clientId}/assessments`);
    } catch {
      toast.error("Failed to complete assessment");
    } finally {
      setCompleting(false);
    }
  }

  if (loading || !assessment) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <div className="glass-card skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const isCompleted = assessment.status === "COMPLETED";
  const allItems = assessment.template.sections.flatMap((s) => s.items);
  const answeredCount = allItems.filter((i) => responses[i.id]).length;
  const progressPct = allItems.length > 0 ? Math.round((answeredCount / allItems.length) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-start gap-4">
        <Link href={`/clients/${clientId}/assessments`} className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)] shrink-0 mt-0.5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--foreground)]">{assessment.template.name}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full ${isCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
              {isCompleted ? "Completed" : "In progress"}
            </span>
          </div>
          <p className="text-zinc-500 text-sm mt-0.5">
            Started {new Date(assessment.startedAt).toLocaleDateString()}
            {assessment.completedAt && ` · Completed ${new Date(assessment.completedAt).toLocaleDateString()}`}
          </p>

          {!isCompleted && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>{answeredCount}/{allItems.length} items answered</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--glass-border)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent-cyan)] transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </div>

        {!isCompleted && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-secondary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="btn-primary tap-target inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              <CheckCircle className="h-4 w-4" />
              {completing ? "Completing…" : "Complete"}
            </button>
          </div>
        )}
      </motion.div>

      {assessment.totalScore !== null && assessment.totalScore !== undefined && (
        <div className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-4">
          <div className="rounded-xl bg-[var(--accent-cyan)]/20 p-3">
            <CheckCircle className="h-6 w-6 text-[var(--accent-cyan)]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--foreground)]">{assessment.totalScore.toFixed(1)}</p>
            <p className="text-xs text-zinc-500">Total score</p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {assessment.template.sections.map((section, sIdx) => (
          <motion.section
            key={section.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sIdx * 0.04 }}
            className="glass-card rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-4 bg-[var(--glass-bg)]/50 border-b border-[var(--glass-border)]">
              <h2 className="font-semibold text-[var(--foreground)]">{section.title}</h2>
              {section.description && <p className="text-xs text-zinc-500 mt-0.5">{section.description}</p>}
            </div>

            <div className="p-5 space-y-6">
              {section.items.map((item, iIdx) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-zinc-600 mt-0.5 shrink-0 w-6">{sIdx + 1}.{iIdx + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {item.text}
                        {item.isRequired && <span className="text-[var(--accent-pink)] ml-1">*</span>}
                      </p>
                      {item.description && <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>}
                    </div>
                    {item.scoreValue !== null && item.scoreValue !== undefined && (
                      <span className="text-xs text-zinc-600 shrink-0">{item.scoreValue} pts</span>
                    )}
                  </div>

                  {isCompleted ? (
                    <div className="ml-8 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] px-3 py-2 text-sm text-zinc-300">
                      {responses[item.id] || <span className="text-zinc-600 italic">No response</span>}
                    </div>
                  ) : (
                    <div className="ml-8">
                      <ResponseInput
                        item={item}
                        value={responses[item.id] ?? ""}
                        onChange={(v) => setResponse(item.id, v)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      {!isCompleted && (
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={handleSave} disabled={saving} className="btn-secondary flex-1 tap-target rounded-xl py-3 disabled:opacity-60">
            {saving ? "Saving…" : "Save progress"}
          </button>
          <button type="button" onClick={handleComplete} disabled={completing} className="btn-primary flex-1 tap-target rounded-xl py-3 font-semibold disabled:opacity-60">
            {completing ? "Completing…" : "Mark complete"}
          </button>
        </div>
      )}
    </div>
  );
}
