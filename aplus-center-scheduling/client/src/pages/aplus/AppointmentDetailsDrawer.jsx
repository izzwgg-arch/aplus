import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import SolaPaymentModal from "../../components/payments/SolaPaymentModal.jsx";

/* ─── Minimal color system (mirrors AppointmentsPage) ──────────────────────── */
const EVENT_COLORS = [
  { id: "purple", swatch: "#7c3aed", light: "#ede9fe" },
  { id: "blue",   swatch: "#2563eb", light: "#dbeafe" },
  { id: "teal",   swatch: "#0d9488", light: "#ccfbf1" },
  { id: "green",  swatch: "#16a34a", light: "#dcfce7" },
  { id: "amber",  swatch: "#d97706", light: "#fef3c7" },
  { id: "red",    swatch: "#dc2626", light: "#fee2e2" },
  { id: "pink",   swatch: "#db2777", light: "#fce7f3" },
  { id: "slate",  swatch: "#475569", light: "#f1f5f9" },
];
function getSwatchColor(colorId) {
  if (!colorId) return "#2563eb";
  if (colorId.startsWith("#")) return colorId;
  return EVENT_COLORS.find((c) => c.id === colorId)?.swatch ?? "#2563eb";
}

/* ─── Status config — MONOCHROME ONLY ──────────────────────────────────────── */
// Single source of truth for status labels and styles.
// All styles use black/white/gray only — no color.
export const STATUS_CONFIG = {
  // All values must match the AppointmentStatus enum in schema.prisma exactly.
  // Styles are monochrome (black / white / gray) only.
  SCHEDULED:    { label: "Scheduled",    cls: "border border-slate-300 bg-white    text-slate-700" },
  PENDING:      { label: "Pending",      cls: "border border-slate-400 bg-slate-50 text-slate-700" },
  CONFIRMED:    { label: "Confirmed",    cls: "bg-slate-100                        text-slate-800" },
  COMPLETED:    { label: "Complete",     cls: "bg-slate-200                        text-slate-700" },
  CANCELLED:    { label: "Cancelled",    cls: "bg-slate-800                        text-white"     },
  RESCHEDULED:  { label: "Rescheduled",  cls: "bg-slate-300                        text-slate-800" },
  NO_SHOW:      { label: "No-show",      cls: "bg-slate-700                        text-white"     },
  PAID:         { label: "Paid",         cls: "bg-slate-900                        text-white"     },
  RUNNING_LATE: { label: "Running late", cls: "bg-slate-400                        text-white"     },
  CUSTOM:       { label: "Custom",       cls: "border border-slate-500 bg-white    text-slate-800" },
};

