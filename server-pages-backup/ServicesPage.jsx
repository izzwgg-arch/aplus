import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { COLOR_TAGS, getColorTagStyle } from "../../lib/colorTags";

const emptyForm = {
  name: "",
  code: "",
  description: "",
  colorTag: "blue",
  standardRate: "",
  overtimeRate: "",
  durationMinutes: "",
  category: "",
  notes: "",
  isActive: true
};

export default function ServicesPage() {
  const toast = useToast();
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
    const query = search.toLowerCase();
    return services.filter((item) => `${item.name} ${item.code || ""} ${item.category || ""}`.toLowerCase().includes(query));
  }, [services, search]);

  const submit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        standardRate: Number(form.standardRate),
        overtimeRate: form.overtimeRate === "" ? null : Number(form.overtimeRate),
        durationMinutes: form.durationMinutes === "" ? null : Number(form.durationMinutes)
      };
      if (editingId) {
        await api.put(`/services/${editingId}`, payload);
        toast?.success("Service updated.");
      } else {
        await api.post("/services", payload);
        toast?.success("Service created.");
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Could not save service.");
    } finally {
      setIsSaving(false);
    }
  };

  const editService = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      code: item.code || "",
      description: item.description || "",
      colorTag: item.colorTag || "blue",
      standardRate: item.standardRate ?? "",
      overtimeRate: item.overtimeRate ?? "",
      durationMinutes: item.durationMinutes ?? "",
      category: item.category || "",
      notes: item.notes || "",
      isActive: item.isActive !== false
    });
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

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Services</h1>
        <p className="mt-1 text-sm text-slate-500">Manage clinic services, SaaS color tags, and pricing defaults.</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[1.45fr_1fr]">
        <section className="card card-hover flex min-h-0 flex-col">
          <div className="mb-4 shrink-0 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Service Catalog</h2>
              <p className="text-sm text-slate-500">{filtered.length} services</p>
            </div>
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              <select className="saas-input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <input className="saas-input w-56" placeholder="Search services..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Rates</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Usage</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td className="px-4 py-4 text-slate-500" colSpan={7}>Loading services...</td></tr>
                )}
                {!isLoading && filtered.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full border border-slate-200 ${getColorTagStyle(item.colorTag).dot}`} />
                        <div>
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.category || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.code || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">${item.standardRate.toFixed(2)} / OT {item.overtimeRate != null ? `$${item.overtimeRate.toFixed(2)}` : "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{item.durationMinutes ? `${item.durationMinutes} min` : "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item._count?.appointments || 0}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2">
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => editService(item)}>Edit</button>
                        <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => toggleArchive(item)}>{item.isActive ? "Archive" : "Restore"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && !filtered.length && (
                  <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={7}>No services found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card card-hover self-start">
          <h2 className="text-lg font-semibold text-slate-900">{editingId ? "Edit Service" : "Create Service"}</h2>
          <p className="mb-4 text-sm text-slate-500">Configure service metadata, color tags, and pricing.</p>
          <form className="space-y-3" onSubmit={submit}>
            <input className="saas-input" placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            <input className="saas-input" placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
            <input className="saas-input" placeholder="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
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
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="saas-input" type="number" min="0" step="0.01" placeholder="Standard rate" value={form.standardRate} onChange={(e) => setForm((p) => ({ ...p, standardRate: e.target.value }))} required />
              <input className="saas-input" type="number" min="0" step="0.01" placeholder="Overtime rate" value={form.overtimeRate} onChange={(e) => setForm((p) => ({ ...p, overtimeRate: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="saas-input" type="number" min="1" step="1" placeholder="Default duration (minutes)" value={form.durationMinutes} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value }))} />
            </div>
            <input className="saas-input" placeholder="Category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
            <textarea className="saas-textarea min-h-[90px]" placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
              Active service
            </label>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={isSaving}>{isSaving ? "Saving..." : editingId ? "Update Service" : "Create Service"}</button>
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
