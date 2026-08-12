import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { useClientsListCache } from "../../context/ClientsListContext";
import useHotkey from "../../hooks/useHotkey";

const LIMIT = 50;
const ANCHOR_KEY = "clients-anchor-id";

const emptyForm = {
  firstName: "", lastName: "", dob: "", address: "", phone: "",
  phoneCell: "", phoneSecondary: "",
  email: "", zip: "", insurance: "", notes: "", hourlyRate: "",
  cancellationFeeEnabled: false
};

// ── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  search: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
    </svg>
  ),
  plus: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M12 4v16M4 12h16"/>
    </svg>
  ),
  chevLeft: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
    </svg>
  ),
  chevRight: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
    </svg>
  ),
  dots: (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
      <circle cx="8" cy="2.5" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="8" cy="13.5" r="1.4"/>
    </svg>
  ),
  user: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
    </svg>
  ),
  edit: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>
    </svg>
  ),
  trash: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
    </svg>
  ),
  x: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M6 18 18 6M6 6l12 12"/>
    </svg>
  ),
  upload: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
    </svg>
  ),
  download: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/>
    </svg>
  ),
  filter: (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591L15.75 12.17a2.25 2.25 0 0 0-.659 1.591v3.23l-4.5 2.25V13.76a2.25 2.25 0 0 0-.659-1.591L3.659 7.41A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"/>
    </svg>
  ),
};

// Initials avatar
function Avatar({ name }) {
  const parts = (name || "?").trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0][0] || "?").toUpperCase();
  const colors = [
    "bg-indigo-100 text-indigo-700", "bg-violet-100 text-violet-700",
    "bg-blue-100 text-blue-700",    "bg-cyan-100 text-cyan-700",
    "bg-teal-100 text-teal-700",    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",  "bg-rose-100 text-rose-700",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${color}`}>
      {initials}
    </span>
  );
}

// Form field
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

