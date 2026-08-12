import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import { useToast } from "../../context/ToastContext";
import { usePermissions } from "../../context/PermissionsContext";

function categoryLabel(key) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PermissionsPage() {
  const toast = useToast();
  const { refresh: refreshMyPermissions } = usePermissions();

  const [roles, setRoles] = useState([]);
  const [categories, setCategories] = useState({});
  const [users, setUsers] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(new Set());
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [reassigning, setReassigning] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes, usersRes] = await Promise.all([
        api.get("/roles"),
        api.get("/permissions"),
        api.get("/users")
      ]);
      setRoles(rolesRes.data);
      setCategories(permsRes.data.categories || {});
      setUsers(usersRes.data);
      setSelectedRoleId((prev) => prev || rolesRes.data[0]?.id || null);
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to load permissions data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedRoleId) || null, [roles, selectedRoleId]);

  useEffect(() => {
    if (selectedRole) setCheckedKeys(new Set(selectedRole.permissions));
  }, [selectedRole?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const usersForRole = useMemo(
    () => users.filter((u) => u.roleId === selectedRoleId),
    [users, selectedRoleId]
  );

  const toggleKey = (key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCategory = (keys, allChecked) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allChecked ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const { data } = await api.patch(`/roles/${selectedRole.id}`, { permissions: [...checkedKeys] });
      setRoles((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      toast?.success(`Permissions updated for ${data.name}.`);
      refreshMyPermissions();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to save permissions.");
    } finally {
      setSaving(false);
    }
  };

  const reassignUser = async (userId, roleId) => {
    setReassigning(userId);
    try {
      const { data } = await api.patch(`/users/${userId}/role-id`, { roleId });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roleId: data.roleId, customRole: data.customRole } : u)));
      toast?.success("User's role updated.");
      refreshMyPermissions();
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to reassign user.");
    } finally {
      setReassigning(null);
    }
  };

  if (isLoading) {
    return <div className="card">Loading permissions…</div>;
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Roles &amp; Permissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Control exactly what each role can see and do. Changes take effect for logged-in users within about 30 seconds.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* ── ROLE LIST ── */}
        <section className="card card-hover flex min-h-0 flex-col">
          <h2 className="mb-3 shrink-0 text-sm font-semibold uppercase tracking-wide text-slate-500">Roles</h2>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  r.id === selectedRoleId ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{r.name}</span>
                  {r.isSystem && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">system</span>
                  )}
                </div>
                <span className="text-xs font-normal text-slate-400">
                  {r.userCount} user{r.userCount === 1 ? "" : "s"} · {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── ROLE DETAIL ── */}
        {selectedRole ? (
          <section className="card card-hover flex min-h-0 flex-col overflow-hidden">
            <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedRole.name}</h2>
                {selectedRole.description && <p className="mt-1 text-sm text-slate-500">{selectedRole.description}</p>}
              </div>
              <button className="btn-primary" disabled={isSaving} onClick={savePermissions}>
                {isSaving ? "Saving…" : "Save Permissions"}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto pr-1">
              {/* Permission checklist grouped by category */}
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(categories).map(([catKey, perms]) => {
                  const keys = perms.map((p) => p.key);
                  const allChecked = keys.every((k) => checkedKeys.has(k));
                  const someChecked = keys.some((k) => checkedKeys.has(k));
                  return (
                    <div key={catKey} className="rounded-xl border border-slate-200 p-3">
                      <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                          onChange={() => toggleCategory(keys, allChecked)}
                        />
                        {categoryLabel(catKey)}
                      </label>
                      <div className="space-y-1 pl-1">
                        {perms.map((p) => (
                          <label key={p.key} className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={checkedKeys.has(p.key)}
                              onChange={() => toggleKey(p.key)}
                            />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Users assigned to this role */}
              <div className="mt-6 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Users with this role ({usersForRole.length})
                </h3>
                <div className="space-y-2">
                  {usersForRole.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{u.fullName}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                      <select
                        className="saas-input max-w-[180px] py-1.5 text-xs"
                        value={u.roleId || ""}
                        disabled={reassigning === u.id}
                        onChange={(e) => reassignUser(u.id, e.target.value)}
                      >
                        <option value="" disabled>Assign role…</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {usersForRole.length === 0 && (
                    <p className="text-sm text-slate-400">No users currently have this role.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="card flex items-center justify-center text-slate-500">Select a role to view its permissions.</section>
        )}
      </div>
    </div>
  );
}
