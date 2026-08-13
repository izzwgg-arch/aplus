import { useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import useHotkey from "../../hooks/useHotkey";

const roles = ["ADMIN", "BCBA", "STAFF"];

export default function UsersPage() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const createNameRef = useRef(null);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    role: "STAFF",
    password: ""
  });

  useHotkey({
    key: "n",
    ctrlOrMeta: true,
    enabled: isAdmin,
    onTrigger: () => createNameRef.current?.focus()
  });

  const load = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setMessage("");
    setIsCreating(true);
    const optimisticId = `temp-user-${Date.now()}`;
    const optimisticUser = {
      id: optimisticId,
      email: form.email,
      fullName: form.fullName,
      role: form.role
    };
    setUsers((prev) => [optimisticUser, ...prev]);
    try {
      await api.post("/users", form);
      setForm({ email: "", fullName: "", role: "STAFF", password: "" });
      setMessage("User created.");
      setUsers((prev) => prev.filter((u) => u.id !== optimisticId));
      await load();
      toast?.success("User created.");
    } catch (error) {
      setUsers((prev) => prev.filter((u) => u.id !== optimisticId));
      setMessage(error?.response?.data?.error || "Failed to create user");
      toast?.error(error?.response?.data?.error || "Failed to create user");
    } finally {
      setIsCreating(false);
    }
  };

  const changeRole = async (id, role) => {
    setMessage("");
    const previous = users;
    try {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      await api.patch(`/users/${id}/role`, { role });
      setMessage("Role updated.");
      toast?.success("Role updated.");
    } catch (error) {
      setUsers(previous);
      setMessage(error?.response?.data?.error || "Failed to update role");
      toast?.error(error?.response?.data?.error || "Failed to update role");
    }
  };

  const resetPassword = async (id) => {
    const newPassword = window.prompt("Enter new temporary password (min 8 chars):");
    if (!newPassword) return;
    setMessage("");
    try {
      await api.patch(`/users/${id}/password`, { newPassword });
      setMessage("Password reset successfully.");
      toast?.success("Password reset.");
    } catch (error) {
      setMessage(error?.response?.data?.error || "Failed to reset password");
      toast?.error(error?.response?.data?.error || "Failed to reset password");
    }
  };

  if (!isAdmin) {
    return (
      <div className="card">
        <h1 className="text-xl font-semibold mb-2">Users & Roles</h1>
        <p className="text-slate-600">Only ADMIN users can manage users and roles.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Manage team accounts, roles, and password resets.</p>
      </div>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
      <section className="card card-hover flex min-h-0 flex-col">
        <h2 className="mb-4 shrink-0 text-lg font-semibold text-slate-900">Team Users</h2>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          {isLoading && Array.from({ length: 4 }).map((_, idx) => (
            <div key={`user-skeleton-${idx}`} className="rounded-xl border border-slate-200 p-4">
              <div className="skeleton-line w-40" />
              <div className="mt-2 skeleton-line w-56" />
            </div>
          ))}
          {users.map((u) => (
            <div key={u.id} className="rounded-xl border border-slate-200 p-4">
              <div>
                <p className="font-medium text-slate-900">{u.fullName}</p>
                <p className="text-sm text-slate-600">{u.email}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  className="saas-input max-w-[150px]"
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                >
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  className="btn-secondary py-2"
                  onClick={() => resetPassword(u.id)}
                >
                  Reset Password
                </button>
              </div>
            </div>
          ))}
          {!isLoading && !users.length && <div className="empty-state">No users found.</div>}
        </div>
      </section>

      <section className="card card-hover self-start">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Create User</h2>
        <form onSubmit={createUser} className="space-y-4">
          <input
            ref={createNameRef}
            className="saas-input"
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
          />
          <input
            className="saas-input"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <select
            className="saas-input"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
          >
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input
            className="saas-input"
            type="password"
            placeholder="Temporary password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          />
          <button className="btn-primary" disabled={isCreating}>{isCreating ? "Creating..." : "Create User"}</button>
        </form>
        {message && <p className="text-sm text-slate-700 mt-3">{message}</p>}
      </section>
      </div>
    </div>
  );
}
