"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, X, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const COMMON_DIAGNOSES = ["ASD", "ADHD", "ID", "ODD", "SPD", "Down Syndrome", "Cerebral Palsy", "Apraxia", "Other"];

export default function EditClientPage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diagnosisInput, setDiagnosisInput] = useState("");

  // Staff assignments
  // email is null for record-only providers (added with a name and no login).
  const [assignments, setAssignments] = useState<Array<{ id: string; userId: string; role: string; name: string | null; email: string | null }>>([]);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string | null; email: string | null; role: string }>>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState("RBT");
  const [assignSaving, setAssignSaving] = useState(false);

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

  useEffect(() => {
    async function load() {
      try {
        const [clientRes, usersRes] = await Promise.all([
          fetch(`/smart-steps/api/clients/${clientId}`),
          fetch("/smart-steps/api/users").catch(() => null),
        ]);
        if (!clientRes.ok) throw new Error("Failed");
        const data = await clientRes.json();
        setForm({
          name: data.name ?? "",
          dob: data.dob ?? "",
          diagnosis: data.diagnosis ?? [],
          guardianName: data.guardianName ?? "",
          guardianEmail: data.guardianEmail ?? "",
          guardianPhone: data.guardianPhone ?? "",
          address: data.address ?? "",
          school: data.school ?? "",
          insuranceId: data.insuranceId ?? "",
          intakeNotes: data.intakeNotes ?? "",
        });
        if (data.assignments) setAssignments(data.assignments);
        if (usersRes?.ok) {
          const users = await usersRes.json();
          setAllUsers(Array.isArray(users) ? users : []);
        }
      } catch {
        toast.error("Failed to load client");
      } finally {
        setLoading(false);
      }
    }
    if (clientId) load();
  }, [clientId]);

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
      const res = await fetch(`/smart-steps/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Failed to update client");

      toast.success("Client updated");
      router.push(`/clients/${clientId}`);
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Archive this client? They will no longer appear in the client list.")) return;
    try {
      const res = await fetch(`/smart-steps/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Client archived");
      router.push("/clients");
    } catch {
      toast.error("Failed to archive client");
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-2xl">
        <div className="glass-card skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center gap-4">
        <Link
          href={`/clients/${clientId}`}
          className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Edit client</h1>
          <p className="text-zinc-500 text-sm">Update client profile and details</p>
        </div>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Core details</h2>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Full name <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input required type="text" value={form.name} onChange={(e) => set("name", e.target.value)} className="field-input w-full" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Date of birth <span className="text-[var(--accent-pink)]">*</span>
            </label>
            <input required type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} className="field-input w-full" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Diagnosis</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.diagnosis.map((d) => (
                <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-purple)]/20 px-3 py-1 text-xs text-[var(--accent-purple)]">
                  {d}
                  <button type="button" onClick={() => removeDiagnosis(d)}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={diagnosisInput} onChange={(e) => setDiagnosisInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDiagnosis(diagnosisInput); } }}
                placeholder="Add diagnosis…" className="field-input flex-1" />
              <button type="button" onClick={() => addDiagnosis(diagnosisInput)} className="btn-secondary tap-target rounded-xl px-3"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COMMON_DIAGNOSES.filter((d) => !form.diagnosis.includes(d)).map((d) => (
                <button key={d} type="button" onClick={() => addDiagnosis(d)} className="rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/50 hover:text-[var(--accent-cyan)] transition-colors">{d}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Guardian / caregiver</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Guardian name</label>
              <input type="text" value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Guardian email</label>
              <input type="email" value={form.guardianEmail} onChange={(e) => set("guardianEmail", e.target.value)} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Guardian phone</label>
              <input type="tel" value={form.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">School</label>
              <input type="text" value={form.school} onChange={(e) => set("school", e.target.value)} className="field-input w-full" />
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Additional info</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Address</label>
              <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Insurance ID</label>
              <input type="text" value={form.insuranceId} onChange={(e) => set("insuranceId", e.target.value)} className="field-input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Intake notes</label>
            <textarea value={form.intakeNotes} onChange={(e) => set("intakeNotes", e.target.value)} rows={4} className="field-input w-full resize-none" />
          </div>
        </div>

        {/* Staff assignments */}
        {allUsers.length > 0 && (
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[var(--accent-cyan)]" />
              <h2 className="font-semibold text-[var(--foreground)]">Assigned staff</h2>
            </div>

            {assignments.length > 0 ? (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-[var(--foreground)]">{a.name ?? a.email ?? "(no name)"}</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                        a.role === "BCBA" ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                        : "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]"
                      }`}>{a.role}</span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch(`/smart-steps/api/clients/${clientId}/assignments?userId=${a.userId}`, { method: "DELETE" });
                        if (res.ok) {
                          setAssignments((prev) => prev.filter((x) => x.userId !== a.userId));
                          toast.success("Assignment removed");
                        }
                      }}
                      className="rounded-lg p-1.5 text-zinc-600 hover:text-[var(--accent-pink)] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No staff assigned yet</p>
            )}

            <div className="flex gap-2">
              <select
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                className="field-input flex-1 text-sm"
              >
                <option value="">Select staff member…</option>
                {allUsers
                  .filter((u) => !assignments.find((a) => a.userId === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email ?? "(no name)"} ({u.role})</option>
                  ))}
              </select>
              <select
                value={assignRole}
                onChange={(e) => setAssignRole(e.target.value)}
                className="field-input text-sm"
              >
                <option value="RBT">RBT</option>
                <option value="BCBA">BCBA</option>
              </select>
              <button
                type="button"
                disabled={!assignUserId || assignSaving}
                onClick={async () => {
                  if (!assignUserId) return;
                  setAssignSaving(true);
                  try {
                    const res = await fetch(`/smart-steps/api/clients/${clientId}/assignments`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: assignUserId, assignmentRole: assignRole }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    const user = allUsers.find((u) => u.id === assignUserId);
                    setAssignments((prev) => [...prev, {
                      id: data.id,
                      userId: assignUserId,
                      role: assignRole,
                      name: user?.name ?? null,
                      email: user?.email ?? null,
                    }]);
                    setAssignUserId("");
                    toast.success("Staff assigned");
                  } catch (err) {
                    toast.error(String(err));
                  } finally {
                    setAssignSaving(false);
                  }
                }}
                className="btn-primary tap-target rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {assignSaving ? "…" : "Assign"}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary tap-target flex-1 rounded-xl py-3 font-semibold disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/clients/${clientId}`} className="btn-secondary tap-target rounded-xl px-6 py-3 text-center">Cancel</Link>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-amber-500/20">
          <h3 className="text-sm font-semibold text-amber-400 mb-1">Danger zone</h3>
          <p className="text-xs text-zinc-500 mb-3">Archiving hides this client from the list but preserves all data.</p>
          <button type="button" onClick={handleArchive} className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors">
            Archive client
          </button>
        </div>
      </motion.form>
    </div>
  );
}
