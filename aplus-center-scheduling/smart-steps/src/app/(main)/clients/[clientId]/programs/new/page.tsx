"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const DOMAINS = ["Mand", "Tact", "Intraverbal", "Echoic", "Social", "ADL", "Academic", "Motor", "Other"];

export default function NewProgramPage() {
  const params = useParams();
  const clientId = String(params.clientId ?? "");
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("Mand");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/smart-steps/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name: name.trim(), domain, description }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Category "${name}" created.`);
      router.push(`/clients/${clientId}/programs`);
    } catch {
      toast.error("Failed to create category.");
      setSaving(false);
    }
  }

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8 flex items-center gap-3">
          <Link
            href={`/clients/${clientId}/programs`}
            className="tap-target rounded-xl p-2 text-zinc-400 hover:bg-[var(--glass-bg)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">New Category</h1>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-6">
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Category name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Communication, Manding, Social Skills"
                required
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Domain *</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20"
              >
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the program goals"
                rows={3}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/20 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/clients/${clientId}/programs`}
              className="tap-target flex-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] py-3 text-center text-sm text-zinc-400 hover:text-[var(--foreground)]"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn-primary tap-target flex-1 rounded-xl py-3 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create Category"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
