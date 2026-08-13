import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import useHotkey from "../../hooks/useHotkey";

const emptyForm = {
  firstName: "",
  lastName: "",
  dob: "",
  address: "",
  phone: "",
  email: "",
  zip: "",
  insurance: "",
  notes: "",
  hourlyRate: "",
  cancellationFeeEnabled: false
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingClientId, setEditingClientId] = useState(null);
  const [search, setSearch] = useState("");
  const [showDefaultDobOnly, setShowDefaultDobOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const searchInputRef = useRef(null);
  const importCsvInputRef = useRef(null);

  useHotkey({
    key: "k",
    ctrlOrMeta: true,
    onTrigger: () => searchInputRef.current?.focus()
  });

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await api.get("/clients");
      setClients(res.data);
    } catch (error) {
      setClients([]);
      toast?.error(error?.response?.data?.error || "Could not load clients.");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const hasDefaultDob = useCallback((value) => {
    if (!value) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === "2000-01-01";
  }, []);

  const filteredClients = clients.filter((client) => {
    const haystack = `${client.fullName} ${client.email || ""} ${client.phone || ""} ${client.insurance || ""}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesDobFilter = !showDefaultDobOnly || hasDefaultDob(client.dob);
    return matchesSearch && matchesDobFilter;
  });
  const defaultDobCount = clients.reduce((count, client) => (hasDefaultDob(client.dob) ? count + 1 : count), 0);

  const submit = async (e) => {
    e.preventDefault();
    const fullName = `${form.firstName} ${form.lastName}`.trim();
    if (!fullName) {
      toast?.error("First and last name are required.");
      return;
    }
    setIsSaving(true);
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      fullName,
      dob: form.dob,
      address: form.address,
      phone: form.phone,
      email: form.email,
      zip: form.zip,
      insurance: form.insurance,
      notes: form.notes,
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : undefined,
      cancellationFeeEnabled: form.cancellationFeeEnabled
    };
    if (editingClientId) {
      setIsSaving(true);
      try {
        await api.put(`/clients/${editingClientId}`, payload);
        await load();
        setEditingClientId(null);
        setForm(emptyForm);
        setSelectedFile(null);
        toast?.success("Client updated.");
      } catch (error) {
        toast?.error(error?.response?.data?.error || "Could not update client.");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    const optimisticId = `temp-${Date.now()}`;
    const optimisticClient = {
      id: optimisticId,
      fullName,
      dob: payload.dob || new Date().toISOString(),
      phone: payload.phone || "-",
      insurance: payload.insurance || ""
    };
    setClients((prev) => [optimisticClient, ...prev]);

    try {
      const { data } = await api.post("/clients", payload);
      if (selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        await api.post(`/clients/${data.id}/documents`, fd);
      }
      setClients((prev) => prev.map((client) => (client.id === optimisticId ? data : client)));
      setForm(emptyForm);
      setSelectedFile(null);
      toast?.success("Client created.");
    } catch {
      setClients((prev) => prev.filter((client) => client.id !== optimisticId));
      toast?.error("Could not create client.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditClient = (client) => {
    const firstName = client.firstName || "";
    const lastName = client.lastName || "";
    setEditingClientId(client.id);
    setForm({
      firstName,
      lastName,
      dob: client.dob ? new Date(client.dob).toISOString().slice(0, 10) : "",
      address: client.address || "",
      phone: client.phone || "",
      email: client.email || "",
      zip: client.zip || "",
      insurance: client.insurance || "",
      notes: client.notes || "",
      hourlyRate: client.hourlyRate ? String(client.hourlyRate) : "",
      cancellationFeeEnabled: Boolean(client.cancellationFeeEnabled)
    });
    setSelectedFile(null);
  };

  const formatDate = useCallback((value) => {
    if (hasDefaultDob(value)) return "Needs DOB update";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
  }, [hasDefaultDob]);

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const response = await api.get("/clients/export.csv", { responseType: "blob" });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const headerValue = response.headers?.["content-disposition"] || "";
      const filenameMatch = headerValue.match(/filename="?([^"]+)"?/i);
      link.href = url;
      link.setAttribute("download", filenameMatch?.[1] || "clients-export.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast?.success("Clients CSV exported.");
    } catch {
      toast?.error("Could not export clients CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  const importCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/clients/import.csv", fd);
      await load();
      toast?.success(`Import complete: ${data.imported} imported, ${data.failed} failed.`);
      if (data.failed > 0) {
        toast?.info("Some rows failed. Re-export to see expected CSV columns.");
      }
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not import CSV.");
    } finally {
      event.target.value = "";
      setIsImporting(false);
    }
  };

  return (
    /* h-full fills the <main> viewport area. flex-col stacks title above grid. */
    <div className="flex h-full flex-col gap-6">

      {/* Page title — always visible, never scrolls */}
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">Manage client records, contact details, and supporting documents.</p>
      </div>

      {/* Grid takes all remaining height. Default items-stretch lets left panel fill height. */}
      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[1.45fr_1fr]">

        {/* LEFT: stretches to fill the grid height, table scrolls inside */}
        <section className="card card-hover flex min-h-0 flex-col">
          <div className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Client Directory</h2>
              <p className="text-sm text-slate-500">{filteredClients.length} results</p>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={showDefaultDobOnly ? "btn-primary" : "btn-secondary"}
                onClick={() => setShowDefaultDobOnly((prev) => !prev)}
              >
                {showDefaultDobOnly ? "Showing DOB Cleanup" : `DOB Cleanup (${defaultDobCount})`}
              </button>
              <button type="button" className="btn-secondary" disabled={isExporting} onClick={exportCsv}>
                {isExporting ? "Exporting..." : "Export CSV"}
              </button>
              <button type="button" className="btn-secondary" disabled={isImporting} onClick={() => importCsvInputRef.current?.click()}>
                {isImporting ? "Importing..." : "Import CSV"}
              </button>
              <input
                ref={importCsvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={importCsv}
              />
              <div className="w-full sm:w-72">
                <input
                  ref={searchInputRef}
                  className="saas-input"
                  placeholder="Search clients..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">DOB</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Insurance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-t border-slate-200">
                    <td className="px-4 py-3" colSpan={6}>
                      <div className="skeleton-line w-full" />
                    </td>
                  </tr>
                ))}
                {filteredClients.map((client, index) => (
                  <tr
                    key={client.id}
                    className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50/50"} border-t border-slate-200 hover:bg-primary-50/40`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{client.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {hasDefaultDob(client.dob) ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          Needs DOB update
                        </span>
                      ) : formatDate(client.dob)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{client.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{client.insurance || "-"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {client.status || "ACTIVE"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2">
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => startEditClient(client)}>Edit</button>
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => navigate(`/aplus/clients/${client.id}`)}>View</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && !filteredClients.length && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                      No clients found for this search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* RIGHT panel — stationary, no scroll box */}
        <section className="card card-hover self-start">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">{editingClientId ? "Edit Client" : "Add Client"}</h2>
            <p className="text-sm text-slate-500">
              {editingClientId ? "Update client details and save changes." : "Create a client profile and attach initial intake documents."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">First Name</label>
                <input className="saas-input" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Last Name</label>
                <input className="saas-input" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">DOB</label>
                <input className="saas-input" type="date" value={form.dob} onChange={(e) => setForm((prev) => ({ ...prev, dob: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Phone</label>
                <input className="saas-input" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Email</label>
                <input className="saas-input" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Insurance</label>
                <input className="saas-input" value={form.insurance} onChange={(e) => setForm((prev) => ({ ...prev, insurance: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Address</label>
              <input className="saas-input" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">ZIP</label>
                <input className="saas-input" value={form.zip} onChange={(e) => setForm((prev) => ({ ...prev, zip: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Hourly Rate</label>
                <input className="saas-input" value={form.hourlyRate} onChange={(e) => setForm((prev) => ({ ...prev, hourlyRate: e.target.value }))} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Notes</label>
              <textarea className="saas-textarea min-h-[96px]" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.cancellationFeeEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, cancellationFeeEnabled: e.target.checked }))}
              />
              Enable cancellation fee for this client
            </label>

            {!editingClientId && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Upload Document</label>
              <input className="block w-full text-sm text-slate-600" type="file" accept=".pdf,.doc,.docx,.jpeg,.jpg,.png" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button className="btn-primary w-full sm:w-auto" disabled={isSaving}>
                {isSaving ? "Saving..." : editingClientId ? "Update Client" : "Save Client"}
              </button>
              {editingClientId && (
                <button
                  type="button"
                  className="btn-secondary w-full sm:w-auto"
                  onClick={() => {
                    setEditingClientId(null);
                    setForm(emptyForm);
                    setSelectedFile(null);
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </section>

      </div>
    </div>
  );
}
