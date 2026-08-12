import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { COLOR_TAGS, getColorTagStyle } from "../../lib/colorTags";

const emptyForm = {
  name: "", code: "", description: "", colorTag: "blue",
  standardRate: "", overtimeRate: "", durationMinutes: "",
  category: "", notes: "", isActive: true,
  calendarBgColor: "", calendarNameColor: "",
  calendarServiceColor: "", calendarTimeColor: "",
};

// ── Calendar color presets ────────────────────────────────────────────────────
const CAL_BG_PRESETS = [
  { hex: "#dbeafe", label: "Blue" },
  { hex: "#ede9fe", label: "Violet" },
  { hex: "#ccfbf1", label: "Teal" },
  { hex: "#dcfce7", label: "Green" },
  { hex: "#fef3c7", label: "Amber" },
  { hex: "#fee2e2", label: "Red" },
  { hex: "#fce7f3", label: "Pink" },
  { hex: "#f1f5f9", label: "Slate" },
  { hex: "#ffffff", label: "White" },
];

const CAL_TEXT_PRESETS = [
  { hex: "#1e293b", label: "Dark Slate" },
  { hex: "#1d4ed8", label: "Blue" },
  { hex: "#5b21b6", label: "Purple" },
  { hex: "#0f766e", label: "Teal" },
  { hex: "#15803d", label: "Green" },
  { hex: "#b45309", label: "Amber" },
  { hex: "#b91c1c", label: "Red" },
  { hex: "#be185d", label: "Pink" },
  { hex: "#000000", label: "Black" },
];

function darkenColor(hex, factor = 0.25) {
  if (!hex || !hex.startsWith("#") || hex.length < 7) return hex;
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `rgb(${r},${g},${b})`;
}

