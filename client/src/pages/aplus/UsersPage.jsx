import { useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import useHotkey from "../../hooks/useHotkey";

const ROLES = ["ADMIN", "BCBA", "STAFF"];

const STATUS_CONFIG = {
  INVITED:  { label: "Invited",  cls: "bg-amber-50  text-amber-700  border border-amber-200"  },
  ACTIVE:   { label: "Active",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  DISABLED: { label: "Disabled", cls: "bg-slate-100  text-slate-500  border border-slate-200"  },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ACTIVE;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const nameRef = useRef(null);

  const [users, setUsers]       = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving]   = useState(false);
  const [form, setForm]         = useState({ email: "", fullName: "", role: "STAFF" });
  const [resending, setResending] = useState(null); // userId being resent

  useHotkey({ key: "n", ctrlOrMeta: true, enabled: isAdmin, onTrigger: () => nameRef.current?.focus() });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── INVITE USER ──────────────────────────────────────────────────────────
  const inviteUser = async (e) => {
    e.preventDefault();
    if (!form.email || !form.fullName) {
      toast?.error("Name and email are required.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/users", form);
      setForm({ email: "", fullName: "", role: "STAFF" });
      await load();
      if (data._warning) {
        toast?.error(data._warning);
      } else {
        toast?.success(`Invitation sent to ${data.email}.`);
      }
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to invite user.");
    } finally {
      setSaving(false);
    }
  };

  // ── CHANGE ROLE ──────────────────────────────────────────────────────────
  const changeRole = async (id, role) => {
    const prev = users;
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, role } : x)));
    try {
      await api.patch(`/users/${id}/role`, { role });
      toast?.success("Role updated.");
    } catch (err) {
      setUsers(prev);
      toast?.error(err?.response?.data?.error || "Failed to update role.");
    }
  };

  // ── ENABLE / DISABLE ─────────────────────────────────────────────────────
  const toggleStatus = async (u) => {
    const next = u.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const label = next === "DISABLED" ? "disable" : "enable";
    if (!window.confirm(`Are you sure you want to ${label} ${u.fullName}?`)) return;
    try {
      await api.patch(`/users/${u.id}/status`, { status: next });
      await load();
      toast?.success(`User ${next === "DISABLED" ? "disabled" : "enabled"}.`);
    } catch (err) {
      toast?.error(err?.response?.data?.error || `Failed to ${label} user.`);
    }
  };

  // ── RESEND INVITE ────────────────────────────────────────────────────────
  const resendInvite = async (u) => {
    setResending(u.id);
    try {
      await api.post(`/users/${u.id}/resend-invite`);
      toast?.success(`Invitation resent to ${u.email}.`);
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to resend invitation.");
    } finally {
      setResending(null);
    }
  };

  // ── DELETE USER ───────────────────────────────────────────────────────────
  const deleteUser = async (u) => {
    if (!window.confirm(`Permanently delete "${u.fullName}" (${u.email})?\n\nThis cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      await load();
      toast?.success(`${u.fullName} has been deleted.`);
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to delete user.");
    }
  };

  // ── ADMIN PASSWORD RESET ─────────────────────────────────────────────────
  const adminResetPassword = async (u) => {
    const pw = window.prompt(`Set a temporary password for ${u.fullName} (min 8 chars).\nThey should change it after logging in.`);
    if (!pw) return;
    try {
      await api.patch(`/users/${u.id}/password`, { newPassword: pw });
      toast?.success("Password reset successfully.");
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Failed to reset password.");
    }
  };

  if (!isAdmin) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold mb-2">Users &amp; Roles</h1>
        <p className="text-slate-600">Only ADMIN users can manage users and roles.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Invite team members, manage roles, and control access.</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_340px]">

        {/* ── USER LIST ── */}
        <section className="card card-hover flex min-h-0 flex-col">
          <h2 className="mb-4 shrink-0 text-lg font-semibold text-slate-900">
            Team Members
            <span className="ml-2 text-sm font-normal text-slate-400">({users.length})</span>
          </h2>

          <div className="min-h-0 flex-1 space-y-2 overflow-auto">
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4 animate-pulse">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-56 rounded bg-slate-100" />
              </div>
            ))}

            {!isLoading && users.map((u) => (
              <div key={u.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{u.fullName}</p>
                      <StatusBadge status={u.status} />
                    </div>
                    <p className="text-sm text-slate-500">{u.email}</p>
                    {u.status === "INVITED" && u.invitedAt && (
                      <p className="mt-0.5 text-xs text-amber-600">
                        Invited {new Date(u.invitedAt).toLocaleDateString()} — awaiting activation
                      </p>
                    )}
                    {u.status === "ACTIVE" && u.lastLoginAt && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        Last login: {new Date(u.lastLoginAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* Role selector — disabled for self */}
                  <select
                    className="saas-input max-w-[130px] py-1.5 text-xs"
                    value={u.role}
                    disabled={u.id === me?.id}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>

                  {/* Resend invite (only for INVITED users) */}
                  {u.status === "INVITED" && (
                    <button
                      className="btn-secondary py-1.5 text-xs"
                      disabled={resending === u.id}
                      onClick={() => resendInvite(u)}
                    >
                      {resending === u.id ? "Sending…" : "Resend invite"}
                    </button>
                  )}

                  {/* Admin password reset (only for ACTIVE users who are not self) */}
                  {u.status === "ACTIVE" && u.id !== me?.id && (
                    <button className="btn-secondary py-1.5 text-xs" onClick={() => adminResetPassword(u)}>
                      Reset password
                    </button>
                  )}

                  {/* Enable / Disable (not for self, not for invited) */}
                  {u.id !== me?.id && u.status !== "INVITED" && (
                    <button
                      className={`py-1.5 text-xs rounded-lg border px-3 font-medium transition ${
                        u.status === "ACTIVE"
                          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      }`}
                      onClick={() => toggleStatus(u)}
                    >
                      {u.status === "ACTIVE" ? "Disable" : "Enable"}
                    </button>
                  )}

                  {/* Delete — not allowed for self */}
                  {u.id !== me?.id && (
                    <button
                      className="py-1.5 text-xs rounded-lg border border-red-300 bg-red-50 px-3 font-medium text-red-700 hover:bg-red-100 transition"
                      onClick={() => deleteUser(u)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}

            {!isLoading && !users.length && (
              <div className="py-8 text-center text-slate-500 text-sm">No users yet. Invite your first team member.</div>
            )}
          </div>
        </section>

        {/* ── INVITE FORM ── */}
        <section className="card card-hover self-start">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Invite User</h2>
          <p className="mb-4 text-sm text-slate-500">
            An invitation email with a secure link will be sent to the user. They will set their own password.
          </p>

          <form onSubmit={inviteUser} className="space-y-3">
            <input
              ref={nameRef}
              className="saas-input"
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              required
            />
            <input
              className="saas-input"
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <select
              className="saas-input"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="btn-primary w-full" disabled={isSaving}>
              {isSaving ? "Sending invitation…" : "Send invitation"}
            </button>
          </form>

          <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-500 space-y-1">
            <p className="font-medium text-slate-600">How it works</p>
            <p>1. The invited user receives an email with a secure activation link.</p>
            <p>2. They click the link and create their own password.</p>
            <p>3. Their account is activated and they can sign in.</p>
            <p className="text-slate-400">Invitation links expire after 48 hours. Use Resend Invite if needed.</p>
          </div>
        </section>

      </div>
    </div>
  );
}
