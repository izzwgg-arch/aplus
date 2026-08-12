"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { RequirePermission } from "@/components/common/RequirePermission";
import { usePermissions } from "@/hooks/usePermissions";

type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissions: string[];
};

type PermissionCatalog = {
  categories: Record<string, { key: string; label: string }[]>;
};

type StaffMember = {
  id: string;
  name: string | null;
  email: string;
  appRoleId: string | null;
  appRole: { id: string; key: string; name: string } | null;
};

function categoryLabel(key: string) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Request failed");
  return res.json();
}

function PermissionsPageContent() {
  const queryClient = useQueryClient();
  const { refresh: refreshMyPermissions } = usePermissions();

  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: () => fetchJson<Role[]>("/smart-steps/api/roles") });
  const permsQuery = useQuery({ queryKey: ["permissions", "catalog"], queryFn: () => fetchJson<PermissionCatalog>("/smart-steps/api/permissions") });
  const staffQuery = useQuery({ queryKey: ["staff", "all"], queryFn: () => fetchJson<StaffMember[]>("/smart-steps/api/staff?includeInactive=1") });

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [isSaving, setSaving] = useState(false);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  const categories = permsQuery.data?.categories ?? {};
  const staff = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);

  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) setSelectedRoleId(roles[0].id);
  }, [roles, selectedRoleId]);

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedRoleId) ?? null, [roles, selectedRoleId]);

  useEffect(() => {
    if (selectedRole) setCheckedKeys(new Set(selectedRole.permissions));
  }, [selectedRole]);

  const usersForRole = useMemo(
    () => staff.filter((u) => u.appRoleId === selectedRoleId),
    [staff, selectedRoleId]
  );

  const toggleKey = (key: string) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCategory = (keys: string[], allChecked: boolean) => {
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
      const res = await fetch(`/smart-steps/api/roles/${selectedRole.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...checkedKeys] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to save");
      const updated: Role = await res.json();
      queryClient.setQueryData<Role[]>(["roles"], (prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`Permissions updated for ${updated.name}.`);
      refreshMyPermissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  const reassignUser = async (userId: string, appRoleId: string) => {
    setReassigningId(userId);
    try {
      const res = await fetch(`/smart-steps/api/staff/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appRoleId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to reassign");
      const updated = await res.json();
      queryClient.setQueryData<StaffMember[]>(["staff", "all"], (prev) =>
        (prev ?? []).map((u) => (u.id === userId ? { ...u, appRoleId: updated.appRoleId, appRole: updated.appRole } : u))
      );
      toast.success("User's role updated.");
      refreshMyPermissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign user");
    } finally {
      setReassigningId(null);
    }
  };

  const isLoading = rolesQuery.isLoading || permsQuery.isLoading || staffQuery.isLoading;

  if (isLoading) {
    return <div className="p-6 md:p-8 text-zinc-500 text-sm">Loading permissions…</div>;
  }

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[var(--accent-cyan)]" />
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Roles &amp; Permissions</h1>
        </div>
        <p className="text-zinc-500 text-sm mt-1">
          Control exactly what each role can see and do. Changes take effect for logged-in users within about 30 seconds.
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* ── ROLE LIST ── */}
        <section className="glass-card rounded-2xl p-4 h-fit">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Roles</h2>
          <div className="space-y-1">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoleId(r.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  r.id === selectedRoleId
                    ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] font-semibold"
                    : "text-zinc-400 hover:bg-white/5 hover:text-[var(--foreground)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{r.name}</span>
                  {r.isSystem && (
                    <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">system</span>
                  )}
                </div>
                <span className="block text-[11px] font-normal text-zinc-600">
                  {r.userCount} user{r.userCount === 1 ? "" : "s"} · {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── ROLE DETAIL ── */}
        {selectedRole ? (
          <section className="glass-card rounded-2xl p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{selectedRole.name}</h2>
                {selectedRole.description && <p className="mt-1 text-sm text-zinc-500">{selectedRole.description}</p>}
              </div>
              <button
                type="button"
                onClick={savePermissions}
                disabled={isSaving}
                className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {isSaving ? "Saving…" : "Save Permissions"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(categories).map(([catKey, perms]) => {
                const keys = perms.map((p) => p.key);
                const allChecked = keys.every((k) => checkedKeys.has(k));
                const someChecked = keys.some((k) => checkedKeys.has(k));
                return (
                  <div key={catKey} className="rounded-xl border border-[var(--glass-border)] p-3">
                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
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
                        <label key={p.key} className="flex items-center gap-2 text-xs text-zinc-400">
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
            <div className="mt-6 border-t border-[var(--glass-border)] pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Users with this role ({usersForRole.length})
              </h3>
              <div className="space-y-2">
                {usersForRole.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--glass-border)] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{u.name ?? u.email}</p>
                      <p className="text-xs text-zinc-500">{u.email}</p>
                    </div>
                    <select
                      className="field-input max-w-[180px] py-1.5 text-xs"
                      value={u.appRoleId ?? ""}
                      disabled={reassigningId === u.id}
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
                  <p className="text-sm text-zinc-600">No users currently have this role.</p>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="glass-card rounded-2xl p-5 flex items-center justify-center text-zinc-500">
            Select a role to view its permissions.
          </section>
        )}
      </div>
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <RequirePermission permission="smartsteps.permissions.manage">
      <PermissionsPageContent />
    </RequirePermission>
  );
}
