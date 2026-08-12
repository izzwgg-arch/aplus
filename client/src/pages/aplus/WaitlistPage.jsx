import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = ["WAITING", "CONTACTED", "SCHEDULED", "DECLINED", "NO_RESPONSE", "REMOVED"];
const STATUS_LABEL = {
  WAITING: "Waiting", CONTACTED: "Contacted", SCHEDULED: "Scheduled",
  DECLINED: "Declined", NO_RESPONSE: "No Response", REMOVED: "Removed",
};
const STATUS_CLS = {
  WAITING:     "bg-blue-50 text-blue-700 border-blue-200",
  CONTACTED:   "bg-purple-50 text-purple-700 border-purple-200",
  SCHEDULED:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  DECLINED:    "bg-red-50 text-red-700 border-red-200",
  NO_RESPONSE: "bg-slate-100 text-slate-500 border-slate-200",
  REMOVED:     "bg-slate-100 text-slate-400 border-slate-200",
};

const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
const PRIORITY_LABEL = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
const PRIORITY_CLS = {
  LOW:    "bg-slate-50 text-slate-500 border-slate-200",
  NORMAL: "bg-sky-50 text-sky-700 border-sky-200",
  HIGH:   "bg-amber-50 text-amber-700 border-amber-200",
  URGENT: "bg-red-50 text-red-700 border-red-200",
};

const DURATIONS = [15, 30, 45, 60, 90, 120];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWaitDays(createdAt) {
  return Math.floor((Date.now() - new Date(createdAt)) / 86400000);
}

