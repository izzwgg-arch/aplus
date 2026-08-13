import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";

export default function AssessmentsPage() {
  const toast = useToast();
  const [assessments, setAssessments] = useState([]);
  const [clients, setClients] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ clientId: "", title: "", status: "DRAFT", contentJson: "{}" });

  const load = async () => {
    const [assessmentRes, clientRes] = await Promise.all([api.get("/assessments"), api.get("/clients")]);
    setAssessments(assessmentRes.data);
    setClients(clientRes.data);
  };

  useEffect(() => {
    load().catch(() => toast?.error("Failed to load assessments."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const contentJson = form.contentJson ? JSON.parse(form.contentJson) : null;
      await api.post("/assessments", { ...form, contentJson });
      setForm({ clientId: "", title: "", status: "DRAFT", contentJson: "{}" });
      await load();
      toast?.success("Assessment saved.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save assessment.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Assessments</h1>
        <p className="mt-2 text-sm text-slate-600">Create and store client assessments with draft/final statuses.</p>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <section className="card self-start">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">New Assessment</h2>
          <form onSubmit={submit} className="space-y-3">
            <select className="saas-input" value={form.clientId} onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}>
              <option value="">Select Client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.fullName}</option>)}
            </select>
            <input className="saas-input" placeholder="Assessment title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            <select className="saas-input" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <textarea className="saas-textarea min-h-[120px] font-mono text-xs" value={form.contentJson} onChange={(e) => setForm((prev) => ({ ...prev, contentJson: e.target.value }))} />
            <button className="btn-primary" disabled={isSaving}>{isSaving ? "Saving..." : "Save Assessment"}</button>
          </form>
        </section>
        <section className="card flex min-h-0 flex-col">
          <h2 className="mb-3 shrink-0 text-lg font-semibold text-slate-900">Previous Assessments</h2>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto">
            {assessments.map((assessment) => (
              <article key={assessment.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-slate-900">{assessment.title}</p>
                <p className="text-sm text-slate-600">Status: {assessment.status}</p>
                <p className="text-xs text-slate-500">{new Date(assessment.updatedAt).toLocaleString()}</p>
              </article>
            ))}
            {!assessments.length && <div className="empty-state">No assessments created yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
