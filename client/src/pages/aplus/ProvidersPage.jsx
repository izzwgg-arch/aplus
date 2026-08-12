import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { COLOR_TAGS, getColorTagStyle } from "../../lib/colorTags";

const emptyForm = {
  firstName: "", lastName: "", email: "", phone: "", title: "",
  credential: "", licenseNumber: "", npi: "", colorTag: "teal",
  defaultHourlyRate: "", overtimeHourlyRate: "", address: "", notes: "",
  isActive: true, serviceIds: [],
  commEmailReminders: true,
  commSmsReminders: false,
  commPreferredChannel: "EMAIL"
};

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  plus:    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16M4 12h16"/></svg>,
  search:  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/></svg>,
  dots:    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="2.5" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13.5" r="1.4"/></svg>,
  edit:    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>,
  archive: <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/></svg>,
  restore: <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>,
  trash:   <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>,
  x:       <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18 18 6M6 6l12 12"/></svg>,
};

// ── Initials avatar ───────────────────────────────────────────────────────────
function Avatar({ name, colorTag }) {
  const parts = (name || "?").trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0][0] || "?").toUpperCase();
  // Use colorTag to pick gradient
  const gradients = {
    teal:   "from-teal-500 to-cyan-600",    blue:   "from-blue-500 to-indigo-600",
    indigo: "from-indigo-500 to-violet-600", violet: "from-violet-500 to-purple-600",
    purple: "from-purple-500 to-pink-600",  pink:   "from-pink-500 to-rose-600",
    red:    "from-red-500 to-rose-600",     orange: "from-orange-500 to-amber-500",
    amber:  "from-amber-500 to-yellow-500", green:  "from-emerald-500 to-teal-600",
    gray:   "from-slate-400 to-slate-500",
  };
  const g = gradients[colorTag] || gradients.teal;
  return (
    <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ${g}`}>
      {initials}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ColorTagPicker({ value, onChange }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Color Tag</p>
      <div className="flex flex-wrap gap-2">
        {COLOR_TAGS.map((tag) => {
          const sel = value === tag;
          return (
            <button key={tag} type="button" onClick={() => onChange(tag)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${sel ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}>
              {tag}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getColorTagStyle(value).badge}`}>Preview</span>
      </div>
    </div>
  );
}

