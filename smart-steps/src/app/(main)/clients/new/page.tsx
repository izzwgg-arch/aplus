"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";

const COMMON_DIAGNOSES = ["ASD", "ADHD", "ID", "ODD", "SPD", "Down Syndrome", "Cerebral Palsy", "Apraxia", "Other"];

export default function NewClientPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [diagnosisInput, setDiagnosisInput] = useState("");

  const [form, setForm] = useState({
    name: "",
    dob: "",
    diagnosis: [] as string[],
    guardianName: "",
    guardianEmail: "",
    guardianPhone: "",
    address: "",
    school: "",
    insuranceId: "",
    intakeNotes: "",
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addDiagnosis(d: string) {
    const trimmed = d.trim();
    if (!trimmed || form.diagnosis.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, diagnosis: [...prev.diagnosis, trimmed] }));
    setDiagnosisInput("");
  }

  function removeDiagnosis(d: string) {
    setForm((prev) => ({ ...prev, diagnosis: prev.diagnosis.filter((x) => x !== d) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.dob) return toast.error("Date of birth is required");

    setSaving(true);
    try {
      const res = await fetch("/smart-steps/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Failed to create client");

      toast.success(`${form.name} added successfully`);
      router.push(`/clients/${data.id}`);
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center gap-4">
        <Link
          href="/clients"
          className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">New client</h1>
          <p className="text-zinc-500 text-sm">Fill in the client details below</p>
        </div>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        {/* Core details */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Core details</h2>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Full name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Alex Johnson"
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Date of birth <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input
              required
              type="date"
              value={form.dob}
              onChange={(e) => set("dob", e.target.value)}
              className="field-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Diagnosis</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.diagnosis.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-purple)]/20 px-3 py-1 text-xs text-[var(--accent-purple)]"
                >
                  {d}
                  <button type="button" onClick={() => removeDiagnosis(d)}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={diagnosisInput}
                onChange={(e) => setDiagnosisInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addDiagnosis(diagnosisInput); }
                }}
                placeholder="Type and press Enter…"
                className="field-input flex-1"
              />
              <button
                type="button"
                onClick={() => addDiagnosis(diagnosisInput)}
                className="btn-secondary tap-target rounded-xl px-3"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COMMON_DIAGNOSES.filter((d) => !form.diagnosis.includes(d)).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => addDiagnosis(d)}
                  className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Guardian */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Guardian / caregiver</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Guardian name</label>
              <input type="text" value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} placeholder="Parent or caregiver name" className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Guardian email</label>
              <input type="email" value={form.guardianEmail} onChange={(e) => set("guardianEmail", e.target.value)} placeholder="email@example.com" className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Guardian phone</label>
              <input type="tel" value={form.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} placeholder="(555) 000-0000" className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">School</label>
              <input type="text" value={form.school} onChange={(e) => set("school", e.target.value)} placeholder="School or program name" className="field-input w-full" />
            </div>
          </div>
        </div>

        {/* Additional */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Additional info</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Address</label>
              <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Home address" className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Insurance ID</label>
              <input type="text" value={form.insuranceId} onChange={(e) => set("insuranceId", e.target.value)} placeholder="Insurance member ID" className="field-input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Intake notes</label>
            <textarea
              value={form.intakeNotes}
              onChange={(e) => set("intakeNotes", e.target.value)}
              rows={4}
              placeholder="Background information, referral source, initial concerns…"
              className="field-input w-full resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary tap-target flex-1 rounded-xl py-3 font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create client"}
          </button>
          <Link
            href="/clients"
            className="btn-secondary tap-target rounded-xl px-6 py-3 text-center"
          >
            Cancel
          </Link>
        </div>
      </motion.form>
    </div>
  );
}
