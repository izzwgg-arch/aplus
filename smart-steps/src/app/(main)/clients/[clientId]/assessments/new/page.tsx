"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/common/RequirePermission";

type Template = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  sections: { id: string; title: string; items: { id: string }[] }[];
};

export default function NewClientAssessmentPage() {
  return (
    <RequirePermission anyOf={["smartsteps.assessments.create", "smartsteps.assessment_templates.view"]}>
      <NewClientAssessmentPageInner />
    </RequirePermission>
  );
}

function NewClientAssessmentPageInner() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/smart-steps/api/assessments/templates")
      .then((r) => r.json())
      .then((data) => { setTemplates(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleStart() {
    if (!selectedId) return toast.error("Please select a template");
    setSaving(true);
    try {
      const res = await fetch(`/smart-steps/api/clients/${clientId}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Assessment started");
      router.push(`/clients/${clientId}/assessments/${data.id}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center gap-4">
        <Link href={`/clients/${clientId}/assessments`} className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Start new assessment</h1>
          <p className="text-zinc-500 text-sm">Select a template to begin</p>
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="glass-card skeleton h-20 rounded-2xl" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-border)] py-16 text-center">
          <ClipboardList className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium mb-1">No assessment templates available</p>
          <p className="text-zinc-600 text-sm mb-4">Create a template first before assigning it to a client</p>
          <Link href="/assessments/new" className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            Create template
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {templates.map((t) => {
              const itemCount = t.sections.reduce((a, s) => a + s.items.length, 0);
              const selected = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left rounded-2xl p-4 border transition-all ${
                    selected
                      ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10"
                      : "border-[var(--glass-border)] glass-card hover:border-[var(--accent-cyan)]/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--foreground)]">{t.name}</p>
                      {t.description && <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>}
                      <p className="text-xs text-zinc-600 mt-1">
                        {t.sections.length} section{t.sections.length !== 1 ? "s" : ""} · {itemCount} item{itemCount !== 1 ? "s" : ""}
                        {t.category && ` · ${t.category}`}
                      </p>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                      selected ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]" : "border-[var(--glass-border)]"
                    }`}>
                      {selected && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={!selectedId || saving}
              className="btn-primary flex-1 tap-target rounded-xl py-3 font-semibold disabled:opacity-60"
            >
              {saving ? "Starting…" : "Start assessment"}
            </button>
            <Link href={`/clients/${clientId}/assessments`} className="btn-secondary tap-target rounded-xl px-6 py-3 text-center">
              Cancel
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
