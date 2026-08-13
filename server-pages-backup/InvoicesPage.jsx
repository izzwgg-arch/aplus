import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v || 0));
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLES = {
  DRAFT:   { bg: "#F1F5F9", color: "#64748B" },
  OPEN:    { bg: "#EFF6FF", color: "#2563EB" },
  SENT:    { bg: "#F0FDF4", color: "#16A34A" },
  PAID:    { bg: "#DCFCE7", color: "#15803D" },
  PARTIAL: { bg: "#FFFBEB", color: "#B45309" },
  OVERDUE: { bg: "#FEF2F2", color: "#DC2626" },
  VOID:    { bg: "#F8FAFC", color: "#94A3B8" }
};
const QB_STYLES = {
  SYNCED:     { bg: "#DCFCE7", color: "#15803D", label: "QB Synced" },
  NOT_SYNCED: { bg: "#F1F5F9", color: "#64748B", label: "Not Synced" },
  PENDING:    { bg: "#FFFBEB", color: "#B45309", label: "QB Pending" },
  FAILED:     { bg: "#FEF2F2", color: "#DC2626", label: "QB Failed" }
};
const METHOD_LABELS = ["Cash", "Check", "External Card", "ACH", "Other"];

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.DRAFT;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 9999, letterSpacing: "0.04em" }}>
      {status}
    </span>
  );
}
function QbBadge({ syncStatus }) {
  const s = QB_STYLES[syncStatus] || QB_STYLES.NOT_SYNCED;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, letterSpacing: "0.04em" }}>
      {s.label}
    </span>
  );
}

