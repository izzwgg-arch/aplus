import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import useHotkey from "../../hooks/useHotkey";

export default function WaitlistPage() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ clientId: "", notes: "", priority: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [focusAdd, setFocusAdd] = useState(false);

  useHotkey({
    key: "n",
    ctrlOrMeta: true,
    onTrigger: () => setFocusAdd(true)
  });

  const load = async () => {
    setIsLoading(true);
    try {
      const [w, c] = await Promise.all([api.get("/waitlist"), api.get("/clients")]);
      setEntries(w.data);
      setClients(c.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.clientId) {
      toast?.error("Select a client first.");
      return;
    }
    setIsSaving(true);
    const optimisticId = `temp-wait-${Date.now()}`;
    const selectedClient = clients.find((client) => client.id === form.clientId);
    const optimisticEntry = {
      id: optimisticId,
      priority: Number(form.priority || 1),
      client: selectedClient || { fullName: "New waitlist client" }
    };
    setEntries((prev) => [optimisticEntry, ...prev]);
    try {
      await api.post("/waitlist", { ...form, priority: Number(form.priority) });
      setForm({ clientId: "", notes: "", priority: 1 });
      setEntries((prev) => prev.filter((entry) => entry.id !== optimisticId));
      await load();
      toast?.success("Client added to waitlist.");
    } catch {
      setEntries((prev) => prev.filter((entry) => entry.id !== optimisticId));
      toast?.error("Could not add waitlist entry.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Waitlist</h1>
        <p className="mt-1 text-sm text-slate-500">Track clients awaiting availability and prioritize follow-up.</p>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
      <div className="card card-hover flex min-h-0 flex-col">
        <h2 className="mb-4 shrink-0 text-lg font-semibold text-slate-900">Current Waitlist</h2>
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
          {isLoading && Array.from({ length: 4 }).map((_, idx) => (
            <li key={`wait-skeleton-${idx}`} className="rounded-lg border border-slate-200 px-4 py-3">
              <div className="skeleton-line w-40" />
              <div className="mt-2 skeleton-line w-20" />
            </li>
          ))}
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
              <p className="font-medium text-slate-900">{entry.client.fullName}</p>
              <p className="text-sm text-slate-600">Priority {entry.priority}</p>
            </li>
          ))}
          {!isLoading && entries.length === 0 && <li className="empty-state">No waitlist entries yet.</li>}
        </ul>
      </div>
      <div className="card card-hover self-start">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add to Waitlist</h2>
        <form onSubmit={submit} className="space-y-4">
          <select
            className="saas-input"
            autoFocus={focusAdd}
            value={form.clientId}
            onChange={(e) => {
              setFocusAdd(false);
              setForm({ ...form, clientId: e.target.value });
            }}
          >
            <option value="">Select Client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
          <input className="saas-input" type="number" min="1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          <textarea className="saas-textarea min-h-[100px]" placeholder="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn-primary" disabled={isSaving}>{isSaving ? "Adding..." : "Add"}</button>
        </form>
      </div>
      </div>
    </div>
  );
}