function WaitBadge({ createdAt }) {
  const d = getWaitDays(createdAt);
  const cls =
    d <= 7  ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    d <= 14 ? "bg-amber-50 text-amber-700 border-amber-200" :
              "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {d === 0 ? "Today" : `${d}d`}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLS[status] ?? STATUS_CLS.WAITING}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PriorityBadge({ priority }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_CLS[priority] ?? PRIORITY_CLS.NORMAL}`}>
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WaitlistPage() {
  const toast = useToast();

  const [entries,   setEntries]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [clients,   setClients]   = useState([]);
  const [services,  setServices]  = useState([]);
  const [providers, setProviders] = useState([]);

  // Filters
  const [statusFilter,   setStatusFilter]   = useState(""); // "" = active only
  const [priorityFilter, setPriorityFilter] = useState("");
  const [serviceFilter,  setServiceFilter]  = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [search,         setSearch]         = useState("");

  // Panels
  const [addOpen,       setAddOpen]       = useState(false);
  const [editEntry,     setEditEntry]     = useState(null);
  const [scheduleEntry, setScheduleEntry] = useState(null);

  // Drag-and-drop
  const [dragId,     setDragId]     = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // ── Load data ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: statusFilter || undefined, priority: priorityFilter || undefined,
        serviceId: serviceFilter || undefined, providerId: providerFilter || undefined,
        search: search || undefined, limit: 200 };
      const { data } = await api.get("/waitlist", { params });
      setEntries(data.entries ?? data);
      setTotal(data.total ?? (data.entries ?? data).length);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, serviceFilter, providerFilter, search]);

  useEffect(() => { load(); }, [load]);

  // Load dropdowns once
  useEffect(() => {
    api.get("/clients?fields=minimal").then(({ data }) => setClients(Array.isArray(data) ? data : (data.data ?? []))).catch(() => {});
    api.get("/services").then(({ data }) => setServices(Array.isArray(data) ? data : (data.services ?? []))).catch(() => {});
    api.get("/providers").then(({ data }) => setProviders(Array.isArray(data) ? data : (data.providers ?? []))).catch(() => {});
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm("Remove this waitlist entry?")) return;
    await api.delete(`/waitlist/${id}`);
    toast?.success("Removed from waitlist.");
    load();
  };

  // ── Quick status change ───────────────────────────────────────────────────
  const setStatus = async (id, status) => {
    await api.patch(`/waitlist/${id}`, { status });
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status } : e));
  };

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragId) setDragOverId(id);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }

    const list = [...entries];
    const fromIdx = list.findIndex((x) => x.id === dragId);
    const toIdx   = list.findIndex((x) => x.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const updated = list.map((x, i) => ({ ...x, queuePosition: i + 1 }));
    setEntries(updated);

    api.post("/waitlist/reorder", {
      positions: updated.map((x) => ({ id: x.id, queuePosition: x.queuePosition })),
    }).catch(load);

    setDragId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Waitlist</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading ? "Loading…" : `${total} entr${total === 1 ? "y" : "ies"}`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>
          + Add to Waitlist
        </button>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-3 py-3">
        <input
          type="search"
          className="saas-input w-48"
          placeholder="Search client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="saas-input w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Active only</option>
          <option value="ALL">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select className="saas-input w-36" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <select className="saas-input w-44" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
          <option value="">All services</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="saas-input w-44" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
          <option value="">All providers</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        {(statusFilter || priorityFilter || serviceFilter || providerFilter || search) && (
          <button
            className="text-xs text-slate-400 hover:text-slate-700 transition"
            onClick={() => { setStatusFilter(""); setPriorityFilter(""); setServiceFilter(""); setProviderFilter(""); setSearch(""); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="w-10 px-4 py-3 font-medium text-slate-500">#</th>
                <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                <th className="px-4 py-3 font-medium text-slate-500">Service</th>
                <th className="px-4 py-3 font-medium text-slate-500">Provider</th>
                <th className="px-4 py-3 font-medium text-slate-500">Priority</th>
                <th className="px-4 py-3 font-medium text-slate-500">Waiting</th>
                <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 font-medium text-slate-500">Notes</th>
                <th className="w-36 px-4 py-3 font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-4 w-full max-w-[120px] rounded" />
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                    No waitlist entries match your filters.
                  </td>
                </tr>
              )}

              {!loading && entries.map((entry, idx) => (
                <tr
                  key={entry.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, entry.id)}
                  onDragOver={(e)  => handleDragOver(e, entry.id)}
                  onDrop={(e)      => handleDrop(e, entry.id)}
                  onDragEnd={handleDragEnd}
                  className={[
                    "group border-b border-slate-100 transition-colors last:border-0",
                    dragId === entry.id  ? "opacity-40 bg-slate-50" : "bg-white hover:bg-slate-50",
                    dragOverId === entry.id ? "border-t-2 border-t-indigo-400" : "",
                  ].join(" ")}
                >
                  {/* Position */}
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-slate-400 select-none">
                      <svg className="h-3.5 w-3.5 shrink-0 cursor-grab opacity-40 group-hover:opacity-100 transition" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="5" cy="4" r="1.3"/><circle cx="11" cy="4" r="1.3"/>
                        <circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>
                        <circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/>
                      </svg>
                      <span className="text-xs font-medium text-slate-600">{idx + 1}</span>
                    </span>
                  </td>

                  {/* Client */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{entry.client?.fullName}</p>
                    {entry.client?.phone && <p className="text-xs text-slate-400">{entry.client.phone}</p>}
                  </td>

                  {/* Service */}
                  <td className="px-4 py-3">
                    {entry.service
                      ? <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
                          {entry.service.colorTag && (
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.service.colorTag }} />
                          )}
                          {entry.service.name}
                        </span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>

                  {/* Provider */}
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {entry.provider?.fullName ?? <span className="text-slate-300">—</span>}
                  </td>

                  {/* Priority */}
                  <td className="px-4 py-3">
                    <PriorityBadge priority={entry.priority} />
                  </td>

                  {/* Waiting */}
                  <td className="px-4 py-3">
                    <WaitBadge createdAt={entry.createdAt} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <select
                      className="cursor-pointer rounded-lg border-0 bg-transparent p-0 text-xs font-medium focus:outline-none focus:ring-0"
                      value={entry.status}
                      onChange={(e) => setStatus(entry.id, e.target.value)}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>

                  {/* Notes */}
                  <td className="max-w-[180px] px-4 py-3">
                    <p className="truncate text-xs text-slate-500" title={entry.notes ?? ""}>
                      {entry.notes || <span className="text-slate-300">—</span>}
                    </p>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <ActionButton
                        label="Schedule"
                        color="indigo"
                        onClick={() => setScheduleEntry(entry)}
                        icon={
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                        }
                      />
                      <ActionButton
                        label="Edit"
                        color="slate"
                        onClick={() => setEditEntry(entry)}
                        icon={
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        }
                      />
                      <ActionButton
                        label="Remove"
                        color="red"
                        onClick={() => handleDelete(entry.id)}
                        icon={
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                          </svg>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {addOpen && (
        <AddEntryModal
          clients={clients}
          services={services}
          providers={providers}
          onSave={() => { setAddOpen(false); load(); toast?.success("Added to waitlist."); }}
          onClose={() => setAddOpen(false)}
        />
      )}

      {editEntry && (
        <EditEntryModal
          entry={editEntry}
          services={services}
          providers={providers}
          onSave={() => { setEditEntry(null); load(); toast?.success("Entry updated."); }}
          onClose={() => setEditEntry(null)}
        />
      )}

      {scheduleEntry && (
        <ScheduleModal
          entry={scheduleEntry}
          services={services}
          providers={providers}
          onSave={() => { setScheduleEntry(null); load(); toast?.success("Appointment scheduled! Entry marked as Scheduled."); }}
          onClose={() => setScheduleEntry(null)}
        />
      )}
    </div>
  );
}

// ─── Small action button ───────────────────────────────────────────────────────
function ActionButton({ label, icon, color, onClick }) {
  const cls = {
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
    slate:  "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
    red:    "border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
  }[color] ?? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100";

  return (
    <button
      type="button"
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${cls}`}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            onClick={onClose}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Searchable client selector ───────────────────────────────────────────────
function ClientSearchSelect({ clients, value, onChange }) {
  const [query,   setQuery]   = useState("");
  const [open,    setOpen]    = useState(false);
  const wrapRef               = useRef(null);
  const inputRef              = useRef(null);

  const selected = useMemo(() => clients.find((c) => c.id === value), [clients, value]);

  const filtered = useMemo(() => {
    const q = query.trim();
    // No query → show first 60 alphabetically as a quick pick list
    if (!q) return clients.slice(0, 60);
    const qLower = q.toLowerCase();
    // Normalize to digits-only for phone matching (e.g. "814 686" or "+1814686" → "814686")
    const qDigits = q.replace(/\D/g, "");
    return clients.filter((c) => {
      if (c.fullName && c.fullName.toLowerCase().includes(qLower)) return true;
      const phones = [c.phone, c.phoneCell, c.phoneSecondary].filter(Boolean);
      if (qDigits.length > 0 && phones.some((p) => p.replace(/\D/g, "").includes(qDigits))) return true;
      return false;
    });
  }, [clients, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function handleSelect(client) {
    onChange(client.id);
    setOpen(false);
    setQuery("");
  }

  function handleClear(e) {
    e.stopPropagation();
    onChange("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      {/* Trigger / search input */}
      {selected && !open ? (
        // Show selected client name as a chip
        <div
          className="saas-input flex cursor-pointer items-center justify-between gap-2"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        >
          <span className="truncate text-sm text-slate-800">{selected.fullName}</span>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 text-slate-400 hover:text-slate-600 transition"
            aria-label="Clear"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className="saas-input pl-8 text-sm"
            placeholder="Search by name or phone…"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No clients match &ldquo;{query}&rdquo;</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(c); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600">
                  {(c.fullName || "?").charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.fullName}</span>
                {(c.phone || c.phoneCell || c.phoneSecondary) && (
                  <span className="shrink-0 text-xs text-slate-400">
                    {c.phone || c.phoneCell || c.phoneSecondary}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Entry Modal ──────────────────────────────────────────────────────────
function AddEntryModal({ clients, services, providers, onSave, onClose }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientId: "", serviceId: "", providerId: "", priority: "NORMAL", notes: "",
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.clientId) { toast?.error("Select a client."); return; }
    setSaving(true);
    try {
      await api.post("/waitlist", form);
      onSave();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not add entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add to Waitlist" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <FormRow label="Client *">
          <ClientSearchSelect
            clients={clients}
            value={form.clientId}
            onChange={(id) => setForm({ ...form, clientId: id })}
          />
        </FormRow>
        <FormRow label="Service">
          <select className="saas-input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
            <option value="">No preference</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Provider">
          <select className="saas-input" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
            <option value="">No preference</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </FormRow>
        <FormRow label="Priority">
          <select className="saas-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </FormRow>
        <FormRow label="Notes">
          <textarea
            className="saas-textarea min-h-[80px]"
            placeholder="E.g. Parent prefers afternoons, needs OT eval…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormRow>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Adding…" : "Add to Waitlist"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit Entry Modal ──────────────────────────────────────────────────────────
function EditEntryModal({ entry, services, providers, onSave, onClose }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    serviceId:  entry.serviceId  ?? "",
    providerId: entry.providerId ?? "",
    priority:   entry.priority   ?? "NORMAL",
    status:     entry.status     ?? "WAITING",
    notes:      entry.notes      ?? "",
  });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/waitlist/${entry.id}`, form);
      onSave();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit — ${entry.client?.fullName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <FormRow label="Service">
          <select className="saas-input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
            <option value="">No preference</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Provider">
          <select className="saas-input" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
            <option value="">No preference</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </FormRow>
        <div className="grid grid-cols-2 gap-4">
          <FormRow label="Priority">
            <select className="saas-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </FormRow>
          <FormRow label="Status">
            <select className="saas-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </FormRow>
        </div>
        <FormRow label="Notes">
          <textarea
            className="saas-textarea min-h-[90px]"
            placeholder="Internal notes…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormRow>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Schedule Modal ────────────────────────────────────────────────────────────
function ScheduleModal({ entry, services, providers, onSave, onClose }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const defaultTitle = [
    entry.client?.fullName,
    entry.service?.name ? `— ${entry.service.name}` : "",
  ].filter(Boolean).join(" ");

  const [form, setForm] = useState({
    title:          defaultTitle,
    startsAt:       "",
    durationMinutes: 60,
    serviceId:      entry.serviceId  ?? "",
    providerId:     entry.providerId ?? "",
    notes:          "",
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.startsAt) { toast?.error("Select a start date & time."); return; }
    setSaving(true);
    try {
      const start = new Date(form.startsAt);
      const end   = new Date(start.getTime() + Number(form.durationMinutes) * 60000);
      await api.post(`/waitlist/${entry.id}/schedule`, {
        ...form,
        startsAt: start.toISOString(),
        endsAt:   end.toISOString(),
      });
      onSave();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not schedule appointment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Schedule Appointment" onClose={onClose}>
      {/* Client summary banner */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold">
          {entry.client?.fullName?.[0] ?? "?"}
        </div>
        <div>
          <p className="font-semibold text-indigo-900">{entry.client?.fullName}</p>
          <p className="text-xs text-indigo-600">
            On waitlist {getWaitDays(entry.createdAt)} day{getWaitDays(entry.createdAt) !== 1 ? "s" : ""} ·{" "}
            <PriorityBadge priority={entry.priority} />
          </p>
      </div>
      </div>

        <form onSubmit={submit} className="space-y-4">
        <FormRow label="Appointment Title">
          <input className="saas-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </FormRow>

        <div className="grid grid-cols-2 gap-4">
          <FormRow label="Start Date & Time *">
            <input
              type="datetime-local"
            className="saas-input"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </FormRow>
          <FormRow label="Duration">
            <select className="saas-input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </FormRow>
        </div>

        <FormRow label="Service">
          <select className="saas-input" value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
            <option value="">None</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Provider">
          <select className="saas-input" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
            <option value="">Unassigned</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </FormRow>
        <FormRow label="Notes">
          <textarea
            className="saas-textarea min-h-[70px]"
            placeholder="Appointment notes…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </FormRow>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Scheduling…" : "Create Appointment"}
          </button>
        </div>
        </form>
    </Modal>
  );
}

// ─── FormRow helper ───────────────────────────────────────────────────────────
function FormRow({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
