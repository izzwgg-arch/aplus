import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { COLOR_TAGS, getColorTagStyle } from "../../lib/colorTags";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  title: "",
  credential: "",
  licenseNumber: "",
  npi: "",
  colorTag: "teal",
  defaultHourlyRate: "",
  overtimeHourlyRate: "",
  address: "",
  notes: "",
  isActive: true,
  serviceIds: []
};

export default function ProvidersPage() {
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setIsLoading(true);
    try {
      const [{ data: providerData }, { data: serviceData }] = await Promise.all([
        api.get("/providers", { params: { search: search || undefined, status } }),
        api.get("/services", { params: { status: "active" } })
      ]);
      setProviders(providerData);
      setServices(serviceData);
    } catch (error) {
      setProviders([]);
      setServices([]);
      toast?.error(error?.response?.data?.error || "Could not load providers.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [status]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return providers.filter((item) => `${item.fullName} ${item.email || ""} ${item.title || ""}`.toLowerCase().includes(query));
  }, [providers, search]);

  const serviceLinksPayload = form.serviceIds.map((serviceId) => ({ serviceId, isEnabled: true }));

  const submit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        defaultHourlyRate: form.defaultHourlyRate === "" ? null : Number(form.defaultHourlyRate),
        overtimeHourlyRate: form.overtimeHourlyRate === "" ? null : Number(form.overtimeHourlyRate),
        serviceLinks: serviceLinksPayload
      };
      if (editingId) {
        await api.put(`/providers/${editingId}`, payload);
        toast?.success("Provider updated.");
      } else {
        await api.post("/providers", payload);
        toast?.success("Provider created.");
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save provider.");
    } finally {
      setIsSaving(false);
    }
  };

  const editProvider = (item) => {
    setEditingId(item.id);
    setForm({
      firstName: item.firstName || "",
      lastName: item.lastName || "",
      email: item.email || "",
      phone: item.phone || "",
      title: item.title || "",
      credential: item.credential || "",
      licenseNumber: item.licenseNumber || "",
      npi: item.npi || "",
      colorTag: item.colorTag || "teal",
      defaultHourlyRate: item.defaultHourlyRate ?? "",
      overtimeHourlyRate: item.overtimeHourlyRate ?? "",
      address: item.address || "",
      notes: item.notes || "",
      isActive: item.isActive !== false,
      serviceIds: (item.serviceLinks || []).filter((x) => x.isEnabled).map((x) => x.serviceId)
    });
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

  const toggleServiceSelection = (serviceId) => {
    setForm((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter((id) => id !== serviceId)
        : [...prev.serviceIds, serviceId]
    }));
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Providers</h1>
        <p className="mt-1 text-sm text-slate-500">Manage provider profiles and supported services.</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[1.45fr_1fr]">
        <section className="card card-hover flex min-h-0 flex-col">
          <div className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Provider Directory</h2>
              <p className="text-sm text-slate-500">{filtered.length} providers</p>
            </div>
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              <select className="saas-input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <input className="saas-input w-56" placeholder="Search providers..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Title/Credential</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Rates</th>
                  <th className="px-4 py-3 font-medium">Services</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Loading providers...</td></tr>}
                {!isLoading && filtered.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full border border-slate-200 ${getColorTagStyle(item.colorTag || "gray").dot}`} />
                        <div>
                          <p className="font-medium text-slate-900">{item.fullName}</p>
                          <p className="text-xs text-slate-500">{item.npi || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{[item.title, item.credential].filter(Boolean).join(" / ") || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.email || "-"}<br />{item.phone || ""}</td>
                    <td className="px-4 py-3 text-slate-600">${item.defaultHourlyRate?.toFixed?.(2) || "0.00"} / OT {item.overtimeHourlyRate != null ? `$${item.overtimeHourlyRate.toFixed(2)}` : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item._count?.serviceLinks || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2">
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => editProvider(item)}>Edit</button>
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => toggleArchive(item)}>{item.isActive ? "Archive" : "Restore"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && !filtered.length && <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={7}>No providers found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card card-hover self-start">
          <h2 className="text-lg font-semibold text-slate-900">{editingId ? "Edit Provider" : "Create Provider"}</h2>
          <p className="mb-4 text-sm text-slate-500">Capture credential details and supported services.</p>
          <form className="space-y-3" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="saas-input" placeholder="First name" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} required />
              <input className="saas-input" placeholder="Last name" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="saas-input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              <input className="saas-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="saas-input" placeholder="Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              <input className="saas-input" placeholder="Credential" value={form.credential} onChange={(e) => setForm((p) => ({ ...p, credential: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="saas-input" placeholder="License number" value={form.licenseNumber} onChange={(e) => setForm((p) => ({ ...p, licenseNumber: e.target.value }))} />
              <input className="saas-input" placeholder="NPI" value={form.npi} onChange={(e) => setForm((p) => ({ ...p, npi: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="saas-input" type="number" min="0" step="0.01" placeholder="Default hourly rate" value={form.defaultHourlyRate} onChange={(e) => setForm((p) => ({ ...p, defaultHourlyRate: e.target.value }))} />
              <input className="saas-input" type="number" min="0" step="0.01" placeholder="Overtime hourly rate" value={form.overtimeHourlyRate} onChange={(e) => setForm((p) => ({ ...p, overtimeHourlyRate: e.target.value }))} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Color Tag</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_TAGS.map((tag) => {
                  const selected = form.colorTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${selected ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                      onClick={() => setForm((p) => ({ ...p, colorTag: tag }))}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getColorTagStyle(form.colorTag).badge}`}>
                  BCBA
                </span>
              </div>
            </div>
            <input className="saas-input" placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
            <textarea className="saas-textarea min-h-[70px]" placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Supported Services</p>
              <div className="max-h-28 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {services.map((service) => (
                  <label key={service.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.serviceIds.includes(service.id)}
                      onChange={() => toggleServiceSelection(service.id)}
                    />
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${getColorTagStyle(service.colorTag).dot}`} />
                    {service.name}
                  </label>
                ))}
                {!services.length && <p className="text-sm text-slate-500">Create services first.</p>}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
              Active provider
            </label>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={isSaving}>{isSaving ? "Saving..." : editingId ? "Update Provider" : "Create Provider"}</button>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