// ── Record Payment Modal ────────────────────────────────────────────────────
function RecordPaymentModal({ invoice, onClose, onSuccess }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: Number(invoice.balanceDue || 0).toFixed(2),
    paymentMethod: "Cash",
    paymentDate: new Date().toISOString().slice(0, 10),
    transactionReference: "",
    notes: ""
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return toast?.error("Enter a valid amount.");
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.id}/pay`, {
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        paymentDate: form.paymentDate ? new Date(form.paymentDate).toISOString() : undefined,
        transactionReference: form.transactionReference || undefined,
        notes: form.notes || undefined
      });
      toast?.success("Payment recorded.");
      onSuccess();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not record payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 28px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>Record Payment</p>
              <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>{invoice.invoiceNumber} · Balance {money(invoice.balanceDue)}</p>
            </div>
            <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>
        <form onSubmit={submit} style={{ padding: "0 28px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Amount *</label>
            <input className="saas-input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Payment Method *</label>
            <select className="saas-input" value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
              {METHOD_LABELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Payment Date</label>
            <input className="saas-input" type="date" value={form.paymentDate} onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Reference / Check # (optional)</label>
            <input className="saas-input" placeholder="e.g. Check #1042" value={form.transactionReference} onChange={(e) => setForm((p) => ({ ...p, transactionReference: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Notes (optional)</label>
            <textarea className="saas-textarea" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? "Recording…" : "Record Payment"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create Invoice Modal ────────────────────────────────────────────────────
function CreateInvoiceModal({ clients, onClose, onSuccess }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({
    clientId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    tax: 0,
    discount: 0,
    notes: "",
    lineItems: [{ serviceId: "", description: "", quantity: 1, unitPrice: 0 }]
  });

  useEffect(() => {
    api.get("/services").then((res) => setServices((res.data?.items || res.data || []).filter((s) => s.isActive !== false))).catch(() => {});
  }, []);

  const updateLI = (i, k, v) => setForm((p) => { const li = [...p.lineItems]; li[i] = { ...li[i], [k]: v }; return { ...p, lineItems: li }; });

  const pickService = (i, serviceId) => {
    const svc = services.find((s) => s.id === serviceId);
    setForm((p) => {
      const li = [...p.lineItems];
      li[i] = {
        ...li[i],
        serviceId: serviceId || "",
        description: svc ? svc.name : li[i].description,
        unitPrice: svc ? (svc.standardRate ?? 0) : li[i].unitPrice
      };
      return { ...p, lineItems: li };
    });
  };

  const addLI = () => setForm((p) => ({ ...p, lineItems: [...p.lineItems, { serviceId: "", description: "", quantity: 1, unitPrice: 0 }] }));
  const removeLI = (i) => setForm((p) => ({ ...p, lineItems: p.lineItems.filter((_, idx) => idx !== i) }));

  const subtotal = form.lineItems.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.clientId) return toast?.error("Select a client.");
    if (!form.lineItems.length || form.lineItems.some((l) => !l.description)) return toast?.error("All line items need a description.");
    setSaving(true);
    try {
      await api.post("/invoices", form);
      toast?.success("Invoice created.");
      onSuccess();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not create invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>New Invoice</p>
          <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Client *</label>
              <select className="saas-input" value={form.clientId} onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))}>
                <option value="">Select client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Issue Date</label>
              <input className="saas-input" type="date" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Due Date</label>
              <input className="saas-input" type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>Line Items</p>
              <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 12px", height: "auto" }} onClick={addLI}>+ Add Line</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {form.lineItems.map((li, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Row 1: service picker */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: 8, alignItems: "center" }}>
                    <select
                      className="saas-input"
                      value={li.serviceId || ""}
                      onChange={(e) => pickService(i, e.target.value)}
                      style={{ fontSize: 13 }}
                    >
                      <option value="">— Pick a service (optional) —</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.code ? ` (${s.code})` : ""} — ${Number(s.standardRate || 0).toFixed(2)}/hr
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeLI(i)} style={{ background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 8, height: 36, width: 32, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
                  </div>
                  {/* Row 2: description + qty + rate */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", gap: 8 }}>
                    <input
                      className="saas-input"
                      placeholder="Description"
                      value={li.description}
                      onChange={(e) => updateLI(i, "description", e.target.value)}
                      style={{ fontSize: 13 }}
                    />
                    <input
                      className="saas-input"
                      type="number" min="0" step="0.01"
                      placeholder="Qty / Hrs"
                      value={li.quantity}
                      onChange={(e) => updateLI(i, "quantity", e.target.value)}
                      style={{ fontSize: 13 }}
                    />
                    <input
                      className="saas-input"
                      type="number" min="0" step="0.01"
                      placeholder="Rate ($)"
                      value={li.unitPrice}
                      onChange={(e) => updateLI(i, "unitPrice", e.target.value)}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  {/* Line total */}
                  <p style={{ textAlign: "right", fontSize: 12, color: "#64748B", margin: 0 }}>
                    Line total: <strong style={{ color: "#0F172A" }}>{money(Number(li.quantity || 0) * Number(li.unitPrice || 0))}</strong>
                  </p>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "right", fontSize: 13, color: "#64748B", marginTop: 10 }}>
              Subtotal: <strong style={{ color: "#0F172A" }}>{money(subtotal)}</strong>
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Tax ($)</label>
              <input className="saas-input" type="number" step="0.01" value={form.tax} onChange={(e) => setForm((p) => ({ ...p, tax: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Discount ($)</label>
              <input className="saas-input" type="number" step="0.01" value={form.discount} onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Notes</label>
            <textarea className="saas-textarea" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? "Creating…" : "Create Invoice"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const [invRes, clRes] = await Promise.all([
        api.get(`/invoices?search=${encodeURIComponent(search)}&status=${encodeURIComponent(statusFilter)}`),
        api.get("/clients")
      ]);
      setInvoices(invRes.data);
      setClients(clRes.data);
      if (!selectedId && invRes.data.length) setSelectedId(invRes.data[0].id);
    } catch {
      toast?.error("Failed to load invoices.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const selected = useMemo(() => invoices.find((inv) => inv.id === selectedId) || null, [invoices, selectedId]);

  // Summary stats computed from current list
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      draft: invoices.filter((i) => i.status === "DRAFT").length,
      open: invoices.filter((i) => i.status === "OPEN" || i.status === "SENT").length,
      overdue: invoices.filter((i) => i.status === "OVERDUE" || (i.status === "OPEN" && new Date(i.dueDate) < now)).length,
      paidMonth: invoices.filter((i) => i.status === "PAID" && new Date(i.paidAt || i.updatedAt) >= thisMonthStart).length,
      outstanding: invoices.filter((i) => !["PAID", "VOID"].includes(i.status)).reduce((s, i) => s + Number(i.balanceDue || 0), 0)
    };
  }, [invoices]);

  // Activity timeline for selected invoice
  const timeline = useMemo(() => {
    if (!selected) return [];
    const events = [{ id: `created`, at: selected.createdAt, label: "Invoice created", detail: selected.invoiceNumber }];
    if (selected.sentAt) events.push({ id: "sent", at: selected.sentAt, label: "Invoice sent", detail: selected.client?.email || "" });
    if (selected.paidAt) events.push({ id: "paid", at: selected.paidAt, label: "Invoice fully paid", detail: money(selected.total) });
    (selected.payments || []).forEach((p) => {
      events.push({ id: `pay-${p.id}`, at: p.paymentDate, label: `Payment recorded — ${p.paymentMethod || p.cardBrand || ""}`, detail: `${money(p.amount)} · ${p.status}` });
      (p.refunds || []).forEach((r) => events.push({ id: `ref-${r.id}`, at: r.createdAt, label: "Refund", detail: `${money(r.amount)} · ${r.status}` }));
    });
    return events.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [selected]);

  const doSend = async (id) => {
    setSending(true);
    try { await api.post(`/invoices/${id}/send`); toast?.success("Invoice sent."); await load(); }
    catch (e) { toast?.error(e?.response?.data?.error || "Send failed."); }
    finally { setSending(false); }
  };

  const doVoid = async (id) => {
    if (!window.confirm("Void this invoice?")) return;
    setActing(true);
    try { await api.post(`/invoices/${id}/void`); toast?.success("Invoice voided."); await load(); }
    catch (e) { toast?.error(e?.response?.data?.error || "Void failed."); }
    finally { setActing(false); }
  };

  const doDuplicate = async (id) => {
    setActing(true);
    try { const { data } = await api.post(`/invoices/${id}/duplicate`); toast?.success("Duplicated."); await load(); setSelectedId(data.id); }
    catch (e) { toast?.error(e?.response?.data?.error || "Duplicate failed."); }
    finally { setActing(false); }
  };

  const doDelete = async (id) => {
    const inv = invoices.find((i) => i.id === id);
    const label = inv?.invoiceNumber || "this invoice";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setActing(true);
    try {
      await api.delete(`/invoices/${id}`);
      toast?.success("Invoice deleted.");
      setSelectedId(null);
      await load();
    } catch (e) {
      toast?.error(e?.response?.data?.error || "Could not delete invoice.");
    } finally {
      setActing(false);
    }
  };

  const doSyncQb = async (id) => {
    setSyncing(true);
    try { await api.post(`/invoices/${id}/sync/quickbooks`); toast?.success("Synced to QuickBooks."); await load(); }
    catch (e) { toast?.error(e?.response?.data?.error || "QB sync failed."); }
    finally { setSyncing(false); }
  };

  const doSendPayHub = async (id) => {
    setActing(true);
    try {
      const { data } = await api.post(`/invoices/${id}/sync/payment-hub`);
      if (data.paymentLink) window.open(data.paymentLink, "_blank", "noopener");
      toast?.success("Sent to Payment Hub."); await load();
    } catch (e) { toast?.error(e?.response?.data?.error || "Payment Hub send failed."); }
    finally { setActing(false); }
  };

  const openHtml = (id) => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/invoices/${id}/html?token=${encodeURIComponent(token || "")}`, "_blank", "noopener");
  };

  const StatCard = ({ label, value, color }) => (
    <div className="card" style={{ padding: "18px 20px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94A3B8", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: color || "#0F172A", lineHeight: 1 }}>{value}</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0F172A", margin: 0 }}>Invoicing</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>Billing records, payments, and QuickBooks sync.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Invoice</button>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <StatCard label="Draft" value={stats.draft} color="#64748B" />
        <StatCard label="Open / Unpaid" value={stats.open} color="#2563EB" />
        <StatCard label="Overdue" value={stats.overdue} color="#DC2626" />
        <StatCard label="Paid This Month" value={stats.paidMonth} color="#15803D" />
        <StatCard label="Outstanding Balance" value={money(stats.outstanding)} color="#B45309" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input className="saas-input" style={{ width: 260 }} placeholder="Search invoice # or client…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="saas-input" style={{ width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {["DRAFT","OPEN","SENT","PAID","PARTIAL","OVERDUE","VOID"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 420px" : "1fr", gap: 20, alignItems: "start" }}>

        {/* Invoice list */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 80px 80px", gap: 8, padding: "10px 20px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
            {["Invoice / Client","Issue Date","Due Date","Total","Balance","Status"].map((h) => (
              <p key={h} style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</p>
            ))}
          </div>

          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid #F8FAFC" }}>
              <div className="skeleton-line" style={{ width: "60%" }} />
              <div className="skeleton-line" style={{ width: "40%", marginTop: 8 }} />
            </div>
          ))}

          {!isLoading && invoices.map((inv) => {
            const isActive = inv.id === selectedId;
            return (
              <div
                key={inv.id}
                onClick={() => setSelectedId(inv.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 110px 110px 80px 80px",
                  gap: 8,
                  padding: "14px 20px",
                  borderBottom: "1px solid #F8FAFC",
                  cursor: "pointer",
                  background: isActive ? "#EFF6FF" : "white",
                  borderLeft: isActive ? "3px solid #2563EB" : "3px solid transparent",
                  transition: "background 0.1s"
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{inv.invoiceNumber || "—"}</p>
                  <p style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{inv.client?.fullName}</p>
                  <div style={{ marginTop: 4 }}><QbBadge syncStatus={inv.qbSyncStatus || "NOT_SYNCED"} /></div>
                </div>
                <p style={{ fontSize: 13, color: "#475569", paddingTop: 2 }}>{fmtDate(inv.issueDate)}</p>
                <p style={{ fontSize: 13, color: "#475569", paddingTop: 2 }}>{fmtDate(inv.dueDate)}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", paddingTop: 2 }}>{money(inv.total)}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: Number(inv.balanceDue) > 0 ? "#DC2626" : "#15803D", paddingTop: 2 }}>{money(inv.balanceDue)}</p>
                <div style={{ paddingTop: 2 }}><StatusPill status={inv.status} /></div>
              </div>
            );
          })}

          {!isLoading && !invoices.length && (
            <div className="empty-state" style={{ margin: 24 }}>No invoices found.</div>
          )}
        </div>

        {/* Invoice detail panel */}
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Header card */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{selected.invoiceNumber}</p>
                  <p style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>{selected.client?.fullName}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <StatusPill status={selected.status} />
                    <QbBadge syncStatus={selected.qbSyncStatus || "NOT_SYNCED"} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>{money(selected.total)}</p>
                  <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Due {fmtDate(selected.dueDate)}</p>
                </div>
              </div>

              {/* Balance strip */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, background: "#F8FAFC", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginTop: 2 }}>{money(selected.total)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Paid</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#15803D", marginTop: 2 }}>{money(Number(selected.total) - Number(selected.balanceDue))}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>Balance</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: Number(selected.balanceDue) > 0 ? "#DC2626" : "#15803D", marginTop: 2 }}>{money(selected.balanceDue)}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="btn-primary" disabled={selected.status === "PAID" || selected.status === "VOID" || Number(selected.balanceDue) <= 0} onClick={() => setShowPay(true)}>
                    Record Payment
                  </button>
                  <button className="btn-secondary" onClick={() => navigate(`/aplus/payments?invoiceId=${selected.id}`)}>
                    Charge Card
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="btn-secondary" disabled={sending || selected.status === "VOID"} onClick={() => doSend(selected.id)}>
                    {sending ? "Sending…" : "Send Invoice"}
                  </button>
                  <button className="btn-secondary" onClick={() => openHtml(selected.id)}>
                    View / Print
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  <button className="btn-secondary" disabled={syncing} onClick={() => doSyncQb(selected.id)} style={{ fontSize: 12 }}>
                    {syncing ? "Syncing…" : "Sync QB"}
                  </button>
                  <button className="btn-secondary" disabled={acting} onClick={() => doDuplicate(selected.id)} style={{ fontSize: 12 }}>
                    Duplicate
                  </button>
                  <button className="btn-secondary" disabled={acting || selected.status === "VOID"} onClick={() => doVoid(selected.id)} style={{ fontSize: 12, color: "#DC2626" }}>
                    Void
                  </button>
                  <button className="btn-secondary" disabled={acting} onClick={() => doDelete(selected.id)} style={{ fontSize: 12, color: "#DC2626" }}>
                    Delete
                  </button>
                </div>
                <button className="btn-secondary" disabled={acting} onClick={() => doSendPayHub(selected.id)} style={{ fontSize: 12 }}>
                  Send to Payment Hub
                </button>
              </div>

              {/* QB sync error */}
              {selected.qbSyncError && (
                <div style={{ marginTop: 12, padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, fontSize: 12, color: "#DC2626" }}>
                  QB Sync Error: {selected.qbSyncError}
                </div>
              )}
            </div>

            {/* Line items */}
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Line Items</p>
              {(selected.lineItems || []).map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>{item.description}</p>
                    {item.serviceDate && <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDate(item.serviceDate)}</p>}
                    <p style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{Number(item.quantity).toFixed(2)} hrs × {money(item.unitPrice)}</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{money(item.amount)}</p>
                </div>
              ))}
              {!(selected.lineItems?.length) && <div className="empty-state">No line items.</div>}
              {/* Totals */}
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4, paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
                {Number(selected.tax || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748B" }}><span>Tax</span><span>{money(selected.tax)}</span></div>}
                {Number(selected.discount || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#16A34A" }}><span>Discount</span><span>−{money(selected.discount)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: "#0F172A", paddingTop: 6, borderTop: "1px solid #E2E8F0" }}><span>Total</span><span>{money(selected.total)}</span></div>
              </div>
            </div>

            {/* Payment history */}
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Payment History</p>
              {(selected.payments || []).map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>
                      {p.paymentMethod || p.cardBrand || "Payment"}
                      {p.paymentSourceType === "MANUAL" && <span style={{ marginLeft: 6, fontSize: 10, background: "#F1F5F9", color: "#64748B", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>Manual</span>}
                    </p>
                    <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDate(p.paymentDate)} · {p.status}</p>
                    {p.description && <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{p.description}</p>}
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>{money(p.amount)}</p>
                </div>
              ))}
              {!selected.payments?.length && <div className="empty-state">No payments.</div>}
            </div>

            {/* Activity timeline */}
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>Activity Timeline</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {timeline.map((ev, i) => (
                  <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: i < timeline.length - 1 ? 14 : 0 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563EB", marginTop: 4, flexShrink: 0 }} />
                      {i < timeline.length - 1 && <div style={{ width: 1, flex: 1, background: "#E2E8F0", marginTop: 4 }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>{ev.label}</p>
                      <p style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{ev.detail}</p>
                      <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{new Date(ev.at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {!timeline.length && <div className="empty-state">No activity yet.</div>}
              </div>
            </div>

            {/* QB sync metadata */}
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>QuickBooks Sync</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>Sync Status</span><QbBadge syncStatus={selected.qbSyncStatus || "NOT_SYNCED"} /></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>QB Invoice ID</span><span style={{ color: "#0F172A", fontWeight: 500 }}>{selected.quickbooksInvoiceId || "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>QB Payment ID</span><span style={{ color: "#0F172A", fontWeight: 500 }}>{selected.qbPaymentId || "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>Payment Hub ID</span><span style={{ color: "#0F172A", fontWeight: 500 }}>{selected.paymentHubInvoiceId || "—"}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateInvoiceModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); load(); }}
        />
      )}
      {showPay && selected && (
        <RecordPaymentModal
          invoice={selected}
          onClose={() => setShowPay(false)}
          onSuccess={() => { setShowPay(false); load(); }}
        />
      )}
    </div>
  );
}
