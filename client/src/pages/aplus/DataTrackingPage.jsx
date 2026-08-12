import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";

export default function DataTrackingPage() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [clients, setClients] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ clientId: "", title: "", value: "", notes: "" });

  const load = async () => {
    const [tracking, clientData] = await Promise.all([api.get("/data-tracking"), api.get("/clients")]);
    setEntries(tracking.data);
    setClients(clientData.data);
  };

  useEffect(() => {
    load().catch(() => toast?.error("Failed to load data tracking."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await api.post("/data-tracking", form);
      setForm({ clientId: "", title: "", value: "", notes: "" });
      await load();
      toast?.success("Data entry saved.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save data entry.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Data Tracking</h1>
        <p className="mt-2 text-sm text-slate-600">Save client-linked data points and review historical trends.</p>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <section className="card self-start">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Add Entry</h2>
          <form onSubmit={submit} className="space-y-3">
            <select className="saas-input" value={form.clientId} onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}>
              <option value="">Select Client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.fullName}</option>)}
            </select>
            <input className="saas-input" placeholder="Metric title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            <input className="saas-input" placeholder="Value" value={form.value} onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))} />
            <textarea className="saas-textarea min-h-[90px]" placeholder="Notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
            <button className="btn-primary" disabled={isSaving}>{isSaving ? "Saving..." : "Save Entry"}</button>
          </form>
        </section>
        <section className="card flex min-h-0 flex-col">
          <h2 className="mb-3 shrink-0 text-lg font-semibold text-slate-900">History</h2>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto">
            {entries.map((entry) => (
              <article key={entry.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-slate-900">{entry.title}: {entry.value}</p>
                <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                {entry.notes && <p className="mt-1 text-sm text-slate-600">{entry.notes}</p>}
              </article>
            ))}
            {!entries.length && <div className="empty-state">No data tracking entries yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