export function StatusBadge({ status, size = "sm" }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  const pad = size === "xs" ? "px-1.5 py-px text-[9px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold leading-tight ${pad} ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function pad2(n) { return String(n).padStart(2, "0"); }
function fmt12(h, m = 0) { return `${h % 12 || 12}:${pad2(m)} ${h >= 12 ? "PM" : "AM"}`; }
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${fmt12(d.getHours(), d.getMinutes())}`;
}
function fmtMoney(val) {
  if (val === null || val === undefined) return "—";
  return `$${Number(val).toFixed(2)}`;
}
function fmtDuration(min) {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h} hr` : `${m} min`;
}
function formatHistoryAction(action) {
  return ({
    APPOINTMENT_CREATED:   "Appointment created",
    APPOINTMENT_UPDATED:   "Appointment updated",
    APPOINTMENT_DELETED:   "Appointment deleted",
    APPOINTMENT_CANCELLED: "Appointment cancelled",
    REMINDER_SENT:         "Reminder sent",
    PAYMENT_ADDED:         "Payment recorded",
  })[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

/* ─── Phone display: renders multiple numbers on separate lines ─────────────── */
function splitPhoneNumbers(raw) {
  if (!raw) return [];
  const s = raw.trim();

  // 1. Try any explicit delimiter: newline, comma, semicolon, pipe, slash, or 1+ spaces
  const byDelim = s.split(/[\n\r,;|/]|\s+/).map((t) => t.trim()).filter(Boolean);
  if (byDelim.length > 1) return byDelim;

  // 2. Detect two E.164 US numbers directly concatenated: +1XXXXXXXXXX (12 chars each)
  //    e.g. "+18454927823" + "8457827036" → "+18454927823 8457827036"
  if (/^\+1\d{11,}/.test(s)) {
    const first = s.slice(0, 12);   // "+1" + 10 digits
    const rest  = s.slice(12).trim();
    if (rest.length >= 7) return [first, rest];
  }

  // 3. Two plain 10-digit US numbers concatenated with no country code
  if (/^\d{20,}$/.test(s)) {
    const mid = Math.ceil(s.length / 2);
    return [s.slice(0, mid), s.slice(mid)];
  }

  return [s];
}

function PhoneDisplay({ phone }) {
  if (!phone) return <span>—</span>;
  const numbers = splitPhoneNumbers(phone);
  if (numbers.length <= 1) return <span>{phone}</span>;
  return (
    <div className="space-y-1">
      {numbers.map((n, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400">#{i + 1}</span>
          <span>{n}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Small layout helpers ──────────────────────────────────────────────────── */
function Field({ label, value, fullWidth }) {
  return (
    <div className={fullWidth ? "col-span-full" : ""}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 text-sm text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
function SectionHeader({ children }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{children}</p>
      <div className="flex-1 border-t border-slate-100" />
    </div>
  );
}
function InfoCard({ children }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">{children}</div>;
}

/* ─── Details Tab ───────────────────────────────────────────────────────────── */
function DetailsTab({ appt }) {
  const start = new Date(appt.startsAt);
  const end   = new Date(appt.endsAt);
  return (
    <div className="space-y-4">
      <InfoCard>
        <SectionHeader>Appointment</SectionHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Service"  value={appt.service?.name || appt.serviceNameSnapshot || "—"} />
          <Field label="Status"   value={<StatusBadge status={appt.status} />} />
          <Field label="Date"     value={fmtDate(appt.startsAt)} fullWidth />
          <Field label="Start"    value={fmt12(start.getHours(), start.getMinutes())} />
          <Field label="End"      value={fmt12(end.getHours(),   end.getMinutes())} />
          <Field label="Duration" value={fmtDuration(appt.durationMinutes)} />
          {appt.location && <Field label="Location" value={appt.location} fullWidth />}
          {appt.recurrenceType && appt.recurrenceType !== "NONE" && (
            <Field label="Recurrence" value={`${appt.recurrenceType.charAt(0) + appt.recurrenceType.slice(1).toLowerCase()} · ${appt.recurrenceCount ?? "?"} sessions`} fullWidth />
          )}
        </div>
      </InfoCard>

      <InfoCard>
        <SectionHeader>Provider</SectionHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Name"  value={appt.provider?.fullName || appt.providerNameSnapshot || "—"} />
          {appt.provider?.email && <Field label="Email" value={appt.provider.email} />}
        </div>
      </InfoCard>

      <InfoCard>
        <SectionHeader>Client</SectionHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Name"    value={appt.client?.fullName || "—"} />
          <Field label="Phone"   value={<PhoneDisplay phone={appt.client?.phone} />} />
          <Field label="Email"   value={appt.client?.email   || "—"} fullWidth />
          {appt.client?.address && (
            <Field label="Address" value={appt.client.address} fullWidth />
          )}
        </div>
      </InfoCard>

      <InfoCard>
        <SectionHeader>Billing</SectionHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Standard Rate"  value={fmtMoney(appt.standardRateSnapshot)} />
          <Field label="Effective Rate" value={fmtMoney(appt.effectiveRate)} />
          {appt.isOvertime && (
            <Field label="Overtime" value={appt.removeOvertimeCharge ? "Overtime (no charge)" : "Overtime"} fullWidth />
          )}
        </div>
      </InfoCard>

      <InfoCard>
        <SectionHeader>Reminders</SectionHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Enabled"       value={appt.reminderEnabled ? "Yes" : "No"} />
          <Field label="24h reminder"  value={appt.reminder24SentAt ? fmtDateTime(appt.reminder24SentAt) : "Not sent"} />
          <Field label="1h reminder"   value={appt.reminder1SentAt  ? fmtDateTime(appt.reminder1SentAt)  : "Not sent"} />
        </div>
      </InfoCard>

      {(appt.notes || appt.billingNotes) && (
        <InfoCard>
          {appt.notes && (
            <>
              <SectionHeader>Notes</SectionHeader>
              <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{appt.notes}</p>
            </>
          )}
          {appt.billingNotes && (
            <>
              <SectionHeader>Billing Notes</SectionHeader>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{appt.billingNotes}</p>
            </>
          )}
        </InfoCard>
      )}
    </div>
  );
}

/* ─── History Tab ───────────────────────────────────────────────────────────── */
function HistoryTab({ history }) {
  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-2xl text-slate-200">📋</p>
        <p className="text-sm font-medium text-slate-400">No history recorded yet</p>
        <p className="text-xs text-slate-300">Edits, status changes, and reminders will appear here.</p>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-100" />
      <div className="space-y-3">
        {history.map((entry) => {
          const d = new Date(entry.createdAt);
          return (
            <div key={entry.id} className="relative flex gap-4 pl-8">
              <div className="absolute left-2.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
              <div className="flex-1 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                <p className="text-sm font-medium text-slate-800">{formatHistoryAction(entry.action)}</p>
                {entry.actorEmail && (
                  <p className="mt-0.5 text-xs text-slate-500">by {entry.actorEmail}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(d)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Payments Tab ──────────────────────────────────────────────────────────── */
function PaymentsTab({ invoice, appointmentId, appointmentStatus, clientId, navigate, onShowPayModal, onInvoiceCreated, onRefresh }) {
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const payments   = invoice?.payments ?? [];
  const hasPaid    = payments.length > 0;
  const totalPaid  = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanceDue = invoice?.balanceDue !== undefined ? Number(invoice.balanceDue) : null;
  const canPay     = balanceDue !== null && balanceDue > 0;
  const isCompleted = appointmentStatus === "COMPLETED";

  async function handleCreateAndPay() {
    setCreatingInvoice(true);
    try {
      const res = await api.post(`/appointments/${appointmentId}/create-invoice`);
      onInvoiceCreated(res.data);
    } catch (err) {
      console.error("[create-invoice]", err);
    } finally {
      setCreatingInvoice(false);
    }
  }

  return (
    <div className="space-y-4">
      <InfoCard>
        <SectionHeader>Summary</SectionHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Invoice #"     value={invoice?.invoiceNumber || "Not invoiced"} />
          <Field label="Invoice Status"
            value={invoice?.status
              ? <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{invoice.status}</span>
              : "—"
            }
          />
          <Field label="Total Charged" value={fmtMoney(invoice?.total ?? invoice?.amount)} />
          <Field label="Amount Paid"   value={hasPaid ? fmtMoney(totalPaid) : "—"} />
          {balanceDue !== null && (
            <Field
              label="Balance Due"
              value={
                <span className={`font-semibold ${balanceDue > 0 ? "text-slate-900" : "text-emerald-600"}`}>
                  {fmtMoney(balanceDue)}
                </span>
              }
            />
          )}
        </div>
      </InfoCard>

      {hasPaid ? (
        <div className="space-y-2">
          <SectionHeader>Payment Records</SectionHeader>
          {payments.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{fmtMoney(p.amount)}</p>
                  {(p.cardBrand || p.paymentMethod) && (
                    <p className="text-xs capitalize text-slate-500">
                      {p.cardBrand || p.paymentMethod}
                      {p.cardLast4 ? ` ···· ${p.cardLast4}` : ""}
                    </p>
                  )}
                  {p.solaXRefNum && (
                    <p className="font-mono text-[11px] text-slate-400">Ref: {p.solaXRefNum}</p>
                  )}
                  {!p.solaXRefNum && p.externalPaymentId && (
                    <p className="font-mono text-[11px] text-slate-400">Ref: {p.externalPaymentId}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    p.status === "SUCCEEDED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"
                  }`}>
                    {p.status}
                  </span>
                  <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(p.paymentDate || p.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-8">
          <p className="text-2xl text-slate-200">💳</p>
          <p className="text-sm text-slate-400">No payments recorded yet</p>
        </div>
      )}

      {/* Completed + no invoice → create invoice first, then pay */}
      {isCompleted && !invoice && (
        <button
          type="button"
          onClick={handleCreateAndPay}
          disabled={creatingInvoice}
          className="btn-primary w-full py-2.5 text-sm"
        >
          {creatingInvoice ? "Creating invoice…" : "Create Invoice & Collect Payment"}
        </button>
      )}

      {/* Invoice exists + balance > 0 → show payment button */}
      {canPay && (
        <button
          type="button"
          onClick={onShowPayModal}
          className="btn-primary w-full py-2.5 text-sm"
        >
          Collect Payment · {fmtMoney(balanceDue)}
        </button>
      )}
      {!canPay && hasPaid && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 py-3 text-sm text-emerald-700 font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Paid in full
        </div>
      )}
      {invoice && (
        <button
          type="button"
          onClick={() => navigate(`/aplus/invoices?id=${invoice.id}`)}
          className="btn-secondary w-full py-2 text-sm"
        >
          View Invoice
        </button>
      )}
    </div>
  );
}

/* ─── Main Modal ────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "details",  label: "Details"  },
  { id: "history",  label: "History"  },
  { id: "payments", label: "Payments" },
];

export default function AppointmentDetailsModal({
  appointmentId,
  onClose,
  onEdit,
  onDeleted,
  toast,
}) {
  const navigate      = useNavigate();
  const [tab,          setTab]         = useState("details");
  const [appt,         setAppt]        = useState(null);
  const [history,      setHistory]     = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [deleting,     setDeleting]    = useState(false);
  const [error,        setError]       = useState(null);
  const [showPayModal,       setShowPayModal]       = useState(false);
  const [creatingInvoice,    setCreatingInvoice]    = useState(false);
  const [completing,         setCompleting]         = useState(false);

  const load = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    setError(null);
    try {
      const [apptRes, histRes] = await Promise.all([
        api.get(`/appointments/${appointmentId}`),
        api.get(`/appointments/${appointmentId}/history`).catch(() => ({ data: [] })),
      ]);
      setAppt(apptRes.data);
      setHistory(Array.isArray(histRes.data) ? histRes.data : []);
    } catch {
      setError("Could not load appointment details.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    setTab("details");
    setAppt(null);
    setHistory([]);
    load();
  }, [appointmentId, load]);

  // Escape key
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const handleDelete = async () => {
    if (!window.confirm("Delete this appointment? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.delete(`/appointments/${appointmentId}`);
      toast?.success("Appointment deleted.");
      onDeleted(appointmentId);
      onClose();
    } catch {
      toast?.error("Could not delete appointment.");
    } finally {
      setDeleting(false);
    }
  };

  if (!appointmentId) return null;

  const start      = appt ? new Date(appt.startsAt) : null;
  const end        = appt ? new Date(appt.endsAt)   : null;
  const swatch     = appt ? getSwatchColor(appt.colorId) : "#2563eb";

  return (
    // Outer scroll container — same pattern as AppointmentModal
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color strip */}
        <div
          className="h-1.5 w-full rounded-t-2xl transition-colors duration-200"
          style={{ backgroundColor: loading ? "#e2e8f0" : swatch }}
        />

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="space-y-2">
                <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold text-slate-900">
                  {appt?.title || appt?.service?.name || appt?.serviceNameSnapshot || "Appointment"}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {appt?.status && <StatusBadge status={appt.status} />}
                  {start && (
                    <p className="text-xs text-slate-500">
                      {start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      {" · "}
                      {fmt12(start.getHours(), start.getMinutes())}
                      {end && ` – ${fmt12(end.getHours(), end.getMinutes())}`}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="ml-4 flex shrink-0 items-center gap-1.5">
            {!loading && appt && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(appt)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-500 shadow-sm transition-colors hover:bg-rose-50 disabled:opacity-40"
                >
                  {deleting ? "…" : "Delete"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`mr-6 border-b-2 pb-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="max-h-[56vh] overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-4">
              {[3, 4, 2].map((rows, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  {Array.from({ length: rows }).map((_, j) => (
                    <div key={j} className={`h-4 animate-pulse rounded bg-slate-200 ${j % 2 === 0 ? "w-1/3" : "w-2/3"}`} />
                  ))}
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="text-sm text-slate-500">{error}</p>
              <button type="button" onClick={load} className="btn-secondary text-sm">
                Try again
              </button>
            </div>
          ) : tab === "details" ? (
            <DetailsTab appt={appt} />
          ) : tab === "history" ? (
            <HistoryTab history={history} />
          ) : (
            <PaymentsTab
              invoice={appt?.invoice}
              appointmentId={appointmentId}
              appointmentStatus={appt?.status}
              clientId={appt?.clientId}
              navigate={navigate}
              onShowPayModal={() => setShowPayModal(true)}
              onInvoiceCreated={(newInvoice) => {
                setAppt((prev) => ({ ...prev, invoice: newInvoice }));
                setShowPayModal(true);
              }}
              onRefresh={load}
            />
          )}
        </div>

        {/* Footer */}
        {!loading && !error && appt && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 gap-2">
            <button
              type="button"
              onClick={() => navigate(`/aplus/clients/${appt.clientId}`)}
              className="btn-secondary px-4 py-2 text-sm shrink-0"
            >
              View Client
            </button>

            <div className="flex items-center gap-2">
              {/* Mark Complete — shown for any non-terminal status */}
              {!["COMPLETED","CANCELLED","NO_SHOW","PAID"].includes(appt.status) && (
                <button
                  type="button"
                  disabled={completing}
                  onClick={async () => {
                    setCompleting(true);
                    try {
                      const res = await api.post(`/appointments/${appointmentId}/complete`);
                      setAppt((prev) => ({ ...prev, ...res.data }));
                      toast?.success("Appointment marked complete.");
                      setTab("payments");
                    } catch (e) {
                      toast?.error("Could not mark appointment complete.");
                    } finally {
                      setCompleting(false);
                    }
                  }}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  {completing ? "Completing…" : "✓ Mark Complete"}
                </button>
              )}

              {/* Collect Payment — shown when COMPLETED and balance > 0 */}
              {appt.status === "COMPLETED" && (!appt.invoice || Number(appt.invoice.balanceDue || 0) > 0) && (
                <button
                  type="button"
                  disabled={creatingInvoice}
                  onClick={async () => {
                    setTab("payments");
                    if (!appt.invoice) {
                      setCreatingInvoice(true);
                      try {
                        const res = await api.post(`/appointments/${appointmentId}/create-invoice`);
                        setAppt((prev) => ({ ...prev, invoice: res.data }));
                      } catch (e) {
                        console.error("[create-invoice]", e);
                      } finally {
                        setCreatingInvoice(false);
                      }
                    }
                    setShowPayModal(true);
                  }}
                  className="btn-primary px-5 py-2 text-sm"
                >
                  {creatingInvoice ? "Creating…" : appt.invoice ? `Collect Payment · ${fmtMoney(appt.invoice.balanceDue)}` : "Collect Payment"}
                </button>
              )}

              {/* View Invoice — shown when completed and fully paid */}
              {appt.status === "COMPLETED" && appt.invoice && Number(appt.invoice.balanceDue || 0) <= 0 && (
                <button
                  type="button"
                  onClick={() => navigate(`/aplus/invoices?id=${appt.invoice.id}`)}
                  className="btn-secondary px-5 py-2 text-sm"
                >
                  View Invoice
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sola Payment Modal */}
      {showPayModal && appt?.invoice && (
        <SolaPaymentModal
          invoice={appt.invoice}
          clientId={appt.clientId}
          onSuccess={async (payment) => {
            setShowPayModal(false);
            toast?.success(`Payment of ${fmtMoney(payment.amount)} collected!`);
            await load();
            setTab("payments");
          }}
          onClose={() => setShowPayModal(false)}
        />
      )}
    </div>
  );
}