// ── Single color row: label + swatches + custom picker ───────────────────────
function CalendarColorRow({ label, hint, value, onChange, presets }) {
  const inputHex = value && value.startsWith("#") && value.length === 7 ? value : "#2563eb";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => {
          const sel = value === p.hex;
          return (
            <button
              key={p.hex}
              type="button"
              title={p.label}
              onClick={() => onChange(p.hex)}
              style={{
                backgroundColor: p.hex,
                boxShadow: sel ? `0 0 0 2px white, 0 0 0 4px #6366f1` : "none",
                outline: p.hex === "#ffffff" ? "1px solid #e2e8f0" : "none",
              }}
              className="h-6 w-6 rounded-full border border-slate-200 transition-all hover:scale-110"
            />
          );
        })}
        {/* Custom picker */}
        <div className="flex items-center gap-1">
          <input
            type="color"
            value={inputHex}
            onChange={(e) => onChange(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-slate-200 p-0.5"
            title="Custom color"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition"
              title="Clear"
            >
              ✕
            </button>
          )}
        </div>
        {value && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Live preview card (simulates the appointment block) ───────────────────────
function AppointmentPreview({ bgColor, nameColor, svcColor, timeColor, serviceName }) {
  const bg     = bgColor     || "#dbeafe";
  const name   = nameColor   || "#1d4ed8";
  const svc    = svcColor    || name;
  const time   = timeColor   || name;
  const border = darkenColor(bg);
  return (
    <div
      style={{
        backgroundColor: bg,
        borderLeft: `3px solid ${border}`,
        borderRadius: "0 6px 6px 0",
        padding: "8px 10px",
        minWidth: 160,
        maxWidth: 220,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <p style={{ color: name, fontWeight: 700, fontSize: 12, marginBottom: 2, lineHeight: 1.3 }}>
        Sample Client
      </p>
      <p style={{ color: svc, fontWeight: 700, fontSize: 10, marginBottom: 2, lineHeight: 1.3, opacity: 0.9 }}>
        {serviceName || "Service Name"}
      </p>
      <p style={{ color: time, fontWeight: 700, fontSize: 10, lineHeight: 1.3, opacity: 0.8 }}>
        3:00 PM – 4:00 PM
      </p>
    </div>
  );
}

// ── Calendar colors section ───────────────────────────────────────────────────
function CalendarColorsSection({ form, setForm, serviceName }) {
  const set = (field, val) => setForm((p) => ({ ...p, [field]: val }));
  const hasAny = form.calendarBgColor || form.calendarNameColor || form.calendarServiceColor || form.calendarTimeColor;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Calendar Card Colors</p>
          <p className="mt-0.5 text-xs text-slate-500">
            These colors control how this service&apos;s appointment cards look on the calendar. Leave blank to use the default color tag.
          </p>
        </div>
        {hasAny && (
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, calendarBgColor: "", calendarNameColor: "", calendarServiceColor: "", calendarTimeColor: "" }))}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 transition"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <CalendarColorRow
          label="Background Color"
          hint="Card fill"
          value={form.calendarBgColor}
          onChange={(v) => set("calendarBgColor", v)}
          presets={CAL_BG_PRESETS}
        />
        <CalendarColorRow
          label="Client Name Color"
          hint="Top text"
          value={form.calendarNameColor}
          onChange={(v) => set("calendarNameColor", v)}
          presets={CAL_TEXT_PRESETS}
        />
        <CalendarColorRow
          label="Service Name Color"
          hint="Middle text"
          value={form.calendarServiceColor}
          onChange={(v) => set("calendarServiceColor", v)}
          presets={CAL_TEXT_PRESETS}
        />
        <CalendarColorRow
          label="Time Text Color"
          hint="Time line"
          value={form.calendarTimeColor}
          onChange={(v) => set("calendarTimeColor", v)}
          presets={CAL_TEXT_PRESETS}
        />
      </div>

      {/* Live preview */}
      {hasAny && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Preview</p>
          <AppointmentPreview
            bgColor={form.calendarBgColor}
            nameColor={form.calendarNameColor}
            svcColor={form.calendarServiceColor}
            timeColor={form.calendarTimeColor}
            serviceName={serviceName}
          />
        </div>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  plus: <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 4v16M4 12h16"/></svg>,
  search: <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/></svg>,
  dots: <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><circle cx="8" cy="2.5" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13.5" r="1.4"/></svg>,
  edit: <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>,
  archive: <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/></svg>,
  restore: <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>,
  x: <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18 18 6M6 6l12 12"/></svg>,
};

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

// ── Color tag picker (shared) ─────────────────────────────────────────────────
function ColorTagPicker({ value, onChange }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Color Tag</p>
      <div className="flex flex-wrap gap-2">
        {COLOR_TAGS.map((tag) => {
          const sel = value === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(tag)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${sel ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getColorTagStyle(value).badge}`}>
          Preview
        </span>
      </div>
    </div>
  );
}

// ── Service form modal ────────────────────────────────────────────────────────
function ServiceModal({ form, setForm, onSubmit, onClose, isSaving, isEdit, serviceName }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{isEdit ? "Edit Service" : "New Service"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure service metadata, pricing, and calendar card colors</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">{Icon.x}</button>
        </div>

        <form id="service-modal-form" onSubmit={onSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" required>
              <input className="saas-input" value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} required />
            </Field>
            <Field label="Code">
              <input className="saas-input" value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))} />
            </Field>
          </div>

          <Field label="Description">
            <input className="saas-input" value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <input className="saas-input" value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))} />
            </Field>
            <Field label="Duration (min)">
              <input className="saas-input" type="number" min="1" step="1" value={form.durationMinutes} onChange={(e) => setForm(p => ({ ...p, durationMinutes: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Standard Rate" required>
              <input className="saas-input" type="number" min="0" step="0.01" value={form.standardRate} onChange={(e) => setForm(p => ({ ...p, standardRate: e.target.value }))} required />
            </Field>
            <Field label="Overtime Rate">
              <input className="saas-input" type="number" min="0" step="0.01" value={form.overtimeRate} onChange={(e) => setForm(p => ({ ...p, overtimeRate: e.target.value }))} />
            </Field>
          </div>

          <ColorTagPicker value={form.colorTag} onChange={(tag) => setForm(p => ({ ...p, colorTag: tag }))} />

          <CalendarColorsSection form={form} setForm={setForm} serviceName={serviceName} />

          <Field label="Notes">
            <textarea className="saas-textarea min-h-[72px]" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
          </Field>

          <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" className="rounded" checked={form.isActive} onChange={(e) => setForm(p => ({ ...p, isActive: e.target.checked }))} />
            Active service
          </label>
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 shrink-0">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button form="service-modal-form" type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? "Saving…" : isEdit ? "Save Changes" : "Create Service"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row menu ──────────────────────────────────────────────────────────────────
function RowMenu({ item, onEdit, onToggleArchive }) {
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
        <div className="absolute right-0 top-8 z-50 w-44 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl" onMouseDown={e => e.stopPropagation()}>
          <button className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition" onClick={() => { setOpen(false); onEdit(item); }}>
            {Icon.edit}<span>Edit</span>
          </button>
          <button className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition" onClick={() => { setOpen(false); onToggleArchive(item); }}>
            {item.isActive ? Icon.archive : Icon.restore}
            <span>{item.isActive ? "Archive" : "Restore"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ServicesPage() {
  const toast = useToast();
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
      const { data } = await api.get("/services", { params: { search: search || undefined, status } });
      setServices(data);
    } catch (error) {
      setServices([]);
      toast?.error(error?.response?.data?.error || "Could not load services.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [status]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return services.filter((s) => `${s.name} ${s.code || ""} ${s.category || ""}`.toLowerCase().includes(q));
  }, [services, search]);

  const submit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        standardRate:    Number(form.standardRate),
        overtimeRate:    form.overtimeRate    === "" ? null : Number(form.overtimeRate),
        durationMinutes: form.durationMinutes === "" ? null : Number(form.durationMinutes),
      };
      if (editingId) { await api.put(`/services/${editingId}`, payload); toast?.success("Service updated."); }
      else           { await api.post("/services", payload);             toast?.success("Service created."); }
      setForm(emptyForm); setEditingId(null); setModalOpen(false);
      await load();
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save service.");
    } finally { setIsSaving(false); }
  };

  const editService = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "", code: item.code || "", description: item.description || "",
      colorTag: item.colorTag || "blue", standardRate: item.standardRate ?? "",
      overtimeRate: item.overtimeRate ?? "", durationMinutes: item.durationMinutes ?? "",
      category: item.category || "", notes: item.notes || "", isActive: item.isActive !== false,
      calendarBgColor:      item.calendarBgColor      || "",
      calendarNameColor:    item.calendarNameColor     || "",
      calendarServiceColor: item.calendarServiceColor  || "",
      calendarTimeColor:    item.calendarTimeColor     || "",
    });
    setModalOpen(true);
  };

  const toggleArchive = async (item) => {
    try {
      await api.post(`/services/${item.id}/${item.isActive ? "archive" : "restore"}`);
      toast?.success(item.isActive ? "Service archived." : "Service restored.");
      await load();
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not update service status.");
    }
  };

  const closeModal = () => { setModalOpen(false); setEditingId(null); setForm(emptyForm); };

  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <tr key={`sk-${i}`} className="border-t border-slate-100">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-full animate-pulse bg-slate-200 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </td>
      {[28, 32, 20, 16, 16].map((w, j) => (
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
          <h1 className="text-xl font-semibold text-slate-900">Services</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isLoading ? "Loading…" : `${filtered.length} service${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-56">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{Icon.search}</span>
            <input className="saas-input pl-9 text-sm" placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          {/* Status filter */}
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
            {Icon.plus} New Service
          </button>
            </div>
          </div>

      {/* Table card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Service</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Rates</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Usage</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? skeletonRows : filtered.map((item) => (
                <tr key={item.id} className="group hover:bg-indigo-50/30 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${getColorTagStyle(item.colorTag).dot}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.name}</p>
                        {item.category && <p className="text-xs text-slate-400">{item.category}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">
                    {item.code
                      ? <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-medium text-slate-700">{item.code}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-700">
                    <span className="font-medium">${item.standardRate.toFixed(2)}</span>
                    {item.overtimeRate != null && <span className="ml-1.5 text-xs text-slate-400">OT ${item.overtimeRate.toFixed(2)}</span>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">
                    {item.durationMinutes ? `${item.durationMinutes} min` : <span className="text-slate-300">—</span>}
                    </td>
                  <td className="px-4 py-3.5 text-sm text-slate-600">{item._count?.appointments ?? 0}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${item.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  <td className="px-2 py-3.5">
                    <RowMenu item={item} onEdit={editService} onToggleArchive={toggleArchive} />
                    </td>
                  </tr>
                ))}
                {!isLoading && !filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="mx-auto max-w-xs">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z"/></svg>
                      </div>
                      <p className="font-medium text-slate-700">{search ? `No services match "${search}"` : "No services yet"}</p>
                      {!search && <p className="mt-1 text-xs text-slate-400">Create your first service using the New Service button.</p>}
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
        <ServiceModal
          form={form} setForm={setForm}
          onSubmit={submit} onClose={closeModal}
          isSaving={isSaving} isEdit={!!editingId}
          serviceName={form.name}
        />
      )}
    </div>
  );
}
