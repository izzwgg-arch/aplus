import { useState, useEffect, useCallback, useRef } from "react";
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
/** Convert an ISO datetime string to a local "HH:MM" string for <input type="time">. */
function toTimeStr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** Parse a "HH:MM" time string to total minutes, or null if invalid. */
function timeStrToMinutes(t) {
  const parts = (t || "").split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
/** Return a new ISO datetime with the local time replaced by localTimeStr ("HH:MM"), keeping the same local date. */
function buildNewDatetime(baseIso, localTimeStr) {
  if (!baseIso || !localTimeStr) return baseIso;
  const d = new Date(baseIso);
  const parts = localTimeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return baseIso;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
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

const MANUAL_PAYMENT_METHODS = ["Cash", "Check", "External Card", "ACH", "Other"];

/** Record cash/check (or other manual methods) against an invoice — same API as Invoices page; QuickBooks sync runs server-side. */
function RecordManualPaymentModal({ invoice, onClose, onSuccess, toast }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: Number(invoice.balanceDue || 0).toFixed(2),
    paymentMethod: "Cash",
    paymentDate: new Date().toISOString().slice(0, 10),
    transactionReference: "",
    notes: "",
    sendReceipt: true,
  });

  async function submit(e) {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast?.error?.("Enter a valid amount.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.id}/pay`, {
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        paymentDate: form.paymentDate ? new Date(form.paymentDate).toISOString() : undefined,
        transactionReference: form.transactionReference || undefined,
        notes: form.notes || undefined,
        sendReceipt: form.sendReceipt,
      });
      toast?.success?.(form.sendReceipt ? "Payment recorded. Receipt emailed." : "Payment recorded.");
      onSuccess();
    } catch (err) {
      toast?.error?.(err?.response?.data?.error || "Could not record payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-slate-900">Record payment</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : "Invoice"} · Balance {fmtMoney(invoice.balanceDue)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
          >
            ×
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Amount *</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Payment method *</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.paymentMethod}
              onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
            >
              {MANUAL_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Payment date</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              type="date"
              value={form.paymentDate}
              onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Reference / check # (optional)</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g. Check #1042"
              value={form.transactionReference}
              onChange={(e) => setForm((p) => ({ ...p, transactionReference: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Notes (optional)</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={form.sendReceipt}
              onChange={(e) => setForm((p) => ({ ...p, sendReceipt: e.target.checked }))}
            />
            Send receipt email to client
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1 py-2.5 text-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1 py-2.5 text-sm" disabled={saving}>
              {saving ? "Recording…" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Invoice Line Editor ────────────────────────────────────────────────────
 * Shows session timing, a service picker for the primary line, and the full
 * invoice line table — all editable before payment is collected.
 *
 * • Start / end time inputs → recalculate duration → update line[0] hours.
 * • "Change service" on the primary line → updates description + rate
 *   (unless "Custom price" override is checked).
 * • Additional lines added via "Add service" or "+ Custom line" as before.
 * • Exposes handleSave via saveFnRef so PaymentsTab can auto-save before
 *   opening a payment modal. handleSave returns the updated invoice or null.
 * • On save → PUT /invoices/:id; if time/duration changed → PUT /appointments/:id.
 * ──────────────────────────────────────────────────────────────────────────── */
function InvoiceLineEditor({
  invoice, appointmentId, startsAt, endsAt, durationMinutes,
  toast, onSaved, onDirtyChange, onLiveTotal, saveFnRef,
}) {
  const [lines, setLines]             = useState(() => initLines(invoice));
  const [saving, setSaving]           = useState(false);
  const [dirty, setDirty]             = useState(false);
  const [customPrice, setCustomPrice] = useState(false);
  const [startStr, setStartStr]       = useState(() => toTimeStr(startsAt));
  const [endStr, setEndStr]           = useState(() => toTimeStr(endsAt));
  const [services, setServices]       = useState([]);
  const [svcLoading, setSvcLoading]   = useState(false);
  // "add" = append a new line; "replace0" = replace primary service on line[0]
  const [showPicker, setShowPicker]   = useState(false);
  const [pickerMode, setPickerMode]   = useState("add");
  // Separate refs so both anchors can coexist in the DOM without conflict
  const addPickerRef   = useRef(null);
  const line0PickerRef = useRef(null);

  // Re-init when invoice changes (e.g. just created)
  useEffect(() => {
    setLines(initLines(invoice));
    setDirty(false);
    setCustomPrice(false);
    setStartStr(toTimeStr(startsAt));
    setEndStr(toTimeStr(endsAt));
  }, [invoice?.id]);

  // Close picker on outside click — checks the active anchor ref
  useEffect(() => {
    if (!showPicker) return;
    const activeRef = pickerMode === "replace0" ? line0PickerRef : addPickerRef;
    const h = (e) => {
      if (activeRef.current && !activeRef.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPicker, pickerMode]);

  // Notify parent of dirty state
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);

  // Notify parent of live subtotal on every line change
  const subtotal = lines.reduce((s, l) => s + (l.amount || 0), 0);
  useEffect(() => { onLiveTotal?.(subtotal); }, [subtotal]);

  // Expose save function via ref — updated every render so it never goes stale
  useEffect(() => { if (saveFnRef) saveFnRef.current = handleSave; });

  function initLines(inv) {
    if (!inv?.lineItems?.length) return [];
    return inv.lineItems.map((li) => ({
      id:          li.id,
      description: li.description,
      quantity:    String(Number(li.quantity).toFixed(2)),
      unitPrice:   String(Number(li.unitPrice).toFixed(2)),
      amount:      Number(li.quantity) * Number(li.unitPrice),
    }));
  }

  function updateLine(idx, field, value) {
    setLines((prev) => {
      const next = prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: value };
        const q = parseFloat(field === "quantity"  ? value : updated.quantity)  || 0;
        const r = parseFloat(field === "unitPrice" ? value : updated.unitPrice) || 0;
        updated.amount = +(q * r).toFixed(2);
        return updated;
      });
      return next;
    });
    setDirty(true);
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function addBlankLine() {
    setLines((prev) => [...prev, { description: "", quantity: "1", unitPrice: "0", amount: 0 }]);
    setDirty(true);
  }

  async function loadServices() {
    if (services.length > 0) { setShowPicker(true); return; }
    setSvcLoading(true);
    try {
      const res = await api.get("/services");
      setServices(Array.isArray(res.data) ? res.data.filter((s) => s.isActive !== false) : []);
    } catch { /* ignore */ }
    finally { setSvcLoading(false); setShowPicker(true); }
  }

  function openAddPicker() { setPickerMode("add"); loadServices(); }
  function openLine0Picker() { setPickerMode("replace0"); loadServices(); }

  function pickService(svc) {
    if (pickerMode === "replace0") {
      // Replace the primary line's service; honour customPrice override
      setLines((prev) => {
        if (!prev.length) return prev;
        const rate = customPrice
          ? parseFloat(prev[0].unitPrice) || 0
          : Number(svc.standardRate || 0);
        const qty  = parseFloat(prev[0].quantity) || 0;
        return [
          { ...prev[0], description: svc.name, unitPrice: rate.toFixed(2), amount: +(qty * rate).toFixed(2) },
          ...prev.slice(1),
        ];
      });
    } else {
      // Append a new additional line
      setLines((prev) => [
        ...prev,
        {
          description: svc.name,
          quantity:    "1",
          unitPrice:   String(Number(svc.standardRate || 0).toFixed(2)),
          amount:      Number(svc.standardRate || 0),
        },
      ]);
    }
    setShowPicker(false);
    setPickerMode("add");
    setDirty(true);
  }

  // Start time change → recalculate duration → update line[0] hours
  function handleStartChange(val) {
    setStartStr(val);
    const sm = timeStrToMinutes(val);
    const em = timeStrToMinutes(endStr);
    if (sm !== null && em !== null && em > sm) {
      const hours = +((em - sm) / 60).toFixed(4);
      setLines((prev) => {
        if (!prev.length) return prev;
        const rate = parseFloat(prev[0].unitPrice) || 0;
        return [{ ...prev[0], quantity: String(hours), amount: +(hours * rate).toFixed(2) }, ...prev.slice(1)];
      });
    }
    setDirty(true);
  }

  // End time change → recalculate duration → update line[0] hours
  function handleEndChange(val) {
    setEndStr(val);
    const sm = timeStrToMinutes(startStr);
    const em = timeStrToMinutes(val);
    if (sm !== null && em !== null && em > sm) {
      const hours = +((em - sm) / 60).toFixed(4);
      setLines((prev) => {
        if (!prev.length) return prev;
        const rate = parseFloat(prev[0].unitPrice) || 0;
        return [{ ...prev[0], quantity: String(hours), amount: +(hours * rate).toFixed(2) }, ...prev.slice(1)];
      });
    }
    setDirty(true);
  }

  // Save invoice lines and (if timing changed) the appointment record.
  // Returns the updated invoice object, or null on failure.
  async function handleSave() {
    const trimmed = lines.filter((l) => l.description.trim());
    if (!trimmed.length) { toast?.error("At least one line item required."); return null; }
    setSaving(true);
    try {
      const lineItems = trimmed.map((l) => ({
        description: l.description.trim(),
        quantity:    parseFloat(l.quantity)  || 0,
        unitPrice:   parseFloat(l.unitPrice) || 0,
      }));

      const res = await api.put(`/invoices/${invoice.id}`, { lineItems });

      // Determine whether timing changed relative to the original appointment
      const origHours    = durationMinutes ? +(durationMinutes / 60).toFixed(4) : null;
      const newHours     = lineItems[0]?.quantity ?? null;
      const hoursChanged = origHours !== null && newHours !== null && Math.abs(newHours - origHours) > 0.01;
      const timeChanged  = Boolean(startsAt) && (startStr !== toTimeStr(startsAt) || endStr !== toTimeStr(endsAt));

      if ((hoursChanged || timeChanged) && appointmentId && startsAt) {
        const newStartsAt = buildNewDatetime(startsAt, startStr);
        const newEndsAt   = buildNewDatetime(startsAt, endStr);
        const newMins     = Math.round((newHours ?? origHours ?? 1) * 60);
        await api.put(`/appointments/${appointmentId}`, {
          startsAt:        newStartsAt,
          endsAt:          newEndsAt,
          durationMinutes: newMins,
        }).catch(() => {});
      }

      toast?.success("Invoice updated.");
      setDirty(false);
      onSaved(res.data, lineItems[0]?.quantity ?? null);
      return res.data;
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not update invoice.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  // Shared service list dropdown (rendered inside the active anchor container)
  function ServiceList({ mode }) {
    return (
      <div className={`absolute z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden
        ${mode === "replace0" ? "right-0 bottom-full mb-1" : "bottom-full left-0 mb-1"}`}>
        <div className="px-3 py-2 border-b border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {mode === "replace0" ? "Change primary service" : "Add a service"}
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {services.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">No services found</p>
          ) : (
            services.map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() => pickService(svc)}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
              >
                <span className="font-medium text-slate-800">{svc.name}</span>
                <span className="text-xs text-slate-500 tabular-nums">{fmtMoney(svc.standardRate)}/hr</span>
              </button>
            ))
          )}
        </div>
        {mode === "add" && (
          <div className="border-t border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={() => { setShowPicker(false); addBlankLine(); }}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              + Add custom line
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Review &amp; edit billing</p>
        {dirty && (
          <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
            Unsaved changes
          </span>
        )}
      </div>

      {/* ── Session details: time, service, price override ── */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 space-y-2.5">
        {/* Start / End / Duration row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Start</label>
            <input
              type="time"
              value={startStr}
              onChange={(e) => handleStartChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">End</label>
            <input
              type="time"
              value={endStr}
              onChange={(e) => handleEndChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</label>
            <div className="rounded-lg border border-slate-100 bg-white px-2 py-1.5 text-sm tabular-nums text-slate-600">
              {lines[0] ? fmtDuration(Math.round(parseFloat(lines[0].quantity || 0) * 60)) : "—"}
            </div>
          </div>
        </div>

        {/* Primary service + custom price toggle */}
        {lines.length > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Service · </span>
              <span className="text-sm text-slate-700 truncate">{lines[0].description || "—"}</span>
            </div>
            {/* "Change service" anchor — opens picker in replace0 mode */}
            <div className="relative shrink-0" ref={line0PickerRef}>
              <button
                type="button"
                onClick={openLine0Picker}
                disabled={svcLoading && pickerMode === "replace0"}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
              >
                {svcLoading && pickerMode === "replace0" ? (
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : null}
                Change
              </button>
              {showPicker && pickerMode === "replace0" && <ServiceList mode="replace0" />}
            </div>
            <label className="flex shrink-0 items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={customPrice}
                onChange={(e) => setCustomPrice(e.target.checked)}
                className="h-3 w-3"
              />
              <span className="text-[11px] text-slate-500 whitespace-nowrap">Custom price</span>
            </label>
          </div>
        )}
      </div>

      {/* ── Line items table ── */}
      <div className="divide-y divide-slate-100">
        <div className="grid grid-cols-[1fr_80px_90px_80px_28px] gap-2 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <span>Description</span>
          <span className="text-center">Hrs / Qty</span>
          <span className="text-center">Rate ($)</span>
          <span className="text-right">Amount</span>
          <span />
        </div>

        {lines.map((line, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_80px_90px_80px_28px] items-center gap-2 px-4 py-2">
            <input
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
              value={line.description}
              placeholder="Description"
              onChange={(e) => updateLine(idx, "description", e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm tabular-nums focus:border-slate-400 focus:outline-none"
              type="number" min="0" step="0.25"
              value={line.quantity}
              onChange={(e) => updateLine(idx, "quantity", e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm tabular-nums focus:border-slate-400 focus:outline-none"
              type="number" min="0" step="0.01"
              value={line.unitPrice}
              onChange={(e) => updateLine(idx, "unitPrice", e.target.value)}
            />
            <p className="text-right text-sm font-semibold tabular-nums text-slate-800">{fmtMoney(line.amount)}</p>
            {lines.length > 1 ? (
              <button
                type="button"
                onClick={() => removeLine(idx)}
                className="flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                title="Remove line"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            ) : <span />}
          </div>
        ))}
      </div>

      {/* ── Add service / custom line row ── */}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        {/* "Add service" anchor — opens picker in add mode */}
        <div className="relative" ref={addPickerRef}>
          <button
            type="button"
            onClick={openAddPicker}
            disabled={svcLoading && pickerMode === "add"}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1"
          >
            {svcLoading && pickerMode === "add" ? (
              <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            )}
            Add service
          </button>
          {showPicker && pickerMode === "add" && <ServiceList mode="add" />}
        </div>
        <button
          type="button"
          onClick={addBlankLine}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
        >
          + Custom line
        </button>
      </div>

      {/* ── Subtotal + Save ── */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-sm">
          <span className="text-slate-500 text-xs">Subtotal: </span>
          <span className="font-bold text-slate-900 tabular-nums">{fmtMoney(subtotal)}</span>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn-primary px-5 py-2 text-sm disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save Invoice"}
        </button>
      </div>
    </div>
  );
}

/* ─── Payments Tab ──────────────────────────────────────────────────────────── */
function PaymentsTab({
  invoice,
  appointmentId,
  appointmentStatus,
  startsAt,
  endsAt,
  durationMinutes,
  clientId,
  navigate,
  onShowPayModal,
  onShowManualPayModal,
  onInvoiceCreated,
  onInvoiceUpdated,
  onRefresh,
  toast,
}) {
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [localInvoice, setLocalInvoice]       = useState(invoice);
  const [editorDirty, setEditorDirty]         = useState(false);
  const [liveTotal, setLiveTotal]             = useState(null);
  const saveFnRef                             = useRef(null);

  // Keep localInvoice in sync when parent passes a fresh invoice
  useEffect(() => { setLocalInvoice(invoice); }, [invoice]);

  const payments    = localInvoice?.payments ?? [];
  const hasPaid     = payments.length > 0;
  const totalPaid   = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balanceDue  = localInvoice?.balanceDue !== undefined ? Number(localInvoice.balanceDue) : null;
  const canPay      = balanceDue !== null && balanceDue > 0;
  const isCompleted = appointmentStatus === "COMPLETED";
  const showEditor  = isCompleted && !!localInvoice && canPay;
  // Show live edited amount in buttons while there are unsaved changes
  const displayAmount = editorDirty && liveTotal !== null ? liveTotal : balanceDue;

  async function handleCreateAndPay() {
    setCreatingInvoice(true);
    try {
      const res = await api.post(`/appointments/${appointmentId}/create-invoice`);
      setLocalInvoice(res.data);
      onInvoiceCreated(res.data);
    } catch (err) {
      console.error("[create-invoice]", err);
    } finally {
      setCreatingInvoice(false);
    }
  }

  // Auto-save invoice edits (if dirty) before opening a payment modal.
  async function handlePayClick(action) {
    let freshInvoice = localInvoice;
    if (editorDirty && saveFnRef.current) {
      freshInvoice = await saveFnRef.current();
      if (!freshInvoice) return; // save failed — don't proceed to payment
    }
    if (action === "card") {
      onShowPayModal();
    } else {
      onShowManualPayModal(freshInvoice);
    }
  }

  return (
    <div className="space-y-4">
      <InfoCard>
        <SectionHeader>Summary</SectionHeader>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Invoice #"     value={localInvoice?.invoiceNumber || "Not invoiced"} />
          <Field label="Invoice Status"
            value={localInvoice?.status
              ? <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{localInvoice.status}</span>
              : "—"
            }
          />
          <Field label="Total Charged" value={fmtMoney(localInvoice?.total ?? localInvoice?.amount)} />
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

      {/* ── Billing editor: time, service, and line items before payment ── */}
      {showEditor && (
        <InvoiceLineEditor
          invoice={localInvoice}
          appointmentId={appointmentId}
          startsAt={startsAt}
          endsAt={endsAt}
          durationMinutes={durationMinutes}
          toast={toast}
          saveFnRef={saveFnRef}
          onDirtyChange={setEditorDirty}
          onLiveTotal={setLiveTotal}
          onSaved={(updatedInvoice, newHours) => {
            setLocalInvoice(updatedInvoice);
            onInvoiceUpdated(updatedInvoice, newHours);
          }}
        />
      )}

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
        !showEditor && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-8">
            <p className="text-2xl text-slate-200">💳</p>
            <p className="text-sm text-slate-400">No payments recorded yet</p>
          </div>
        )
      )}

      {/* Completed + no invoice → create invoice first */}
      {isCompleted && !localInvoice && (
        <button
          type="button"
          onClick={handleCreateAndPay}
          disabled={creatingInvoice}
          className="btn-primary w-full py-2.5 text-sm"
        >
          {creatingInvoice ? "Creating invoice…" : "Create Invoice & Collect Payment"}
        </button>
      )}

      {/* Invoice exists + balance > 0 → pay by card or record cash/check.
          Clicking either button auto-saves any unsaved billing edits first. */}
      {canPay && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handlePayClick("card")}
            className="btn-primary w-full py-2.5 text-sm"
          >
            Pay by card · {fmtMoney(displayAmount)}
          </button>
          <button
            type="button"
            onClick={() => handlePayClick("cash")}
            className="btn-secondary w-full py-2.5 text-sm"
          >
            Record cash / check · {fmtMoney(displayAmount)}
          </button>
        </div>
      )}
      {!canPay && hasPaid && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 py-3 text-sm text-emerald-700 font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Paid in full
        </div>
      )}
      {localInvoice && (
        <button
          type="button"
          onClick={() => navigate(`/aplus/invoices?id=${localInvoice.id}`)}
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
  const [showManualPayModal, setShowManualPayModal] = useState(false);
  /** Invoice row used for the manual payment modal (avoids stale `appt` right after create-invoice). */
  const [manualPayInvoice,   setManualPayInvoice]   = useState(null);
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

  /** Ensures a completed appointment has an invoice (required before card or manual payment). */
  const ensureAppointmentInvoice = async () => {
    if (appt?.invoice) return appt.invoice;
    setCreatingInvoice(true);
    try {
      const res = await api.post(`/appointments/${appointmentId}/create-invoice`);
      const inv = res.data;
      setAppt((prev) => ({ ...prev, invoice: inv }));
      return inv;
    } catch (e) {
      console.error("[create-invoice]", e);
      toast?.error?.("Could not create invoice for this appointment.");
      return null;
    } finally {
      setCreatingInvoice(false);
    }
  };

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
              startsAt={appt?.startsAt}
              endsAt={appt?.endsAt}
              durationMinutes={appt?.durationMinutes}
              clientId={appt?.clientId}
              navigate={navigate}
              onShowPayModal={() => setShowPayModal(true)}
              onShowManualPayModal={(freshInvoice) => {
                // Accept a freshly-saved invoice passed by PaymentsTab after auto-save,
                // falling back to the current appt invoice if not provided.
                const inv = freshInvoice ?? appt?.invoice;
                if (inv) {
                  setManualPayInvoice(inv);
                  setShowManualPayModal(true);
                }
              }}
              onInvoiceCreated={(newInvoice) => {
                // Invoice just created — update appt state but do NOT auto-open the
                // payment modal; the billing editor in the tab should be reviewed first.
                setAppt((prev) => ({ ...prev, invoice: newInvoice }));
              }}
              onInvoiceUpdated={(updatedInvoice, newHours) => {
                setAppt((prev) => ({
                  ...prev,
                  invoice: updatedInvoice,
                  ...(newHours !== null && {
                    durationMinutes: Math.round(newHours * 60),
                    endsAt: prev?.startsAt
                      ? new Date(new Date(prev.startsAt).getTime() + Math.round(newHours * 60) * 60000).toISOString()
                      : prev?.endsAt,
                  }),
                }));
              }}
              onRefresh={load}
              toast={toast}
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

              {/* Collect payment — navigate to Payments tab so staff can review and
                  edit billing details before payment is taken. The tab contains
                  the billing editor and the actual card / cash+check buttons. */}
              {appt.status === "COMPLETED" && (!appt.invoice || Number(appt.invoice.balanceDue || 0) > 0) && (
                <button
                  type="button"
                  disabled={creatingInvoice}
                  onClick={async () => {
                    await ensureAppointmentInvoice();
                    setTab("payments");
                  }}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  {creatingInvoice
                    ? "Creating…"
                    : appt.invoice
                      ? `Review & Pay · ${fmtMoney(appt.invoice.balanceDue)}`
                      : "Create Invoice & Pay"}
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
          appointmentId={appointmentId}
          onBillingSynced={(data) => {
            setAppt((prev) => ({
              ...prev,
              invoice: data.invoice,
              durationMinutes: data.appointment?.durationMinutes ?? prev?.durationMinutes,
              startsAt: data.appointment?.startsAt ?? prev?.startsAt,
              endsAt: data.appointment?.endsAt ?? prev?.endsAt,
              startAt: data.appointment?.startsAt ?? prev?.startAt,
              endAt: data.appointment?.endsAt ?? prev?.endAt,
            }));
          }}
          onSuccess={async (payment) => {
            setShowPayModal(false);
            toast?.success(`Payment of ${fmtMoney(payment.amount)} collected!`);
            await load();
            setTab("payments");
          }}
          onClose={() => setShowPayModal(false)}
        />
      )}

      {showManualPayModal && manualPayInvoice && (
        <RecordManualPaymentModal
          invoice={manualPayInvoice}
          toast={toast}
          onClose={() => {
            setShowManualPayModal(false);
            setManualPayInvoice(null);
          }}
          onSuccess={async () => {
            setShowManualPayModal(false);
            setManualPayInvoice(null);
            await load();
            setTab("payments");
          }}
        />
      )}
    </div>
  );
}
