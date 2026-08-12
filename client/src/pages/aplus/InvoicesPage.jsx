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
function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
const ACTIVITY_ICONS = {
  CREATED:                 { icon: "📄", color: "#2563EB" },
  SENT:                    { icon: "📧", color: "#16A34A" },
  PAYMENT_LINK_GENERATED:  { icon: "🔗", color: "#7C3AED" },
  PAYMENT_RECEIVED:        { icon: "💳", color: "#15803D" },
  MANUAL_PAYMENT:          { icon: "💵", color: "#15803D" },
  CARD_PAYMENT:            { icon: "💳", color: "#15803D" },
  QB_SYNCED:               { icon: "✅", color: "#15803D" },
  QB_FAILED:               { icon: "⚠️", color: "#DC2626" },
  RECEIPT_SENT:            { icon: "🧾", color: "#0891B2" },
  VOIDED:                  { icon: "🚫", color: "#94A3B8" },
  DUPLICATED:              { icon: "📋", color: "#94A3B8" },
  NOTE:                    { icon: "📝", color: "#64748B" }
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

/* ─────────────────────────────────────────────────────────────────────────── */
/* Record Payment Modal                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function RecordPaymentModal({ invoice, onClose, onSuccess }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: Number(invoice.balanceDue || 0).toFixed(2),
    paymentMethod: "Cash",
    paymentDate: new Date().toISOString().slice(0, 10),
    transactionReference: "",
    notes: "",
    sendReceipt: true
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
        notes: form.notes || undefined,
        sendReceipt: form.sendReceipt
      });
      toast?.success(form.sendReceipt ? "Payment recorded. Receipt emailed." : "Payment recorded.");
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
            <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748B" }}>×</button>
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={form.sendReceipt} onChange={(e) => setForm((p) => ({ ...p, sendReceipt: e.target.checked }))} />
            Send receipt email to client
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? "Recording…" : "Record Payment"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Charge Card Modal — Browser Post API                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
function ChargeCardModal({ invoice, onClose, onSuccess }) {
  const toast = useToast();
  const formRef = useRef(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [card, setCard] = useState({ number: "", expMonth: "", expYear: "", cvv: "", name: "", zip: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/payments/browser-post-config?invoiceId=${invoice.id}`)
      .then(({ data }) => setConfig(data))
      .catch((e) => setError(e?.response?.data?.error || "Payment Hub is not configured."))
      .finally(() => setLoading(false));
  }, [invoice.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!config) return;
    setSubmitting(true);
    try {
      // Browser Post: build a form that POSTs directly to North's endpoint.
      // This keeps card data off our server (PCI compliance).
      const form = document.createElement("form");
      form.method = "POST";
      form.action = config.browserPostUrl;
      // A hidden iframe receives the response so the user stays on the page
      const iframeName = `browserpost-${Date.now()}`;
      const iframe = document.createElement("iframe");
      iframe.name = iframeName;
      iframe.style.display = "none";
      document.body.appendChild(iframe);
      form.target = iframeName;

      const fields = {
        merchant_id:    config.merchantId,
        order_ref:      config.orderRef,
        reference_id:   config.referenceId,
        amount:         config.amount,
        currency:       config.currency,
        nonce:          config.nonce,
        timestamp:      config.timestamp,
        signature:      config.signature,
        confirm_url:    config.confirmUrl,
        card_number:    card.number.replace(/\s/g, ""),
        card_exp_month: card.expMonth,
        card_exp_year:  card.expYear,
        card_cvv:       card.cvv,
        billing_name:   card.name,
        billing_zip:    card.zip,
        customer_email: invoice.client?.email || ""
      };

      Object.entries(fields).forEach(([k, v]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = v;
        form.appendChild(input);
      });

      document.body.appendChild(form);

      // Listen for the confirm endpoint's response via polling or message
      iframe.onload = async () => {
        try {
          // The confirm endpoint returns JSON — try to read it from the iframe
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          const text = iframeDoc?.body?.innerText || iframeDoc?.body?.textContent || "";
          const result = JSON.parse(text);
          if (result.ok) {
            toast?.success("Card payment processed.");
            onSuccess();
          } else {
            setError(result.error || "Card payment failed.");
          }
        } catch {
          // If cross-origin or JSON parse fails, assume success and let webhook handle it
          toast?.success("Payment submitted — confirming with processor…");
          onSuccess();
        } finally {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
          setSubmitting(false);
        }
      };

      form.submit();
    } catch (err) {
      setError(err?.message || "Payment failed.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 28px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>Charge Card</p>
            <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748B" }}>×</button>
          </div>
          <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>{invoice.invoiceNumber} · {money(invoice.balanceDue)} due</p>
          <div style={{ padding: "8px 12px", background: "#EFF6FF", borderRadius: 8, fontSize: 12, color: "#2563EB", marginBottom: 20 }}>
            🔒 Card data is sent directly to North — it never touches our server.
          </div>
        </div>

        {loading && <div style={{ padding: "24px 28px", textAlign: "center", color: "#94A3B8" }}>Loading payment configuration…</div>}

        {!loading && error && (
          <div style={{ padding: "0 28px 28px" }}>
            <div style={{ padding: "12px 16px", background: "#FEF2F2", borderRadius: 8, fontSize: 13, color: "#DC2626" }}>{error}</div>
            <button className="btn-secondary" style={{ marginTop: 12, width: "100%" }} onClick={onClose}>Close</button>
          </div>
        )}

        {!loading && !error && config && (
          <form ref={formRef} onSubmit={handleSubmit} style={{ padding: "0 28px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Cardholder Name</label>
              <input className="saas-input" placeholder="Jane Smith" value={card.name} onChange={(e) => setCard((p) => ({ ...p, name: e.target.value }))} required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Card Number</label>
              <input className="saas-input" placeholder="4111 1111 1111 1111" value={card.number}
                onChange={(e) => setCard((p) => ({ ...p, number: e.target.value.replace(/[^\d\s]/g, "").slice(0, 19) }))} required maxLength={19} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Exp Month</label>
                <input className="saas-input" placeholder="MM" value={card.expMonth} onChange={(e) => setCard((p) => ({ ...p, expMonth: e.target.value.slice(0, 2) }))} required maxLength={2} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Exp Year</label>
                <input className="saas-input" placeholder="YYYY" value={card.expYear} onChange={(e) => setCard((p) => ({ ...p, expYear: e.target.value.slice(0, 4) }))} required maxLength={4} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>CVV</label>
                <input className="saas-input" placeholder="123" type="password" value={card.cvv} onChange={(e) => setCard((p) => ({ ...p, cvv: e.target.value.slice(0, 4) }))} required maxLength={4} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6 }}>Billing ZIP</label>
              <input className="saas-input" placeholder="10001" value={card.zip} onChange={(e) => setCard((p) => ({ ...p, zip: e.target.value.slice(0, 10) }))} />
            </div>
            {error && <div style={{ fontSize: 13, color: "#DC2626", padding: "8px 12px", background: "#FEF2F2", borderRadius: 8 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={submitting}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1, background: "#15803D" }} disabled={submitting}>
                {submitting ? "Processing…" : `Charge ${money(invoice.balanceDue)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Create Invoice Modal                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function CreateInvoiceModal({ clients, onClose, onSuccess }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({
    clientId: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    tax: 0, discount: 0, notes: "",
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
      li[i] = { ...li[i], serviceId: serviceId || "", description: svc ? svc.name : li[i].description, unitPrice: svc ? (svc.standardRate ?? 0) : li[i].unitPrice };
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
          <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748B" }}>×</button>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: 8, alignItems: "center" }}>
                    <select className="saas-input" value={li.serviceId || ""} onChange={(e) => pickService(i, e.target.value)} style={{ fontSize: 13 }}>
                      <option value="">— Pick a service (optional) —</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""} — ${Number(s.standardRate || 0).toFixed(2)}/hr</option>)}
                    </select>
                    <button type="button" onClick={() => removeLI(i)} style={{ background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 8, height: 36, width: 32, cursor: "pointer", fontSize: 16 }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", gap: 8 }}>
                    <input className="saas-input" placeholder="Description" value={li.description} onChange={(e) => updateLI(i, "description", e.target.value)} style={{ fontSize: 13 }} />
                    <input className="saas-input" type="number" min="0" step="0.01" placeholder="Qty / Hrs" value={li.quantity} onChange={(e) => updateLI(i, "quantity", e.target.value)} style={{ fontSize: 13 }} />
                    <input className="saas-input" type="number" min="0" step="0.01" placeholder="Rate ($)" value={li.unitPrice} onChange={(e) => updateLI(i, "unitPrice", e.target.value)} style={{ fontSize: 13 }} />
                  </div>
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

function EditInvoiceModal({ invoice, onClose, onSuccess }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(() => ({
    issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    tax: Number(invoice.tax || 0),
    discount: Number(invoice.discount || 0),
    notes: invoice.notes || "",
    lineItems: (invoice.lineItems?.length ? invoice.lineItems : [{ description: "", quantity: 1, unitPrice: 0 }]).map((li) => ({
      id: li.id,
      serviceId: "",
      description: li.description || "",
      quantity: Number(li.quantity || 0),
      unitPrice: Number(li.unitPrice || 0)
    }))
  }));

  useEffect(() => {
    api.get("/services").then((res) => setServices((res.data?.items || res.data || []).filter((s) => s.isActive !== false))).catch(() => {});
  }, []);

  const updateLI = (i, k, v) => setForm((p) => {
    const li = [...p.lineItems];
    li[i] = { ...li[i], [k]: v };
    return { ...p, lineItems: li };
  });
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
  const removeLI = (i) => setForm((p) => ({ ...p, lineItems: p.lineItems.length > 1 ? p.lineItems.filter((_, idx) => idx !== i) : p.lineItems }));
  const subtotal = form.lineItems.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const total = Math.max(0, subtotal + Number(form.tax || 0) - Number(form.discount || 0));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.lineItems.length || form.lineItems.some((l) => !String(l.description || "").trim())) return toast?.error("All line items need a description.");
    setSaving(true);
    try {
      await api.put(`/invoices/${invoice.id}`, {
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        tax: Number(form.tax || 0),
        discount: Number(form.discount || 0),
        notes: form.notes,
        lineItems: form.lineItems.map((li) => ({
          description: String(li.description || "").trim(),
          quantity: Number(li.quantity || 0),
          unitPrice: Number(li.unitPrice || 0)
        }))
      });
      toast?.success("Invoice updated. QuickBooks sync queued.");
      onSuccess();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not update invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#0F172A" }}>Edit Invoice</p>
            <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{invoice.invoiceNumber} · QuickBooks will update after save</p>
          </div>
          <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748B" }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding: "20px 28px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              <p style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>Line Items / Hours / Pricing</p>
              <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 12px", height: "auto" }} onClick={addLI}>+ Add Line</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {form.lineItems.map((li, i) => (
                <div key={li.id || i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 32px", gap: 8, alignItems: "center" }}>
                    <select className="saas-input" value={li.serviceId || ""} onChange={(e) => pickService(i, e.target.value)} style={{ fontSize: 13 }}>
                      <option value="">— Pick a service to set rate —</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ""} — ${Number(s.standardRate || 0).toFixed(2)}/hr</option>)}
                    </select>
                    <button type="button" onClick={() => removeLI(i)} disabled={form.lineItems.length <= 1} style={{ background: "#FEF2F2", color: "#EF4444", border: "none", borderRadius: 8, height: 36, width: 32, cursor: form.lineItems.length <= 1 ? "not-allowed" : "pointer", fontSize: 16, opacity: form.lineItems.length <= 1 ? 0.4 : 1 }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", gap: 8 }}>
                    <input className="saas-input" placeholder="Description" value={li.description} onChange={(e) => updateLI(i, "description", e.target.value)} style={{ fontSize: 13 }} />
                    <input className="saas-input" type="number" min="0" step="0.01" placeholder="Hours" value={li.quantity} onChange={(e) => updateLI(i, "quantity", e.target.value)} style={{ fontSize: 13 }} />
                    <input className="saas-input" type="number" min="0" step="0.01" placeholder="Rate ($)" value={li.unitPrice} onChange={(e) => updateLI(i, "unitPrice", e.target.value)} style={{ fontSize: 13 }} />
                  </div>
                  <p style={{ textAlign: "right", fontSize: 12, color: "#64748B", margin: 0 }}>Line total: <strong style={{ color: "#0F172A" }}>{money(Number(li.quantity || 0) * Number(li.unitPrice || 0))}</strong></p>
                </div>
              ))}
            </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: 12 }}>
            <div style={{ fontSize: 13, color: "#64748B" }}>Total: <strong style={{ color: "#0F172A", fontSize: 16 }}>{money(total)}</strong></div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save & Update QB"}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Main Page                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function InvoicesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [invoices, setInvoices]     = useState([]);
  const [clients, setClients]       = useState([]);
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit]     = useState(false);
  const [showPay, setShowPay]       = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [sending, setSending]       = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [acting, setActing]         = useState(false);

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

  // Load activity log whenever selected invoice changes
  useEffect(() => {
    if (!selectedId) { setActivities([]); return; }
    api.get(`/invoices/${selectedId}/activity`)
      .then(({ data }) => setActivities(data))
      .catch(() => setActivities([]));
  }, [selectedId]);

  const selected = useMemo(() => invoices.find((inv) => inv.id === selectedId) || null, [invoices, selectedId]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      draft:        invoices.filter((i) => i.status === "DRAFT").length,
      open:         invoices.filter((i) => i.status === "OPEN" || i.status === "SENT").length,
      overdue:      invoices.filter((i) => i.status === "OVERDUE" || (["OPEN","SENT","PARTIAL"].includes(i.status) && new Date(i.dueDate) < now)).length,
      paidMonth:    invoices.filter((i) => i.status === "PAID" && new Date(i.paidAt || i.updatedAt) >= thisMonthStart).length,
      paidMonthAmt: invoices.filter((i) => i.status === "PAID" && new Date(i.paidAt || i.updatedAt) >= thisMonthStart).reduce((s, i) => s + Number(i.total || 0), 0),
      outstanding:  invoices.filter((i) => !["PAID","VOID"].includes(i.status)).reduce((s, i) => s + Number(i.balanceDue || 0), 0)
    };
  }, [invoices]);

  const doSend = async (id) => {
    setSending(true);
    try {
      const { data } = await api.post(`/invoices/${id}/send`);
      toast?.success(data.paymentLinkUrl ? "Invoice sent with Pay Now link." : "Invoice sent.");
      await load();
      // Refresh activity
      api.get(`/invoices/${id}/activity`).then(({ data: a }) => setActivities(a)).catch(() => {});
    } catch (e) { toast?.error(e?.response?.data?.error || "Send failed."); }
    finally { setSending(false); }
  };

  const doGenerateLink = async (id) => {
    setGeneratingLink(true);
    try {
      const { data } = await api.post(`/invoices/${id}/generate-payment-link`);
      if (data.paymentLinkUrl) {
        await navigator.clipboard.writeText(data.paymentLinkUrl).catch(() => {});
        toast?.success("Pay Now link generated and copied to clipboard!");
      } else {
        toast?.success("Payment link generated.");
      }
      await load();
      api.get(`/invoices/${id}/activity`).then(({ data: a }) => setActivities(a)).catch(() => {});
    } catch (e) { toast?.error(e?.response?.data?.error || "Could not generate link."); }
    finally { setGeneratingLink(false); }
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
    } catch (e) { toast?.error(e?.response?.data?.error || "Could not delete invoice."); }
    finally { setActing(false); }
  };

  const doSyncQb = async (id) => {
    setSyncing(true);
    try {
      await api.post(`/invoices/${id}/sync/quickbooks`);
      toast?.success("Synced to QuickBooks.");
      await load();
      api.get(`/invoices/${id}/activity`).then(({ data: a }) => setActivities(a)).catch(() => {});
    } catch (e) { toast?.error(e?.response?.data?.error || "QB sync failed."); }
    finally { setSyncing(false); }
  };

  const doSendReceipt = async (invoiceId, paymentId) => {
    try {
      await api.post(`/invoices/${invoiceId}/payments/${paymentId}/send-receipt`);
      toast?.success("Receipt sent.");
      api.get(`/invoices/${invoiceId}/activity`).then(({ data: a }) => setActivities(a)).catch(() => {});
    } catch (e) { toast?.error(e?.response?.data?.error || "Could not send receipt."); }
  };

  const doUpdatePaymentMethod = async (invoiceId, payment, paymentMethod) => {
    if (!paymentMethod || paymentMethod === payment.paymentMethod) return;
    try {
      await api.patch(`/invoices/${invoiceId}/payments/${payment.id}`, {
        paymentMethod,
        paymentDate: payment.paymentDate
      });
      toast?.success("Payment method updated. QuickBooks update queued.");
      await load();
      api.get(`/invoices/${invoiceId}/activity`).then(({ data: a }) => setActivities(a)).catch(() => {});
    } catch (e) {
      toast?.error(e?.response?.data?.error || "Could not update payment method.");
    }
  };

  const openHtml = (id) => {
    const token = localStorage.getItem("token");
    window.open(`${API_BASE}/invoices/${id}/html?token=${encodeURIComponent(token || "")}`, "_blank", "noopener");
  };

  const StatCard = ({ label, value, sub, color }) => (
    <div className="card" style={{ padding: "18px 20px" }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94A3B8", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: color || "#0F172A", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{sub}</p>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0F172A", margin: 0 }}>Invoicing</h1>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>Billing records, payments, activity, and QuickBooks sync.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New Invoice</button>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <StatCard label="Draft" value={stats.draft} color="#64748B" />
        <StatCard label="Open / Unpaid" value={stats.open} color="#2563EB" />
        <StatCard label="Overdue" value={stats.overdue} color="#DC2626" />
        <StatCard label="Paid This Month" value={stats.paidMonth} sub={money(stats.paidMonthAmt)} color="#15803D" />
        <StatCard label="Outstanding" value={money(stats.outstanding)} color="#B45309" />
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
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 440px" : "1fr", gap: 20, alignItems: "start" }}>

        {/* Invoice list */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
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
            const isOverdue = ["OPEN","SENT","PARTIAL"].includes(inv.status) && new Date(inv.dueDate) < new Date();
            return (
              <div key={inv.id} onClick={() => setSelectedId(inv.id)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 80px 80px", gap: 8,
                  padding: "14px 20px", borderBottom: "1px solid #F8FAFC", cursor: "pointer",
                  background: isActive ? "#EFF6FF" : "white",
                  borderLeft: isActive ? "3px solid #2563EB" : "3px solid transparent",
                  transition: "background 0.1s"
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{inv.invoiceNumber || "—"}</p>
                  <p style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{inv.client?.fullName}</p>
                  <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
                    <QbBadge syncStatus={inv.qbSyncStatus || "NOT_SYNCED"} />
                    {inv.paymentLinkUrl && <span style={{ fontSize: 10, background: "#EDE9FE", color: "#7C3AED", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>Pay Link ✓</span>}
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#475569", paddingTop: 2 }}>{fmtDate(inv.issueDate)}</p>
                <p style={{ fontSize: 13, color: isOverdue ? "#DC2626" : "#475569", paddingTop: 2, fontWeight: isOverdue ? 600 : 400 }}>{fmtDate(inv.dueDate)}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", paddingTop: 2 }}>{money(inv.total)}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: Number(inv.balanceDue) > 0 ? "#DC2626" : "#15803D", paddingTop: 2 }}>{money(inv.balanceDue)}</p>
                <div style={{ paddingTop: 2 }}><StatusPill status={isOverdue && inv.status !== "PAID" ? "OVERDUE" : inv.status} /></div>
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
                  <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                    Issued {fmtDate(selected.issueDate)} · Due {fmtDate(selected.dueDate)}
                  </p>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <StatusPill status={selected.status} />
                    <QbBadge syncStatus={selected.qbSyncStatus || "NOT_SYNCED"} />
                    {selected.paymentLinkUrl && (
                      <span style={{ fontSize: 10, background: "#EDE9FE", color: "#7C3AED", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>Pay Link Active</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 24, fontWeight: 700, color: "#0F172A" }}>{money(selected.total)}</p>
                  <p style={{ fontSize: 12, color: Number(selected.balanceDue) > 0 ? "#DC2626" : "#15803D", marginTop: 2, fontWeight: 600 }}>
                    {Number(selected.balanceDue) > 0 ? `${money(selected.balanceDue)} due` : "Fully paid ✓"}
                  </p>
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

              {/* Pay link display */}
              {selected.paymentLinkUrl && (
                <div style={{ marginBottom: 12, padding: "10px 12px", background: "#F5F3FF", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#7C3AED", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    🔗 {selected.paymentLinkUrl}
                  </span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(selected.paymentLinkUrl).catch(() => {}); toast?.success("Link copied!"); }}
                    style={{ fontSize: 11, padding: "4px 10px", background: "#7C3AED", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Copy
                  </button>
                  <a href={selected.paymentLinkUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, padding: "4px 10px", background: "#EDE9FE", color: "#7C3AED", borderRadius: 6, textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    Open ↗
                  </a>
                </div>
              )}

              {/* Primary action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="btn-primary"
                    disabled={selected.status === "PAID" || selected.status === "VOID" || Number(selected.balanceDue) <= 0}
                    onClick={() => setShowPay(true)}>
                    💵 Record Payment
                  </button>
                  <button className="btn-primary" style={{ background: "#15803D" }}
                    disabled={selected.status === "PAID" || selected.status === "VOID" || Number(selected.balanceDue) <= 0}
                    onClick={() => setShowCharge(true)}>
                    💳 Charge Card
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="btn-secondary" disabled={sending || selected.status === "VOID"} onClick={() => doSend(selected.id)}>
                    {sending ? "Sending…" : "📧 Send Invoice"}
                  </button>
                  <button className="btn-secondary"
                    disabled={generatingLink || selected.status === "VOID" || Number(selected.balanceDue) <= 0}
                    onClick={() => doGenerateLink(selected.id)}>
                    {generatingLink ? "Generating…" : "🔗 Generate Pay Link"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button className="btn-secondary" onClick={() => openHtml(selected.id)}>🖨 View / Print</button>
                  <button className="btn-secondary" disabled={syncing} onClick={() => doSyncQb(selected.id)}>
                    {syncing ? "Syncing…" : "🔄 Sync QB"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <button className="btn-secondary" style={{ fontSize: 12 }} disabled={acting || selected.status === "VOID"} onClick={() => setShowEdit(true)}>
                    Edit
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 12 }} disabled={acting} onClick={() => doDuplicate(selected.id)}>
                    Duplicate
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 12, color: "#DC2626" }} disabled={acting || selected.status === "VOID"} onClick={() => doVoid(selected.id)}>
                    Void
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                  <button className="btn-secondary" style={{ fontSize: 12, color: "#DC2626" }} disabled={acting} onClick={() => doDelete(selected.id)}>
                    Delete
                  </button>
                </div>
              </div>

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
                <div key={p.id} style={{ padding: "12px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>
                        {p.paymentMethod || p.cardBrand || "Payment"}
                        {p.cardLast4 && <span style={{ color: "#94A3B8" }}> ···· {p.cardLast4}</span>}
                        {p.paymentSourceType === "MANUAL" && <span style={{ marginLeft: 6, fontSize: 10, background: "#F1F5F9", color: "#64748B", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>Manual</span>}
                        {p.paymentSourceType === "CARD" && <span style={{ marginLeft: 6, fontSize: 10, background: "#DCFCE7", color: "#15803D", padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>Card</span>}
                      </p>
                      <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDate(p.paymentDate)} · {p.status}</p>
                      {p.receiptSentAt && <p style={{ fontSize: 11, color: "#0891B2", marginTop: 2 }}>🧾 Receipt sent {fmtDateTime(p.receiptSentAt)}</p>}
                      {p.paymentSourceType === "MANUAL" && (
                        <div style={{ marginTop: 8 }}>
                          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 4, textTransform: "uppercase" }}>Payment method</label>
                          <select
                            className="saas-input"
                            style={{ height: 32, fontSize: 12, maxWidth: 160 }}
                            value={p.paymentMethod || "Other"}
                            onChange={(e) => doUpdatePaymentMethod(selected.id, p, e.target.value)}
                          >
                            {METHOD_LABELS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>{money(p.amount)}</p>
                      {!p.receiptSentAt && p.status === "SUCCEEDED" && (
                        <button
                          onClick={() => doSendReceipt(selected.id, p.id)}
                          style={{ fontSize: 11, padding: "3px 8px", background: "#EFF6FF", color: "#2563EB", border: "none", borderRadius: 6, cursor: "pointer" }}
                        >
                          Send Receipt
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!selected.payments?.length && <div className="empty-state">No payments.</div>}
            </div>

            {/* Activity timeline — driven by DB */}
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Activity Timeline</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {activities.map((ev, i) => {
                  const icon = ACTIVITY_ICONS[ev.type] || ACTIVITY_ICONS.NOTE;
                  return (
                    <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: i < activities.length - 1 ? 16 : 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F8FAFC", border: `2px solid ${icon.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                          {icon.icon}
                        </div>
                        {i < activities.length - 1 && <div style={{ width: 1, flex: 1, background: "#E2E8F0", marginTop: 4 }} />}
                      </div>
                      <div style={{ paddingTop: 4 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>{ev.message}</p>
                        <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtDateTime(ev.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                {!activities.length && <div className="empty-state">No activity logged yet.</div>}
              </div>
            </div>

            {/* QB sync metadata */}
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>QuickBooks Sync</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>Sync Status</span><QbBadge syncStatus={selected.qbSyncStatus || "NOT_SYNCED"} /></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>QB Invoice ID</span><span style={{ color: "#0F172A", fontWeight: 500 }}>{selected.quickbooksInvoiceId || "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>QB Payment ID</span><span style={{ color: "#0F172A", fontWeight: 500 }}>{selected.qbPaymentId || "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748B" }}>Checkout Session</span><span style={{ color: "#0F172A", fontWeight: 500, fontSize: 11 }}>{selected.hostedCheckoutRef || "—"}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateInvoiceModal clients={clients} onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); load(); }} />
      )}
      {showEdit && selected && (
        <EditInvoiceModal
          invoice={selected}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            load();
            api.get(`/invoices/${selected.id}/activity`).then(({ data }) => setActivities(data)).catch(() => {});
          }}
        />
      )}
      {showPay && selected && (
        <RecordPaymentModal invoice={selected} onClose={() => setShowPay(false)}
          onSuccess={() => { setShowPay(false); load(); api.get(`/invoices/${selected.id}/activity`).then(({ data }) => setActivities(data)).catch(() => {}); }} />
      )}
      {showCharge && selected && (
        <ChargeCardModal invoice={selected} onClose={() => setShowCharge(false)}
          onSuccess={() => { setShowCharge(false); load(); api.get(`/invoices/${selected.id}/activity`).then(({ data }) => setActivities(data)).catch(() => {}); }} />
      )}
    </div>
  );
}
