import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import ClientFilesTab from "./ClientFilesTab";

// Tab configuration
const TABS = [
  { slug: "overview",          label: "Overview",     icon: "chart" },
  { slug: "appointments",      label: "Appointments", icon: "calendar" },
  { slug: "invoices",          label: "Invoices",     icon: "doc" },
  { slug: "payments",          label: "Payments",     icon: "credit" },
  { slug: "files",             label: "Files",        icon: "folder" },
  { slug: "bba",               label: "BBA",          title: "Brain Balance Assessment" },
  { slug: "bbr",               label: "BBR",          title: "Brain Balance Report" },
  { slug: "ctr",               label: "CTR",          title: "Client Treatment Report" },
  { slug: "assessments",       label: "Assessments",  title: "Assessments" },
  { slug: "supplements",       label: "Supplements" },
  { slug: "registration_form", label: "Reg. Form",    title: "Registration Form" },
  { slug: "activity",          label: "Activity" },
];

const VALID_SLUGS = new Set(TABS.map((t) => t.slug));
const DEFAULT_TAB = "overview";

// ── Tiny icon set ─────────────────────────────────────────────────────────────
const TabIcon = {
  chart: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>,
  calendar: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>,
  doc: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>,
  credit: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"/></svg>,
  folder: <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25A2.25 2.25 0 0 0 4.5 16.5h15a2.25 2.25 0 0 0 2.25-2.25V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"/></svg>,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtMoney(v) { return `$${Number(v || 0).toFixed(2)}`; }

// Status badge
function StatusBadge({ status }) {
  const map = {
    ACTIVE:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    INACTIVE: "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] || "bg-amber-50 text-amber-700 border-amber-200"}`}>
      {status || "ACTIVE"}
    </span>
  );
}

// Appointment status badge
function ApptBadge({ status }) {
  const map = {
    SCHEDULED: "bg-blue-50 text-blue-700",
    COMPLETED: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-red-50 text-red-600",
    NO_SHOW:   "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

// Invoice status
function InvoiceBadge({ status }) {
  const map = {
    PAID:    "bg-emerald-50 text-emerald-700",
    UNPAID:  "bg-red-50 text-red-600",
    PENDING: "bg-amber-50 text-amber-700",
    VOID:    "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

// Initials avatar (larger)
function Avatar({ name, size = "lg" }) {
  const parts = (name || "?").trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0][0] || "?").toUpperCase();
  const colors = [
    "from-indigo-500 to-violet-600", "from-blue-500 to-indigo-600",
    "from-cyan-500 to-blue-600",     "from-teal-500 to-cyan-600",
    "from-violet-500 to-purple-600", "from-rose-500 to-pink-600",
    "from-amber-500 to-orange-500",  "from-emerald-500 to-teal-600",
  ];
  const color = colors[(name || "").charCodeAt(0) % colors.length];
  const sz = size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  return (
    <div className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-bold text-white shadow-sm ${color} ${sz}`}>
      {initials}
    </div>
  );
}

// Info row used in the overview grid
function InfoRow({ label, value, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children ?? <span className="text-sm font-medium text-slate-800">{value || "—"}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const toast    = useToast();
  const navigate = useNavigate();
  const { id, tab: rawTab } = useParams();

  const activeTab = VALID_SLUGS.has(rawTab?.toLowerCase()) ? rawTab.toLowerCase() : DEFAULT_TAB;

  const [client,    setClient]    = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [folderIds, setFolderIds] = useState(null);
  const [editOpen,  setEditOpen]  = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/clients/${id}`);
      setClient(data);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFolderIds = async () => {
    try {
      const { data } = await api.get(`/clients/${id}/files/roots`);
      setFolderIds(data);
    } catch {
      setFolderIds({});
    }
  };

  useEffect(() => {
    load().catch(() => toast?.error("Failed to load client details."));
    loadFolderIds();
  }, [id]);

  useEffect(() => {
    if (!rawTab) navigate(`/aplus/clients/${id}/${DEFAULT_TAB}`, { replace: true });
  }, [id, rawTab]);

  const tabHref = (slug) => `/aplus/clients/${id}/${slug}`;

  const activityItems = useMemo(() => {
    if (!client) return [];
    return [
      ...client.assessments.map((item) => ({ type: "Assessment", at: item.updatedAt, label: item.title })),
      ...client.invoices.map((item)    => ({ type: "Invoice",    at: item.updatedAt, label: item.invoiceNumber })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [client]);

  const paymentSummary = useMemo(() => {
    if (!client) return { paid: 0, refunded: 0 };
    return {
      paid:     client.payments.reduce((s, p) => s + Number(p.amount        || 0), 0),
      refunded: client.payments.reduce((s, p) => s + Number(p.refundedAmount || 0), 0),
    };
  }, [client]);

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete "${client?.fullName}"?\n\nThis removes all appointments, invoices, files, and records. This cannot be undone.`)) return;
    try {
      await api.delete(`/clients/${id}`);
      toast?.success("Client deleted.");
      const saved = sessionStorage.getItem("clients-dir-url") || "";
      navigate(`/aplus/clients${saved}`);
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not delete client.");
    }
  };

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl animate-pulse bg-slate-200" />
          <div className="flex-1 space-y-2.5">
            <div className="h-5 w-48 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-4 w-64 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-4 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-8 w-24 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      </div>
    </div>
  );

  if (!client) return (
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
      <p className="text-slate-500">Client not found.</p>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Profile header card ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

        {/* Subtle accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400" />

        <div className="px-6 py-5">
          {/* Top row: avatar + info + actions */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <Avatar name={client.fullName} size="lg" />

              <div className="min-w-0">
                {/* Breadcrumb */}
                <button
                  type="button"
                  onClick={() => { const s = sessionStorage.getItem("clients-dir-url") || ""; navigate(`/aplus/clients${s}`); }}
                  className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                  Clients
                </button>
                <h1 className="text-xl font-bold text-slate-900 leading-tight">{client.fullName}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                  {client.email && <span>{client.email}</span>}
                  {client.email && (client.phone || client.phoneCell) && <span className="text-slate-200">·</span>}
                  {client.phone && <span>{client.phone}</span>}
                  {client.phone && client.phoneCell && <span className="text-slate-200">·</span>}
                  {client.phoneCell && <span className="text-xs">Cell: {client.phoneCell}</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={client.status} />
                  {client.communicationPreference?.smsOptOut && (
                    <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                      SMS opt-out
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <ClientActionsMenu
                client={client}
                onReload={load}
                onEdit={() => setEditOpen(true)}
                onDelete={handleDelete}
              />
            </div>
          </div>

          {/* Quick stats strip */}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-xs">
            {client.insurance && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
                {client.insurance}
              </div>
            )}
            {client.dob && (() => {
              const d = new Date(client.dob);
              return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) !== "2000-01-01" ? (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25"/></svg>
                  DOB: {fmtDate(client.dob)}
                </div>
              ) : null;
            })()}
            {client.appointments?.length > 0 && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                {client.appointments.length} appointment{client.appointments.length !== 1 ? "s" : ""}
              </div>
            )}
            {client.payments?.length > 0 && (
              <div className="flex items-center gap-1.5 text-slate-500">
                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75"/></svg>
                {fmtMoney(paymentSummary.paid)} paid
              </div>
            )}
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-100 px-6">
          <div className="flex overflow-x-auto scrollbar-hide gap-0">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.slug;
              return (
                <Link
                  key={tab.slug}
                  to={tabHref(tab.slug)}
                  title={tab.title}
                  replace
                  className={`relative flex shrink-0 items-center gap-1.5 px-3.5 py-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "text-indigo-600"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.icon && TabIcon[tab.icon] && (
                    <span className={isActive ? "text-indigo-500" : "text-slate-400"}>{TabIcon[tab.icon]}</span>
                  )}
                  {tab.label}
                  {/* Active indicator line */}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-indigo-600" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}

      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Demographics grid */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Demographics</h2>
            <div className="grid grid-cols-2 gap-y-5 gap-x-8 sm:grid-cols-3">
              <InfoRow label="Date of Birth" value={fmtDate(client.dob)} />
              <InfoRow label="Home Phone" value={client.phone} />
              <InfoRow label="Cell Phone" value={client.phoneCell} />
              <InfoRow label="Secondary Phone" value={client.phoneSecondary} />
              <InfoRow label="Email" value={client.email} />
              <InfoRow label="Insurance" value={client.insurance} />
              <InfoRow label="ZIP" value={client.zip} />
              <InfoRow label="Hourly Rate" value={client.hourlyRate != null ? `$${Number(client.hourlyRate).toFixed(2)}/hr` : null} />
              <div className="col-span-2 sm:col-span-3">
                <InfoRow label="Address" value={client.address} />
              </div>
              {client.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <InfoRow label="Notes">
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{client.notes}</p>
                  </InfoRow>
                </div>
              )}
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Appointments",  value: client.appointments?.length ?? 0,  color: "indigo" },
              { label: "Invoices",      value: client.invoices?.length ?? 0,       color: "violet" },
              { label: "Total Paid",    value: fmtMoney(paymentSummary.paid),      color: "emerald" },
              { label: "Refunded",      value: fmtMoney(paymentSummary.refunded),  color: paymentSummary.refunded > 0 ? "amber" : "slate" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl border p-4 ${
                color === "indigo"  ? "border-indigo-100 bg-indigo-50"  :
                color === "violet"  ? "border-violet-100 bg-violet-50"  :
                color === "emerald" ? "border-emerald-100 bg-emerald-50":
                color === "amber"   ? "border-amber-100 bg-amber-50"    :
                "border-slate-100 bg-slate-50"
              }`}>
                <p className={`text-2xl font-bold ${
                  color === "indigo"  ? "text-indigo-700"  :
                  color === "violet"  ? "text-violet-700"  :
                  color === "emerald" ? "text-emerald-700" :
                  color === "amber"   ? "text-amber-700"   :
                  "text-slate-700"
                }`}>{value}</p>
                <p className="mt-0.5 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "appointments" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Appointments</h2>
            <p className="text-xs text-slate-400 mt-0.5">{client.appointments.length} total</p>
          </div>
          {client.appointments.length ? (
            <div className="divide-y divide-slate-100">
          {client.appointments.map((appt) => (
                <div key={appt.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{appt.title || "Appointment"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDateTime(appt.startsAt)}</p>
                  </div>
                  <ApptBadge status={appt.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-sm text-slate-400">No appointments on record.</div>
          )}
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Invoices</h2>
            <p className="text-xs text-slate-400 mt-0.5">{client.invoices.length} total</p>
          </div>
          {client.invoices.length ? (
            <div className="divide-y divide-slate-100">
          {client.invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Total {fmtMoney(invoice.total)} · Balance due {fmtMoney(invoice.balanceDue)}
                    </p>
                  </div>
                  <InvoiceBadge status={invoice.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-sm text-slate-400">No invoices on record.</div>
          )}
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-2xl font-bold text-emerald-700">{fmtMoney(paymentSummary.paid)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total paid</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-2xl font-bold text-slate-600">{fmtMoney(paymentSummary.refunded)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total refunded</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Payment History</h2>
                <p className="text-xs text-slate-400 mt-0.5">{client.payments.length} records</p>
              </div>
              <Link className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition" to={`/aplus/payments?clientId=${client.id}`}>
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16M4 12h16"/></svg>
                Charge Card
              </Link>
            </div>
            {client.payments.length ? (
              <div className="divide-y divide-slate-100">
          {client.payments.map((payment) => (
                  <div key={payment.id} className="px-6 py-3.5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{fmtMoney(payment.amount)}</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${payment.status === "SUCCEEDED" ? "bg-emerald-50 text-emerald-700" : payment.status === "REFUNDED" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                        {payment.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {fmtDateTime(payment.paymentDate)} · {payment.processor}
                      {payment.cardBrand && ` · ${payment.cardBrand} ···· ${payment.cardLast4 || ""}`}
                    </p>
                    {Number(payment.refundedAmount) > 0 && (
                      <p className="text-xs text-amber-600 mt-0.5">Refunded: {fmtMoney(payment.refundedAmount)}</p>
                    )}
            </div>
          ))}
              </div>
            ) : (
              <div className="px-6 py-14 text-center text-sm text-slate-400">No payments on record.</div>
            )}
          </div>

          {/* Stored cards */}
          {client.paymentMethodSnapshots?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Stored Payment Methods</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {client.paymentMethodSnapshots.map((snap) => (
                  <div key={snap.id} className="flex items-center gap-3 px-6 py-3.5">
                    <div className="flex h-8 w-12 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-500">
                      {snap.brand?.toUpperCase() || "CARD"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{snap.brand} •••• {snap.last4}</p>
                      {snap.expMonth && <p className="text-xs text-slate-400">Exp {snap.expMonth}/{snap.expYear}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Files */}
      {activeTab === "files" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <ClientFilesTab clientId={id} section="files" />
            </div>
      )}

      {/* Shortcut file tabs */}
      {["bba","bbr","ctr","supplements","assessments","registration_form"].includes(activeTab) && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {folderIds === null
            ? <div className="p-6"><div className="skeleton h-64 w-full rounded-xl" /></div>
            : <ClientFilesTab
                key={`${activeTab}-${folderIds[activeTab]}`}
                clientId={id}
                section="files"
                initialFolderId={folderIds[activeTab] ?? null}
              />
          }
        </div>
      )}

      {/* Edit modal */}
      {editOpen && (
        <EditClientModal
          client={client}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); load(); }}
        />
      )}

      {activeTab === "activity" && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Activity Log</h2>
            <p className="text-xs text-slate-400 mt-0.5">{activityItems.length} events</p>
          </div>
          {activityItems.length ? (
            <div className="divide-y divide-slate-100">
              {activityItems.map((entry, i) => (
                <div key={`${entry.type}-${i}`} className="flex items-start gap-3 px-6 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{entry.type}: {entry.label}</p>
                    <p className="text-xs text-slate-400">{fmtDateTime(entry.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center text-sm text-slate-400">No activity yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Edit client modal ─────────────────────────────────────────────────────────
function EditClientModal({ client, onClose, onSaved }) {
  const toast = useToast();
  const dob = client.dob ? (() => { const d = new Date(client.dob); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); })() : "";
  const [form, setForm] = useState({
    firstName: client.firstName || "",
    lastName:  client.lastName  || "",
    dob,
    phone:          client.phone          || "",
    phoneCell:      client.phoneCell      || "",
    phoneSecondary: client.phoneSecondary || "",
    email:    client.email    || "",
    address:  client.address  || "",
    zip:      client.zip      || "",
    insurance: client.insurance || "",
    notes:    client.notes    || "",
    hourlyRate: client.hourlyRate != null ? String(client.hourlyRate) : "",
    cancellationFeeEnabled: Boolean(client.cancellationFeeEnabled),
    status: client.status || "ACTIVE",
    commEmail: client.communicationPreference?.emailRemindersEnabled !== false,
    commSms: client.communicationPreference?.smsRemindersEnabled !== false,
    commPreferred: client.communicationPreference?.preferredChannel || "BOTH",
    commSmsOptOut: Boolean(client.communicationPreference?.smsOptOut),
    commNotes: client.communicationPreference?.reminderNotes || "",
  });
  const [saving, setSaving] = useState(false);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const ln = form.lastName.trim();
    const fn = form.firstName.trim();
    if (!fn && !ln) { toast?.error("Name is required."); return; }
    setSaving(true);
    try {
      await api.put(`/clients/${client.id}`, {
        firstName: fn, lastName: ln,
        fullName: [ln, fn].filter(Boolean).join(" "),
        dob: form.dob || null,
        phone: form.phone, phoneCell: form.phoneCell, phoneSecondary: form.phoneSecondary,
        email: form.email, address: form.address, zip: form.zip,
        insurance: form.insurance, notes: form.notes,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        cancellationFeeEnabled: form.cancellationFeeEnabled,
        status: form.status,
        communicationPreference: {
          emailRemindersEnabled: form.commEmail,
          smsRemindersEnabled: form.commSms,
          preferredChannel: form.commPreferred,
          smsOptOut: form.commSmsOptOut,
          reminderNotes: form.commNotes || null
        }
      });
      toast?.success("Client updated.");
      onSaved();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not update client.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Edit Client</h2>
            <p className="text-xs text-slate-500 mt-0.5">Update {client.fullName}'s details</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18 18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <form id="edit-client-form" onSubmit={submit} className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">First Name</label>
              <input className="saas-input" value={form.firstName} onChange={f("firstName")} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Last Name</label>
              <input className="saas-input" value={form.lastName} onChange={f("lastName")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Date of Birth</label>
              <input className="saas-input" type="date" value={form.dob} onChange={f("dob")} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Insurance</label>
              <input className="saas-input" value={form.insurance} onChange={f("insurance")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Home Phone</label>
              <input className="saas-input" value={form.phone} onChange={f("phone")} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Cell Phone</label>
              <input className="saas-input" value={form.phoneCell} onChange={f("phoneCell")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Secondary Phone</label>
              <input className="saas-input" value={form.phoneSecondary} onChange={f("phoneSecondary")} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input className="saas-input" type="email" value={form.email} onChange={f("email")} /></div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-slate-600">Address</label>
            <input className="saas-input" value={form.address} onChange={f("address")} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">ZIP</label>
              <input className="saas-input" value={form.zip} onChange={f("zip")} /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Hourly Rate</label>
              <input className="saas-input" type="number" min="0" step="0.01" value={form.hourlyRate} onChange={f("hourlyRate")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <select className="saas-input" value={form.status} onChange={f("status")}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
            <textarea className="saas-textarea min-h-[72px]" value={form.notes} onChange={f("notes")} /></div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Appointment reminders</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" checked={form.commEmail}
                  onChange={(e) => setForm((p) => ({ ...p, commEmail: e.target.checked }))} />
                Email reminders
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded" checked={form.commSms}
                  onChange={(e) => setForm((p) => ({ ...p, commSms: e.target.checked }))} />
                SMS reminders
              </label>
              <label className="flex items-center gap-2 text-rose-700">
                <input type="checkbox" className="rounded" checked={form.commSmsOptOut}
                  onChange={(e) => setForm((p) => ({ ...p, commSmsOptOut: e.target.checked }))} />
                SMS opted out (STOP)
              </label>
            </div>
            <label className="block text-xs text-slate-600">
              Preferred channel
              <select className="saas-input mt-1 w-full" value={form.commPreferred}
                onChange={(e) => setForm((p) => ({ ...p, commPreferred: e.target.value }))}>
                <option value="BOTH">Email and SMS</option>
                <option value="EMAIL">Email only</option>
                <option value="SMS">SMS only</option>
              </select>
            </label>
            <label className="block text-xs text-slate-600">
              Reminder notes (internal)
              <input className="saas-input mt-1 w-full" value={form.commNotes} onChange={(e) => setForm((p) => ({ ...p, commNotes: e.target.value }))} />
            </label>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.cancellationFeeEnabled}
              onChange={(e) => setForm(p => ({ ...p, cancellationFeeEnabled: e.target.checked }))} />
            Enable cancellation fee
          </label>
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 shrink-0">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button form="edit-client-form" type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Client three-dot actions menu ─────────────────────────────────────────────
function ClientActionsMenu({ client, onReload, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
        onClick={() => setOpen((o) => !o)}
        aria-label="More client actions"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="8" cy="2.5" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13.5" r="1.4"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
          <button
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
            onClick={() => { setOpen(false); onEdit(); }}
          >
            <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
            Edit Client
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
            onClick={() => { setOpen(false); onDelete(); }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
            Delete Client
          </button>
        </div>
      )}
    </div>
  );
}