// ── Provider form modal ───────────────────────────────────────────────────────
function ProviderModal({ form, setForm, onSubmit, onClose, isSaving, isEdit, services, toggleServiceSelection }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{isEdit ? "Edit Provider" : "New Provider"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Credential details, color tag, and supported services</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">{Icon.x}</button>
        </div>

        <form id="provider-modal-form" onSubmit={onSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <input className="saas-input" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} required />
            </Field>
            <Field label="Last Name" required>
              <input className="saas-input" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <input className="saas-input" type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <input className="saas-input" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Title">
              <input className="saas-input" value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
            </Field>
            <Field label="Credential">
              <input className="saas-input" value={form.credential} onChange={(e) => setForm(p => ({ ...p, credential: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="License Number">
              <input className="saas-input" value={form.licenseNumber} onChange={(e) => setForm(p => ({ ...p, licenseNumber: e.target.value }))} />
            </Field>
            <Field label="NPI">
              <input className="saas-input" value={form.npi} onChange={(e) => setForm(p => ({ ...p, npi: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Default Hourly Rate">
              <input className="saas-input" type="number" min="0" step="0.01" value={form.defaultHourlyRate} onChange={(e) => setForm(p => ({ ...p, defaultHourlyRate: e.target.value }))} />
            </Field>
            <Field label="Overtime Hourly Rate">
              <input className="saas-input" type="number" min="0" step="0.01" value={form.overtimeHourlyRate} onChange={(e) => setForm(p => ({ ...p, overtimeHourlyRate: e.target.value }))} />
            </Field>
          </div>

          <ColorTagPicker value={form.colorTag} onChange={(tag) => setForm(p => ({ ...p, colorTag: tag }))} />

          <Field label="Address">
            <input className="saas-input" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} />
          </Field>

          <Field label="Notes">
            <textarea className="saas-textarea min-h-[60px]" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
          </Field>

          {/* Services */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">Supported Services</p>
            <div className="max-h-36 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              {services.map((svc) => (
                <label key={svc.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-sm text-slate-700 hover:bg-white transition">
                  <input type="checkbox" className="rounded" checked={form.serviceIds.includes(svc.id)} onChange={() => toggleServiceSelection(svc.id)} />
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getColorTagStyle(svc.colorTag).dot}`} />
                  {svc.name}
                </label>
              ))}
              {!services.length && <p className="text-sm text-slate-400 py-1">Create services first.</p>}
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.isActive} onChange={(e) => setForm(p => ({ ...p, isActive: e.target.checked }))} />
            Active provider
          </label>
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 shrink-0">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button form="provider-modal-form" type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? "Saving…" : isEdit ? "Save Changes" : "Create Provider"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row menu ──────────────────────────────────────────────────────────────────
function RowMenu({ item, onEdit, onToggleArchive, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative flex justify-end" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition opacity-0 group-hover:opacity-100"
        aria-label="Row actions"
      >
        {Icon.dots}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl" onMouseDown={e => e.stopPropagation()}>
          <button className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
            onClick={() => { setOpen(false); onEdit(item); }}>
            {Icon.edit}<span>Edit</span>
          </button>
          <button className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
            onClick={() => { setOpen(false); onToggleArchive(item); }}>
            {item.isActive ? Icon.archive : Icon.restore}
            <span>{item.isActive ? "Archive" : "Restore"}</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
            onClick={() => { setOpen(false); onDelete(item); }}>
            {Icon.trash}<span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProvidersPage() {
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [services, setServices]   = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [search, setSearch]       = useState("");
  const [status, setStatus]       = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      const [{ data: prov }, { data: svc }] = await Promise.all([
        api.get("/providers", { params: { search: search || undefined, status } }),
        api.get("/services",  { params: { status: "active" } })
      ]);
      setProviders(prov);
      setServices(svc);
    } catch (error) {
      setProviders([]); setServices([]);
      toast?.error(error?.response?.data?.error || "Could not load providers.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [status]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return providers.filter((p) => `${p.fullName} ${p.email || ""} ${p.title || ""}`.toLowerCase().includes(q));
  }, [providers, search]);

  const toggleServiceSelection = (serviceId) => {
    setForm(prev => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter((id) => id !== serviceId)
        : [...prev.serviceIds, serviceId]
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        defaultHourlyRate:  form.defaultHourlyRate  === "" ? null : Number(form.defaultHourlyRate),
        overtimeHourlyRate: form.overtimeHourlyRate === "" ? null : Number(form.overtimeHourlyRate),
        serviceLinks: form.serviceIds.map((serviceId) => ({ serviceId, isEnabled: true })),
        communicationPreference: {
          emailRemindersEnabled: form.commEmailReminders,
          smsRemindersEnabled: form.commSmsReminders,
          preferredChannel: form.commPreferredChannel
        }
      };
      if (editingId) { await api.put(`/providers/${editingId}`, payload); toast?.success("Provider updated."); }
      else           { await api.post("/providers", payload);             toast?.success("Provider created."); }
      setForm(emptyForm); setEditingId(null); setModalOpen(false);
      await load();
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save provider.");
    } finally { setIsSaving(false); }
  };

  const editProvider = (item) => {
    const cp = item.communicationPreference || {};
    setEditingId(item.id);
    setForm({
      firstName: item.firstName || "", lastName: item.lastName || "",
      email: item.email || "", phone: item.phone || "",
      title: item.title || "", credential: item.credential || "",
      licenseNumber: item.licenseNumber || "", npi: item.npi || "",
      colorTag: item.colorTag || "teal",
      defaultHourlyRate: item.defaultHourlyRate ?? "", overtimeHourlyRate: item.overtimeHourlyRate ?? "",
      address: item.address || "", notes: item.notes || "",
      isActive: item.isActive !== false,
      serviceIds: (item.serviceLinks || []).filter((x) => x.isEnabled).map((x) => x.serviceId),
      commEmailReminders: cp.emailRemindersEnabled !== false,
      commSmsReminders: cp.smsRemindersEnabled === true,
      commPreferredChannel: cp.preferredChannel || "EMAIL"
    });
    setModalOpen(true);
  };

  const toggleArchive = async (item) => {
    try {
      await api.post(`/providers/${item.id}/${item.isActive ? "archive" : "restore"}`);
      toast?.success(item.isActive ? "Provider archived." : "Provider restored.");
      await load();
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not update provider status.");
    }
  };

  const deleteProvider = async (item) => {
    if (!window.confirm(`Permanently delete "${item.fullName}"?\n\nThis cannot be undone. If this provider has appointments, deletion will be blocked.`)) return;
    try {
      await api.delete(`/providers/${item.id}`);
      toast?.success("Provider deleted.");
      if (editingId === item.id) { setEditingId(null); setForm(emptyForm); setModalOpen(false); }
      await load();
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not delete provider.");
    }
  };

  const closeModal = () => { setModalOpen(false); setEditingId(null); setForm(emptyForm); };

  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <tr key={`sk-${i}`} className="border-t border-slate-100">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full animate-pulse bg-slate-200 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </td>
      {[24, 28, 24, 16, 16].map((w, j) => (
        <td key={j} className="px-4 py-3.5"><div className={`h-3.5 w-${w} animate-pulse rounded bg-slate-100`} /></td>
      ))}
      <td className="px-4 py-3.5"><div className="ml-auto h-7 w-7 animate-pulse rounded-lg bg-slate-100" /></td>
    </tr>
  ));

  return (
    <div className="flex flex-col gap-0 min-h-0">

      {/* Command bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div>
          <h1 className="text-xl font-semibold text-slate-900">Providers</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isLoading ? "Loading…" : `${filtered.length} provider${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-56">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{Icon.search}</span>
            <input className="saas-input pl-9 text-sm" placeholder="Search providers…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          {/* Status */}
          <select className="saas-input w-32 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
          {/* New */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
            onClick={() => { setEditingId(null); setForm(emptyForm); setModalOpen(true); }}
          >
            {Icon.plus} New Provider
          </button>
            </div>
          </div>

      {/* Table card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Title / Credential</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Rates</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Services</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? skeletonRows : filtered.map((item) => (
                <tr key={item.id} className="group hover:bg-indigo-50/30 transition-colors">
                  {/* Provider name + avatar */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={item.fullName} colorTag={item.colorTag || "teal"} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.fullName}</p>
                        {item.npi && <p className="text-xs text-slate-400">NPI {item.npi}</p>}
                      </div>
                    </div>
                  </td>
                  {/* Title / Credential */}
                  <td className="px-4 py-3.5 text-sm text-slate-600">
                    {[item.title, item.credential].filter(Boolean).join(" / ") || <span className="text-slate-300">—</span>}
                  </td>
                  {/* Contact */}
                  <td className="px-4 py-3.5 text-sm">
                    {item.email && <p className="text-slate-700">{item.email}</p>}
                    {item.phone && <p className="text-xs text-slate-400">{item.phone}</p>}
                    {!item.email && !item.phone && <span className="text-slate-300">—</span>}
                  </td>
                  {/* Rates */}
                  <td className="px-4 py-3.5 text-sm text-slate-700">
                    <span className="font-medium">${item.defaultHourlyRate?.toFixed?.(2) || "0.00"}</span>
                    {item.overtimeHourlyRate != null && (
                      <span className="ml-1.5 text-xs text-slate-400">OT ${item.overtimeHourlyRate.toFixed(2)}</span>
                    )}
                    </td>
                  {/* Services count */}
                  <td className="px-4 py-3.5 text-sm text-slate-600">{item._count?.serviceLinks ?? 0}</td>
                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${item.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  {/* Actions */}
                  <td className="px-2 py-3.5">
                    <RowMenu item={item} onEdit={editProvider} onToggleArchive={toggleArchive} onDelete={deleteProvider} />
                  </td>
                </tr>
              ))}
              {!isLoading && !filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="mx-auto max-w-xs">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
                      </div>
                      <p className="font-medium text-slate-700">{search ? `No providers match "${search}"` : "No providers yet"}</p>
                      {!search && <p className="mt-1 text-xs text-slate-400">Add your first provider using the New Provider button.</p>}
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ProviderModal
          form={form} setForm={setForm}
          onSubmit={submit} onClose={closeModal}
          isSaving={isSaving} isEdit={!!editingId}
          services={services} toggleServiceSelection={toggleServiceSelection}
        />
      )}
    </div>
  );
}
