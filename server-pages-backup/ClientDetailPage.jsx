import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";

const tabs = ["Overview", "Appointments", "Invoices", "Payments", "Assessments", "Documents", "Activity"];

export default function ClientDetailPage() {
  const toast = useToast();
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("Overview");
  const [client, setClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/clients/${id}`);
      setClient(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => toast?.error("Failed to load client details."));
  }, [id]);

  const activityItems = useMemo(() => {
    if (!client) return [];
    return [
      ...client.documents.map((item) => ({ type: "Document", at: item.uploadedAt, label: item.fileName })),
      ...client.assessments.map((item) => ({ type: "Assessment", at: item.updatedAt, label: item.title })),
      ...client.invoices.map((item) => ({ type: "Invoice", at: item.updatedAt, label: item.invoiceNumber }))
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [client]);

  const paymentSummary = useMemo(() => {
    if (!client) return { paid: 0, refunded: 0 };
    const paid = client.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const refunded = client.payments.reduce((sum, payment) => sum + Number(payment.refundedAmount || 0), 0);
    return { paid, refunded };
  }, [client]);

  const syncQuickbooks = async () => {
    try {
      await api.post(`/clients/${id}/sync/quickbooks`);
      toast?.success("Client sync to QuickBooks started.");
    } catch (error) {
      toast?.error(error?.response?.data?.error || "QuickBooks sync failed.");
    }
  };

  if (isLoading) return <div className="card"><div className="skeleton h-8 w-48" /></div>;
  if (!client) return <div className="card"><div className="empty-state">Client not found.</div></div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{client.fullName}</h1>
            <p className="text-sm text-slate-500">{client.email} · {client.phone}</p>
            <p className="text-xs text-slate-500">Status: {client.status}</p>
          </div>
          <button className="btn-secondary" onClick={syncQuickbooks}>Sync to QuickBooks</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? "btn-primary" : "btn-secondary"} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "Overview" && (
        <div className="card grid gap-3 sm:grid-cols-2">
          <p><strong>DOB:</strong> {new Date(client.dob).toLocaleDateString()}</p>
          <p><strong>Insurance:</strong> {client.insurance || "-"}</p>
          <p><strong>Address:</strong> {client.address || "-"}</p>
          <p><strong>ZIP:</strong> {client.zip || "-"}</p>
          <p><strong>Notes:</strong> {client.notes || "-"}</p>
        </div>
      )}

      {activeTab === "Appointments" && (
        <div className="card space-y-2">
          {client.appointments.map((appt) => (
            <div key={appt.id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{appt.title}</p>
              <p className="text-sm text-slate-600">{new Date(appt.startsAt).toLocaleString()} · {appt.status}</p>
            </div>
          ))}
          {!client.appointments.length && <div className="empty-state">No appointments.</div>}
        </div>
      )}

      {activeTab === "Invoices" && (
        <div className="card space-y-2">
          {client.invoices.map((invoice) => (
            <div key={invoice.id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{invoice.invoiceNumber}</p>
              <p className="text-sm text-slate-600">Total ${invoice.total.toFixed(2)} · Balance ${invoice.balanceDue.toFixed(2)} · {invoice.status}</p>
            </div>
          ))}
          {!client.invoices.length && <div className="empty-state">No invoices.</div>}
        </div>
      )}

      {activeTab === "Payments" && (
        <div className="card space-y-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-slate-600">Total paid ${paymentSummary.paid.toFixed(2)} · Total refunded ${paymentSummary.refunded.toFixed(2)}</p>
            <Link className="btn-secondary" to={`/aplus/payments?clientId=${client.id}`}>Charge Card</Link>
          </div>
          {client.payments.map((payment) => (
            <div key={payment.id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">${payment.amount.toFixed(2)} · {payment.processor}</p>
              <p className="text-sm text-slate-600">{new Date(payment.paymentDate).toLocaleString()} · {payment.status}</p>
              <p className="text-xs text-slate-500">Refunded: ${Number(payment.refundedAmount || 0).toFixed(2)} · {payment.cardBrand ? `${payment.cardBrand} •••• ${payment.cardLast4 || ""}` : "No card snapshot"}</p>
            </div>
          ))}
          {client.paymentMethodSnapshots?.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 font-medium text-slate-900">Stored payment methods</p>
              <div className="space-y-1 text-sm">
                {client.paymentMethodSnapshots.map((snapshot) => (
                  <p key={snapshot.id}>{snapshot.brand} •••• {snapshot.last4} {snapshot.expMonth ? `(exp ${snapshot.expMonth}/${snapshot.expYear || ""})` : ""}</p>
                ))}
              </div>
            </div>
          )}
          {!client.payments.length && <div className="empty-state">No payments.</div>}
        </div>
      )}

      {activeTab === "Assessments" && (
        <div className="card space-y-2">
          {client.assessments.map((assessment) => (
            <div key={assessment.id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{assessment.title}</p>
              <p className="text-sm text-slate-600">{assessment.status} · {new Date(assessment.updatedAt).toLocaleString()}</p>
            </div>
          ))}
          {!client.assessments.length && <div className="empty-state">No assessments.</div>}
        </div>
      )}

      {activeTab === "Documents" && (
        <div className="card space-y-2">
          {client.documents.map((document) => (
            <div key={document.id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{document.fileName}</p>
              <p className="text-sm text-slate-600">{new Date(document.uploadedAt).toLocaleString()}</p>
            </div>
          ))}
          {!client.documents.length && <div className="empty-state">No documents.</div>}
        </div>
      )}

      {activeTab === "Activity" && (
        <div className="card space-y-2">
          {activityItems.map((entry, index) => (
            <div key={`${entry.type}-${index}`} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{entry.type}: {entry.label}</p>
              <p className="text-sm text-slate-600">{new Date(entry.at).toLocaleString()}</p>
            </div>
          ))}
          {!activityItems.length && <div className="empty-state">No activity yet.</div>}
        </div>
      )}
    </div>
  );
}