// ── Client form modal (add + edit) ──────────────────────────────────────────
function ClientFormModal({ form, setForm, onSubmit, onClose, isSaving, isEdit, selectedFile, setSelectedFile }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{isEdit ? "Edit Client" : "New Client"}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{isEdit ? "Update client details" : "Add a new client to the directory"}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            {Icon.x}
          </button>
        </div>

        {/* Body */}
        <form id="client-modal-form" onSubmit={onSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <input className="saas-input" value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} required />
            </Field>
            <Field label="Last Name" required>
              <input className="saas-input" value={form.lastName} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of Birth">
              <input className="saas-input" type="date" value={form.dob} onChange={(e) => setForm(p => ({ ...p, dob: e.target.value }))} />
            </Field>
            <Field label="Insurance">
              <input className="saas-input" value={form.insurance} onChange={(e) => setForm(p => ({ ...p, insurance: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Home Phone">
              <input className="saas-input" value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} />
            </Field>
            <Field label="Cell Phone">
              <input className="saas-input" value={form.phoneCell} onChange={(e) => setForm(p => ({ ...p, phoneCell: e.target.value }))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Secondary Phone">
              <input className="saas-input" value={form.phoneSecondary} onChange={(e) => setForm(p => ({ ...p, phoneSecondary: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input className="saas-input" type="email" value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />
            </Field>
          </div>

          <Field label="Address">
            <input className="saas-input" value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="ZIP">
              <input className="saas-input" value={form.zip} onChange={(e) => setForm(p => ({ ...p, zip: e.target.value }))} />
            </Field>
            <Field label="Hourly Rate">
              <input className="saas-input" type="number" min="0" step="0.01" value={form.hourlyRate} onChange={(e) => setForm(p => ({ ...p, hourlyRate: e.target.value }))} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea className="saas-textarea min-h-[72px]" value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
          </Field>

          <label className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={form.cancellationFeeEnabled}
              onChange={(e) => setForm(p => ({ ...p, cancellationFeeEnabled: e.target.checked }))}
            />
            Enable cancellation fee for this client
          </label>

          {!isEdit && (
            <Field label="Upload Initial Document">
              <input
                className="block w-full text-sm text-slate-600"
                type="file"
                accept=".pdf,.doc,.docx,.jpeg,.jpg,.png"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </Field>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4 shrink-0">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button form="client-modal-form" type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? "Saving…" : isEdit ? "Save Changes" : "Create Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const cacheCtx = useClientsListCache();
  const [searchParams, setSearchParams] = useSearchParams();

  const page               = Math.max(1, Number(searchParams.get("page")  || "1"));
  const committedSearch    = searchParams.get("search") || "";
  const showDefaultDobOnly = searchParams.get("dob") === "1";

  const cache        = cacheCtx?.cache;
  const updateCache  = cacheCtx?.updateCache;
  const cacheMatches = cache && cache.page === page && cache.search === committedSearch && cache.dobFilter === showDefaultDobOnly;

  const [searchInput, setSearchInput] = useState(committedSearch);
  const [clients, setClients]    = useState(cacheMatches && Array.isArray(cache.clients) ? cache.clients : []);
  const [total, setTotal]        = useState(cacheMatches && typeof cache.total === "number" ? cache.total : 0);
  const [totalPages, setTotalPages] = useState(cacheMatches && typeof cache.totalPages === "number" ? cache.totalPages : 1);
  const [isLoading, setIsLoading]   = useState(!cacheMatches);

  const tableRef          = useRef(null);
  const anchorRestoredRef = useRef(false);
  const searchInputRef    = useRef(null);
  const importCsvInputRef = useRef(null);

  // ── Modal / form state ────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]           = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  const [form, setForm]                     = useState(emptyForm);
  const [selectedFile, setSelectedFile]     = useState(null);
  const [isSaving, setIsSaving]             = useState(false);

  // ── CSV state ─────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // ── Row menu ──────────────────────────────────────────────────────────────
  const [menuState, setMenuState] = useState(null);

  useHotkey({ key: "k", ctrlOrMeta: true, onTrigger: () => searchInputRef.current?.focus() });
  useHotkey({ key: "n", ctrlOrMeta: true, onTrigger: () => { setEditingClientId(null); setForm(emptyForm); setModalOpen(true); } });

  // ── URL persistence ───────────────────────────────────────────────────────
  useEffect(() => {
    sessionStorage.setItem("clients-dir-url", window.location.search);
  });

  const saveAnchor = useCallback((clientId) => {
    sessionStorage.setItem(ANCHOR_KEY, clientId);
  }, []);

  useEffect(() => {
    if (isLoading || anchorRestoredRef.current) return;
    anchorRestoredRef.current = true;
    const anchorId = sessionStorage.getItem(ANCHOR_KEY);
    if (!anchorId) return;
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-client-id="${anchorId}"]`);
      if (row) row.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }, [isLoading]);

  // ── Debounce search ───────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput === committedSearch) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (searchInput) next.set("search", searchInput); else next.delete("search");
        next.set("page", "1");
        return next;
      }, { replace: true });
      document.getElementById("app-main-scroll")?.scrollTo(0, 0);
      if (tableRef.current) tableRef.current.scrollTop = 0;
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, committedSearch, setSearchParams]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const goToPage = useCallback((newPage) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(newPage));
      return next;
    });
    document.getElementById("app-main-scroll")?.scrollTo(0, 0);
    if (tableRef.current) tableRef.current.scrollTop = 0;
  }, [setSearchParams]);

  const toggleDobFilter = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (showDefaultDobOnly) { next.delete("dob"); }
      else { next.set("dob", "1"); next.set("page", "1"); }
      return next;
    }, { replace: true });
    document.getElementById("app-main-scroll")?.scrollTo(0, 0);
    if (tableRef.current) tableRef.current.scrollTop = 0;
  }, [showDefaultDobOnly, setSearchParams]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: res } = await api.get("/clients", {
        params: { page, limit: LIMIT, search: committedSearch || undefined, defaultDobOnly: showDefaultDobOnly ? "true" : undefined }
      });
      setClients(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      if (updateCache) updateCache({ page, search: committedSearch, dobFilter: showDefaultDobOnly, clients: res.data, total: res.total, totalPages: res.totalPages });
    } catch (error) {
      setClients([]);
      toast?.error(error?.response?.data?.error || "Could not load clients.");
    } finally {
      setIsLoading(false);
    }
  }, [page, committedSearch, showDefaultDobOnly, updateCache]);

  useEffect(() => {
    if (cacheMatches) return;
    load();
  }, [load, cacheMatches]);

  // ── Row menu ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!menuState) return;
    const close = () => setMenuState(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, true); };
  }, [menuState]);

  const openMenu = (e, client) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({ client, top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const hasDefaultDob = (v) => {
    if (!v) return false;
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === "2000-01-01";
  };
  const formatDate = (v) => {
    if (!v) return null;
    if (hasDefaultDob(v)) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const startEditClient = (client) => {
    const parts = (client.fullName || "").trim().split(/\s+/);
    const firstName = client.firstName || (parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0]) || "";
    const lastName  = client.lastName  || (parts.length > 1 ? parts[parts.length - 1] : "") || "";
    setEditingClientId(client.id);
    setForm({
      firstName, lastName,
      dob: client.dob ? (() => { const d = new Date(client.dob); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10); })() : "",
      address: client.address || "",
      phone: client.phone || "", phoneCell: client.phoneCell || "", phoneSecondary: client.phoneSecondary || "",
      email: client.email || "",
      zip: client.zip || "", insurance: client.insurance || "", notes: client.notes || "",
      hourlyRate: client.hourlyRate != null ? String(client.hourlyRate) : "",
      cancellationFeeEnabled: Boolean(client.cancellationFeeEnabled),
    });
    setSelectedFile(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingClientId(null);
    setForm(emptyForm);
    setSelectedFile(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault();
    const fullName = `${form.lastName} ${form.firstName}`.trim();
    if (!fullName) { toast?.error("First and last name are required."); return; }
    setIsSaving(true);
    const payload = {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), fullName,
      dob: form.dob || null, address: form.address,
      phone: form.phone, phoneCell: form.phoneCell, phoneSecondary: form.phoneSecondary,
      email: form.email, zip: form.zip, insurance: form.insurance, notes: form.notes,
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
      cancellationFeeEnabled: form.cancellationFeeEnabled
    };
    if (editingClientId) {
      try {
        await api.put(`/clients/${editingClientId}`, payload);
        await load();
        closeModal();
        toast?.success("Client updated.");
      } catch (error) {
        toast?.error(error?.response?.data?.error || "Could not update client.");
      } finally { setIsSaving(false); }
      return;
    }
    try {
      const { data } = await api.post("/clients", payload);
      if (selectedFile) {
        const fd = new FormData(); fd.append("file", selectedFile);
        await api.post(`/clients/${data.id}/documents`, fd);
      }
      await load();
      closeModal();
      toast?.success("Client created.");
    } catch { toast?.error("Could not create client."); }
    finally { setIsSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteClient = async (client) => {
    if (!window.confirm(`Permanently delete "${client.fullName}"?\n\nThis removes all appointments, invoices, files, and records. This cannot be undone.`)) return;
    try {
      await api.delete(`/clients/${client.id}`);
      toast?.success(`${client.fullName} deleted.`);
      await load();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not delete client.");
    }
  };

  // ── CSV ───────────────────────────────────────────────────────────────────
  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const response = await api.get("/clients/export.csv", { responseType: "blob" });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const match = (response.headers?.["content-disposition"] || "").match(/filename="?([^"]+)"?/i);
      link.href = url; link.setAttribute("download", match?.[1] || "clients-export.csv");
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      toast?.success("Clients exported.");
    } catch { toast?.error("Could not export."); }
    finally { setIsExporting(false); }
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post(
        "/clients/import.csv?skipDuplicates=true&updatePhones=true&cellFromOtherOnly=true",
        fd
      );
      await load();
      setImportResult(data);
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not import CSV.");
    } finally { event.target.value = ""; setIsImporting(false); }
  };

  // ── Skeleton ──────────────────────────────────────────────────────────────
  const skeletonRows = Array.from({ length: 10 }).map((_, i) => (
    <tr key={`sk-${i}`} className="border-t border-slate-100">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full animate-pulse bg-slate-200 shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5"><div className="h-3.5 w-20 animate-pulse rounded bg-slate-100" /></td>
      <td className="px-4 py-3.5"><div className="h-3.5 w-28 animate-pulse rounded bg-slate-100" /></td>
      <td className="px-4 py-3.5"><div className="h-3.5 w-24 animate-pulse rounded bg-slate-100" /></td>
      <td className="px-4 py-3.5"><div className="ml-auto h-7 w-7 animate-pulse rounded-lg bg-slate-100" /></td>
    </tr>
  ));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0 min-h-0">

      {/* ── Command bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Client Directory</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isLoading ? "Loading…" : `${total.toLocaleString()} client${total !== 1 ? "s" : ""}${committedSearch ? ` matching "${committedSearch}"` : ""}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-64">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{Icon.search}</span>
            <input
              ref={searchInputRef}
              className="saas-input pl-9 text-sm"
              placeholder="Search clients…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* DOB filter */}
          <button
            type="button"
            onClick={toggleDobFilter}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              showDefaultDobOnly
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {Icon.filter}
            {showDefaultDobOnly ? "Clear DOB filter" : "Missing DOB"}
          </button>

          {/* Import */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
            disabled={isImporting}
            onClick={() => importCsvInputRef.current?.click()}
          >
            {Icon.upload}
            {isImporting ? "Importing…" : "Import"}
          </button>
          <input ref={importCsvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />

          {/* Export */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
            disabled={isExporting}
            onClick={exportCsv}
          >
            {Icon.download}
            {isExporting ? "Exporting…" : "Export"}
          </button>

          {/* New client */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
            onClick={() => { setEditingClientId(null); setForm(emptyForm); setModalOpen(true); }}
          >
            {Icon.plus}
            New Client
          </button>
        </div>
      </div>

      {/* ── Table card ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0">

        {/* Table */}
        <div ref={tableRef} className="overflow-auto flex-1">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">DOB</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Insurance</th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? skeletonRows : clients.map((client) => {
                const dobText = formatDate(client.dob);
                return (
                  <tr
                    key={client.id}
                    data-client-id={client.id}
                    className="group hover:bg-indigo-50/30 transition-colors"
                  >
                    {/* Client cell with avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={client.fullName} />
                        <div className="min-w-0">
                          <Link
                            to={`/aplus/clients/${client.id}/overview`}
                            onClick={() => saveAnchor(client.id)}
                            className="block truncate font-medium text-slate-900 hover:text-indigo-600 transition-colors"
                          >
                            {client.fullName}
                          </Link>
                          {client.email && (
                            <span className="block truncate text-xs text-slate-400">{client.email}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* DOB */}
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {hasDefaultDob(client.dob) ? (
                        <span className="inline-flex rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Needs update
                        </span>
                      ) : dobText ? (
                        <span>{dobText}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {client.phone || <span className="text-slate-300">—</span>}
                    </td>

                    {/* Insurance */}
                    <td className="px-4 py-3">
                      {client.insurance ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {client.insurance}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => openMenu(e, client)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition opacity-0 group-hover:opacity-100"
                        aria-label="Row actions"
                      >
                        {Icon.dots}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!isLoading && !clients.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="mx-auto max-w-xs">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        {Icon.user}
                      </div>
                      <p className="font-medium text-slate-700">
                        {committedSearch ? `No clients found for "${committedSearch}"` : showDefaultDobOnly ? "No clients with missing DOB" : "No clients yet"}
                      </p>
                      {!committedSearch && !showDefaultDobOnly && (
                        <p className="mt-1 text-xs text-slate-400">Add your first client using the New Client button above.</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination bar ────────────────────────────────────────────── */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
            <span>Page {page} of {totalPages} &middot; {total.toLocaleString()} clients</span>
            <div className="flex items-center gap-1">
              <button className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition" disabled={page <= 1} onClick={() => goToPage(Math.max(1, page - 1))}>
                {Icon.chevLeft}
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let num;
                if (totalPages <= 7)          num = i + 1;
                else if (page <= 4)           num = i < 6 ? i + 1 : totalPages;
                else if (page >= totalPages - 3) num = i === 0 ? 1 : totalPages - 6 + i;
                else { const map = [1, page - 2, page - 1, page, page + 1, page + 2, totalPages]; num = map[i]; }
                return (
                  <button
                    key={num}
                    onClick={() => goToPage(num)}
                    className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 font-medium transition ${
                      num === page ? "bg-indigo-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {num}
                  </button>
                );
              })}
              <button className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition" disabled={page >= totalPages} onClick={() => goToPage(Math.min(totalPages, page + 1))}>
                {Icon.chevRight}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {modalOpen && (
        <ClientFormModal
          form={form} setForm={setForm}
          onSubmit={submit} onClose={closeModal}
          isSaving={isSaving} isEdit={!!editingClientId}
          selectedFile={selectedFile} setSelectedFile={setSelectedFile}
        />
      )}

      {/* Import results modal */}
      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <h2 className="text-base font-semibold text-slate-900">Import Results</h2>
              <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition" onClick={() => setImportResult(null)}>{Icon.x}</button>
            </div>
            <div className="px-6 py-5 overflow-y-auto">
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "Total rows",            value: importResult.totalRows,    c: "slate" },
                  { label: "Imported",               value: importResult.imported,     c: "emerald" },
                  { label: "Phone backfilled",       value: importResult.updated ?? 0, c: "violet" },
                  { label: "Skipped (duplicate)",    value: importResult.skipped ?? 0, c: "blue" },
                  { label: "Failed",                 value: importResult.failed,       c: importResult.failed > 0 ? "red" : "slate" },
                ].map(({ label, value, c }) => (
                  <div key={label} className={`rounded-xl border p-3 text-center ${c === "emerald" ? "border-emerald-200 bg-emerald-50" : c === "red" ? "border-red-200 bg-red-50" : c === "blue" ? "border-blue-200 bg-blue-50" : c === "violet" ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50"}`}>
                    <p className={`text-2xl font-bold ${c === "emerald" ? "text-emerald-700" : c === "red" ? "text-red-700" : c === "blue" ? "text-blue-700" : c === "violet" ? "text-violet-700" : "text-slate-700"}`}>{value ?? 0}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
              {/* Column detection info */}
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <p className="font-medium text-slate-700 mb-1">Column detection</p>
                {importResult.phoneCellHeader
                  ? (
                    <p>
                      📱 Cell phone source: <span className="font-semibold text-violet-700">"{importResult.phoneCellHeader}"</span>
                      {importResult.cellFromOtherOnly && importResult.otherPhoneHeader && (
                        <span className="block mt-1 text-slate-500">Re-import mode: only the &quot;Other&quot; column maps to cellphone (no duplicate numbers vs home/other lines).</span>
                      )}
                    </p>
                  )
                  : <p className="text-amber-600">⚠️ No cell/Other phone column was detected. Use a column labeled &quot;Other&quot;, &quot;Other Phone&quot;, &quot;Cell&quot;, or &quot;Mobile&quot;.</p>
                }
              </div>

              {importResult.errors?.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Failed rows ({importResult.errors.length}):</p>
                  <div className="rounded-xl border border-red-100 bg-red-50 divide-y divide-red-100 max-h-72 overflow-y-auto text-xs">
                    {importResult.errors.map((err, i) => (
                      <div key={i} className="px-3 py-2">
                        <span className="font-medium text-red-700">Row {err.row}:</span>{" "}
                        <span className="text-red-600">{err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {importResult.failed === 0 && importResult.phoneCellHeader && (
                <p className="text-sm text-emerald-700">✓ Import complete — {importResult.updated ?? 0} client phone{importResult.updated !== 1 ? "s" : ""} updated.</p>
              )}
              {importResult.failed === 0 && !importResult.phoneCellHeader && (
                <p className="text-sm text-slate-500">Import complete. No phone column was found — no cell phones were updated.</p>
              )}
            </div>
            <div className="border-t border-slate-100 px-6 py-4 shrink-0 flex justify-end">
              <button className="btn-primary" onClick={() => setImportResult(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Row action menu */}
      {menuState && (
        <div
          className="fixed z-50 w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl"
          style={{ top: menuState.top, right: menuState.right }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
            onClick={() => { saveAnchor(menuState.client.id); setMenuState(null); navigate(`/aplus/clients/${menuState.client.id}/overview`); }}
          >
            {Icon.user}<span>View Profile</span>
          </button>
          <button
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
            onClick={() => { const c = menuState.client; setMenuState(null); startEditClient(c); }}
          >
            {Icon.edit}<span>Edit Client</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
            onClick={() => { const c = menuState.client; setMenuState(null); deleteClient(c); }}
          >
            {Icon.trash}<span>Delete Client</span>
          </button>
        </div>
      )}
    </div>
  );
}
