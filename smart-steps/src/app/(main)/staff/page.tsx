"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCheck, Mail, Phone, Award, Users,
  ChevronDown, ChevronRight, Pencil, UserX,
  X, Loader2, UserPlus, Link2, RotateCcw, KeyRound, Globe,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type AssignedClient = {
  role: string;
  client: { id: string; name: string; isArchived: boolean };
};

type StaffMember = {
  id:            string;
  name:          string | null;
  email:         string;
  role:          string;
  displayRole:   string | null;
  phone:         string | null;
  credentials:   string | null;
  isActive:      boolean;
  invitedAt:     string | null;
  createdAt:     string;
  hasLocalLogin: boolean;
  assignedClients: AssignedClient[];
};

type ClientOption = {
  id:         string;
  name:       string;
  isArchived: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-[var(--accent-pink)]/15 text-[var(--accent-pink)] border border-[var(--accent-pink)]/30",
  BCBA:  "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30",
  RBT:   "bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] border border-[var(--accent-purple)]/30",
};

const DISPLAY_ROLE_OPTIONS = [
  "",
  "Supervisor",
  "Clinical Director",
  "Lead BCBA",
  "Lead RBT",
  "Behavior Technician",
  "Administrative Staff",
];

const DB_ROLES = ["RBT", "BCBA", "ADMIN"] as const;
type DBRole = (typeof DB_ROLES)[number];

// ── StaffEditorModal ───────────────────────────────────────────────────────────

interface EditorProps {
  member:  StaffMember | null; // null = add new
  onClose: () => void;
  onSaved: () => void;
}

const MIN_PASSWORD_LENGTH = 8;

function StaffEditorModal({ member, onClose, onSaved }: EditorProps) {
  const isEdit = !!member;

  const [name,        setName]        = useState(member?.name        ?? "");
  const [email,       setEmail]       = useState(member?.email       ?? "");
  const [role,        setRole]        = useState<DBRole>((member?.role as DBRole) ?? "RBT");
  const [displayRole, setDisplayRole] = useState(member?.displayRole ?? "");
  const [phone,       setPhone]       = useState(member?.phone       ?? "");
  const [credentials, setCredentials] = useState(member?.credentials ?? "");
  const [isActive,    setIsActive]    = useState(member?.isActive    ?? true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [info,        setInfo]        = useState<string | null>(null);

  // Login method:
  // "invite" = email the user a link to set their own password (new users only, recommended).
  // "sso"    = sign in via A+ Center SSO (no password stored here).
  // "local"  = standalone SmartSteps-only account with an admin-set password.
  const [loginMethod, setLoginMethod] = useState<"invite" | "sso" | "local">(
    isEdit ? (member?.hasLocalLogin ? "local" : "sso") : "invite"
  );
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (loginMethod === "local") {
      // For a brand-new local account, or when converting an existing account
      // to local, a password is required. For an already-local account being
      // edited, leaving both fields blank keeps the current password.
      const settingNewPassword = password.length > 0 || confirmPassword.length > 0;
      const mustSetPassword = !isEdit || !member?.hasLocalLogin;
      if (mustSetPassword || settingNewPassword) {
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match");
          return;
        }
      }
    }

    setSaving(true);
    try {
      const isInvite = !isEdit && loginMethod === "invite";
      const wantsNewPassword = loginMethod === "local" && password.length > 0;
      const body = {
        name,
        email,
        role,
        displayRole: displayRole || null,
        phone:       phone       || null,
        credentials: credentials || null,
        ...(isEdit ? { isActive } : {}),
        ...(isInvite ? { loginMethod: "invite" } : {}),
        ...(wantsNewPassword ? { password } : {}),
        ...(isEdit && loginMethod === "sso" && member?.hasLocalLogin ? { removeLocalLogin: true } : {}),
      };
      const url    = isEdit ? `/smart-steps/api/staff/${member!.id}` : "/smart-steps/api/staff";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({})) as { error?: string; _warning?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save");
      }
      if (data._warning) {
        // Account created but the invite email didn't send — keep the modal
        // open so the admin sees the warning; closing still refreshes the list.
        setInfo(data._warning);
        setSaving(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{   opacity: 0, scale: 0.96,  y: 8 }}
        className="w-full max-w-lg glass-card rounded-2xl p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            {isEdit ? "Edit Staff Member" : "Add New Staff Member"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Login method */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Login Method</label>
            <div className={`grid gap-2 ${isEdit ? "grid-cols-2" : "grid-cols-3"}`}>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setLoginMethod("invite")}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    loginMethod === "invite"
                      ? "border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                      : "border-[var(--glass-border)] text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="block font-semibold">Email Invite</span>
                    <span className="block text-[10px] opacity-75">User sets own password</span>
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setLoginMethod("sso")}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  loginMethod === "sso"
                    ? "border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                    : "border-[var(--glass-border)] text-zinc-400 hover:bg-white/5"
                }`}
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">A+ Center SSO</span>
                  <span className="block text-[10px] opacity-75">Signs in via main app account</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLoginMethod("local")}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                  loginMethod === "local"
                    ? "border-[var(--accent-cyan)]/50 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                    : "border-[var(--glass-border)] text-zinc-400 hover:bg-white/5"
                }`}
              >
                <KeyRound className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-semibold">Local Password</span>
                  <span className="block text-[10px] opacity-75">Admin sets password</span>
                </span>
              </button>
            </div>
            {loginMethod === "invite" ? (
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
                We&apos;ll email this person a secure link to set their own password and activate their
                account. No password is stored until they accept.
              </p>
            ) : loginMethod === "sso" ? (
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
                No password is stored here. The user must sign in through A+ Center SSO using this
                same email address to activate their account.
              </p>
            ) : (
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
                Independent SmartSteps login — no A+ Center account required.
                {isEdit && member?.hasLocalLogin && " Leave the password fields blank to keep the current password."}
              </p>
            )}
          </div>

          {loginMethod === "local" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  {isEdit && member?.hasLocalLogin ? "New Password" : "Password *"}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder-zinc-600 focus:border-[var(--accent-cyan)]/50 focus:outline-none"
                  placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-400">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder-zinc-600 focus:border-[var(--accent-cyan)]/50 focus:outline-none"
                  placeholder="Re-enter password"
                />
              </div>
            </div>
          )}

          {/* Name + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder-zinc-600 focus:border-[var(--accent-cyan)]/50 focus:outline-none"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder-zinc-600 focus:border-[var(--accent-cyan)]/50 focus:outline-none"
                placeholder="email@example.com"
              />
            </div>
          </div>

          {/* Permission Role + Job Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Permission Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as DBRole)}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)]/50 focus:outline-none"
              >
                {DB_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <p className="mt-0.5 text-[10px] text-zinc-600">Controls system access</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Job Title</label>
              <select
                value={displayRole}
                onChange={(e) => setDisplayRole(e.target.value)}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-cyan)]/50 focus:outline-none"
              >
                {DISPLAY_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r || "— None —"}</option>
                ))}
              </select>
              <p className="mt-0.5 text-[10px] text-zinc-600">Display only</p>
            </div>
          </div>

          {/* Phone + Credentials */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder-zinc-600 focus:border-[var(--accent-cyan)]/50 focus:outline-none"
                placeholder="(555) 000-0000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400">Credentials</label>
              <input
                type="text"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--foreground)] placeholder-zinc-600 focus:border-[var(--accent-cyan)]/50 focus:outline-none"
                placeholder="BCBA, LBA, MS…"
              />
            </div>
          </div>

          {/* Active toggle (edit only) */}
          {isEdit && (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--foreground)]">Account Status</p>
                <p className="text-xs text-zinc-500">
                  {isActive
                    ? "Active — visible and assignable"
                    : "Inactive — hidden from assignment dropdowns, historical records preserved"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none ${
                  isActive ? "bg-emerald-500/70" : "bg-zinc-700"
                }`}
                aria-label="Toggle active status"
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {info && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {info}
            </p>
          )}

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 pt-1">
            {info ? (
              <button
                type="button"
                onClick={onSaved}
                className="flex items-center gap-2 rounded-xl bg-[var(--accent-cyan)]/20 border border-[var(--accent-cyan)]/30 px-4 py-2 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--glass-border)] px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-[var(--accent-cyan)]/20 border border-[var(--accent-cyan)]/30 px-4 py-2 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/30 transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loginMethod === "invite" && !isEdit
                    ? "Send Invite"
                    : isEdit
                      ? "Save Changes"
                      : "Add Staff Member"}
                </button>
              </>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── AssignClientsModal ─────────────────────────────────────────────────────────

interface AssignProps {
  member:  StaffMember;
  onClose: () => void;
}

function AssignClientsModal({ member, onClose }: AssignProps) {
  const [clients,        setClients]        = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [pendingId,      setPendingId]      = useState<string | null>(null);

  // clientId → assignment role (only active assignments)
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of member.assignedClients) {
      if (!a.client.isArchived) map[a.client.id] = a.role;
    }
    return map;
  });

  // Per-client role picker state for unassigned clients (defaults to staff's DB role)
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoadingClients(true);
      try {
        const r = await fetch("/smart-steps/api/clients");
        if (!r.ok) throw new Error();
        const data = (await r.json()) as ClientOption[];
        setClients(data.filter((c) => !c.isArchived));
      } catch {
        // leave clients empty
      } finally {
        setLoadingClients(false);
      }
    })();
  }, []);

  async function handleAssign(clientId: string) {
    const assignRole = pendingRoles[clientId] ?? member.role;
    setPendingId(clientId);
    try {
      const r = await fetch(`/smart-steps/api/clients/${clientId}/assignments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId: member.id, assignmentRole: assignRole }),
      });
      if (!r.ok) throw new Error();
      setAssignments((prev) => ({ ...prev, [clientId]: assignRole }));
    } catch {
      // silent — user can retry
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(clientId: string) {
    setPendingId(clientId);
    try {
      const r = await fetch(
        `/smart-steps/api/clients/${clientId}/assignments?userId=${member.id}`,
        { method: "DELETE" }
      );
      if (!r.ok) throw new Error();
      setAssignments((prev) => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
    } catch {
      // silent — user can retry
    } finally {
      setPendingId(null);
    }
  }

  const assignedClients   = clients.filter((c) =>  assignments[c.id]);
  const availableClients  = clients.filter((c) => !assignments[c.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{   opacity: 0, scale: 0.96,  y: 8 }}
        className="flex max-h-[85vh] w-full max-w-lg flex-col glass-card rounded-2xl p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--foreground)]">Assign Clients</h2>
            <p className="text-xs text-zinc-500">
              {member.name ?? member.email}
              {member.displayRole && (
                <span className="ml-1.5 text-zinc-600">· {member.displayRole}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {loadingClients ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : clients.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-600">No active clients found.</p>
          ) : (
            <>
              {/* Currently assigned */}
              {assignedClients.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Currently Assigned ({assignedClients.length})
                  </p>
                  <div className="space-y-1.5">
                    {assignedClients.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-200">{c.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_STYLES[assignments[c.id]] ?? ROLE_STYLES.RBT}`}>
                            {assignments[c.id]}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemove(c.id)}
                          disabled={pendingId === c.id}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          {pendingId === c.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : "Remove"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available clients */}
              {availableClients.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Available Clients ({availableClients.length})
                  </p>
                  <div className="space-y-1.5">
                    {availableClients.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] px-3 py-2"
                      >
                        <span className="text-sm text-zinc-400">{c.name}</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={pendingRoles[c.id] ?? member.role}
                            onChange={(e) =>
                              setPendingRoles((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            className="rounded-lg border border-[var(--glass-border)] bg-[var(--background)] px-2 py-1 text-xs text-zinc-300 focus:outline-none"
                          >
                            {DB_ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleAssign(c.id)}
                            disabled={pendingId === c.id}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors disabled:opacity-50"
                          >
                            {pendingId === c.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : "Assign"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end border-t border-[var(--glass-border)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--glass-border)] px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── StaffCard ──────────────────────────────────────────────────────────────────

interface CardProps {
  member:         StaffMember;
  userRole:       string | undefined;
  isToggling:     boolean;
  isResending:    boolean;
  onEdit:         () => void;
  onToggleActive: () => void;
  onManageClients:() => void;
  onResendInvite: () => void;
}

function StaffCard({
  member,
  userRole,
  isToggling,
  isResending,
  onEdit,
  onToggleActive,
  onManageClients,
  onResendInvite,
}: CardProps) {
  const [expanded, setExpanded] = useState(false);

  const activeClients   = member.assignedClients.filter((a) => !a.client.isArchived);
  const archivedClients = member.assignedClients.filter((a) =>  a.client.isArchived);
  const isAdmin         = userRole === "ADMIN";
  const isAdminOrBcba   = userRole === "ADMIN" || userRole === "BCBA";
  const isPendingInvite = !!member.invitedAt && !member.hasLocalLogin;
  // A user can be (re)sent an invite link as long as they haven't set a local
  // password yet. This includes SSO stubs that were never emailed an invite.
  const canInvite       = isAdmin && !member.hasLocalLogin;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card rounded-2xl overflow-hidden transition-opacity ${
        !member.isActive ? "opacity-55" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
            member.isActive
              ? "bg-gradient-to-br from-[var(--accent-cyan)]/30 to-[var(--accent-purple)]/30 border-[var(--glass-border)]"
              : "bg-zinc-800 border-zinc-700"
          }`}
        >
          <span className="text-sm font-bold text-[var(--foreground)]">
            {(member.name ?? member.email).charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold truncate ${member.isActive ? "text-[var(--foreground)]" : "text-zinc-500"}`}>
              {member.name ?? "(no name)"}
            </span>

            {/* DB role badge */}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_STYLES[member.role] ?? ROLE_STYLES.RBT}`}>
              {member.role}
            </span>

            {/* Display / job title */}
            {member.displayRole && (
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                {member.displayRole}
              </span>
            )}

            {/* Credentials */}
            {member.credentials && (
              <span className="text-[10px] font-medium text-zinc-500">{member.credentials}</span>
            )}

            {/* Login method / invite badge */}
            {isPendingInvite ? (
              <span
                title="Invited by email — waiting for the user to set their password"
                className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400"
              >
                <Mail className="h-2.5 w-2.5" />
                Invited · pending
              </span>
            ) : (
              <span
                title={member.hasLocalLogin ? "Standalone SmartSteps login" : "Signs in via A+ Center SSO"}
                className="flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-500"
              >
                {member.hasLocalLogin ? <KeyRound className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                {member.hasLocalLogin ? "Local login" : "SSO"}
              </span>
            )}

            {/* Inactive badge */}
            {!member.isActive && (
              <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
                Inactive
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {member.email}
            </span>
            {member.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {member.phone}
              </span>
            )}
          </div>
        </div>

        {/* Right-side actions */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Client count chip */}
          <span className="flex items-center gap-1 rounded-full border border-[var(--glass-border)] px-2.5 py-1 text-xs text-zinc-400">
            <Users className="h-3 w-3" />
            {activeClients.length}
          </span>

          {/* Manage clients (admin/BCBA, active staff only) */}
          {isAdminOrBcba && member.isActive && (
            <button
              type="button"
              onClick={onManageClients}
              title="Manage client assignments"
              className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
            >
              <Link2 className="h-4 w-4" />
            </button>
          )}

          {/* (Re)send invite — admin only, anyone without a local password */}
          {canInvite && (
            <button
              type="button"
              onClick={onResendInvite}
              disabled={isResending}
              title={isPendingInvite ? "Resend invitation email" : "Send an invitation link to set up a password"}
              className="rounded-lg p-1.5 text-amber-400/80 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
            >
              {isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            </button>
          )}

          {/* Edit (admin only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit staff member"
              className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}

          {/* Deactivate / Reactivate (admin only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={onToggleActive}
              disabled={isToggling}
              title={member.isActive ? "Deactivate staff" : "Reactivate staff"}
              className={`rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
                member.isActive
                  ? "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                  : "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              {isToggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : member.isActive ? (
                <UserX className="h-4 w-4" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Expand assigned clients */}
          {member.assignedClients.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Hide clients" : "Show clients"}
              className="rounded-lg p-1.5 text-zinc-500 hover:text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded assigned-clients panel */}
      {expanded && member.assignedClients.length > 0 && (
        <div className="border-t border-[var(--glass-border)] px-4 pb-3 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
            Assigned Clients
          </p>
          <div className="space-y-1">
            {activeClients.map((a) => (
              <div
                key={a.client.id}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 bg-white/3"
              >
                <span className="text-sm text-zinc-300">{a.client.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_STYLES[a.role] ?? ROLE_STYLES.RBT}`}>
                  {a.role}
                </span>
              </div>
            ))}
            {archivedClients.length > 0 && (
              <div className="mt-1 border-t border-[var(--glass-border)] pt-1">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-700">
                  Archived clients
                </p>
                {archivedClients.map((a) => (
                  <div
                    key={a.client.id}
                    className="flex items-center justify-between rounded-lg px-3 py-1 opacity-50"
                  >
                    <span className="text-xs text-zinc-500 line-through">{a.client.name}</span>
                    <span className="text-[10px] text-zinc-600">{a.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [staff,       setStaff]       = useState<StaffMember[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState<"ALL" | "ADMIN" | "BCBA" | "RBT">("ALL");
  const [showInactive,setShowInactive]= useState(false);
  const [showEditor,  setShowEditor]  = useState(false);
  const [editMember,  setEditMember]  = useState<StaffMember | null>(null);
  const [assignMember,setAssignMember]= useState<StaffMember | null>(null);
  const [togglingId,  setTogglingId]  = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);

  const userRole = (session?.user as { role?: string } | undefined)?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/smart-steps/api/staff?includeInactive=1");
      if (!r.ok) throw new Error();
      setStaff(await r.json());
    } catch {
      /* handled by loading state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleActive = useCallback(
    async (member: StaffMember) => {
      if (togglingId) return;
      setTogglingId(member.id);
      try {
        const r = await fetch(`/smart-steps/api/staff/${member.id}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ isActive: !member.isActive }),
        });
        if (!r.ok) throw new Error();
        await load();
      } catch {
        // silent — user can retry
      } finally {
        setTogglingId(null);
      }
    },
    [load, togglingId]
  );

  const handleResendInvite = useCallback(
    async (member: StaffMember) => {
      if (resendingId) return;
      setResendingId(member.id);
      setToast(null);
      try {
        const r = await fetch(`/smart-steps/api/staff/${member.id}/resend-invite`, { method: "POST" });
        if (!r.ok) {
          const data = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Failed to resend invite");
        }
        setToast(`Invitation email sent to ${member.email}.`);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Failed to resend invite");
      } finally {
        setResendingId(null);
        setTimeout(() => setToast(null), 5000);
      }
    },
    [resendingId]
  );

  function openAdd() {
    setEditMember(null);
    setShowEditor(true);
  }

  function openEdit(member: StaffMember) {
    setEditMember(member);
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditMember(null);
  }

  // RBT: access denied
  if (status !== "loading" && userRole === "RBT") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <UserCheck className="h-10 w-10 text-zinc-700" />
        <p className="text-sm text-zinc-500">
          Staff directory is available to BCBA and Admin users.
        </p>
      </div>
    );
  }

  // Filtered list
  const visibleStaff = staff.filter((m) => {
    if (!showInactive && !m.isActive) return false;
    if (filter !== "ALL" && m.role !== filter) return false;
    return true;
  });

  const base = showInactive ? staff : staff.filter((m) => m.isActive);
  const counts = {
    ALL:   base.length,
    ADMIN: base.filter((m) => m.role === "ADMIN").length,
    BCBA:  base.filter((m) => m.role === "BCBA").length,
    RBT:   base.filter((m) => m.role === "RBT").length,
  };
  const inactiveCount = staff.filter((m) => !m.isActive).length;

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <UserCheck className="h-6 w-6 text-[var(--accent-cyan)]" />
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Staff</h1>
          </div>

          {/* Add Staff — Admin only */}
          {userRole === "ADMIN" && (
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-2 rounded-xl border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10 px-3 py-2 text-sm font-semibold text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/20 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Add Staff
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Manage staff members, roles, and client assignments.
        </p>
      </motion.div>

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["ALL", "ADMIN", "BCBA", "RBT"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setFilter(r)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              filter === r
                ? "bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/40"
                : "border-[var(--glass-border)] text-zinc-500 hover:border-[var(--accent-cyan)]/30 hover:text-zinc-300"
            }`}
          >
            {r === "ALL" ? "All" : r}
            <span className="ml-0.5 opacity-60"> ({counts[r]})</span>
          </button>
        ))}

        {/* Inactive toggle — only show if there are inactive users */}
        {inactiveCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              showInactive
                ? "border-zinc-600 bg-zinc-700/60 text-zinc-300"
                : "border-[var(--glass-border)] text-zinc-600 hover:text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {showInactive ? "Hide inactive" : `Show inactive (${inactiveCount})`}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 glass-card animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : visibleStaff.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Award className="h-10 w-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">
            {filter === "ALL"
              ? "No staff members found."
              : `No ${filter} users found.`}
          </p>
          {userRole === "ADMIN" && filter === "ALL" && (
            <button
              type="button"
              onClick={openAdd}
              className="mt-1 rounded-xl border border-[var(--glass-border)] px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            >
              Add the first staff member
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleStaff.map((member) => (
            <StaffCard
              key={member.id}
              member={member}
              userRole={userRole}
              isToggling={togglingId === member.id}
              isResending={resendingId === member.id}
              onEdit={() => openEdit(member)}
              onToggleActive={() => handleToggleActive(member)}
              onManageClients={() => setAssignMember(member)}
              onResendInvite={() => handleResendInvite(member)}
            />
          ))}
        </div>
      )}

      {/* Transient toast (invite resend feedback) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-[var(--glass-border)] bg-[var(--background)] px-4 py-3 text-sm text-zinc-200 shadow-2xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showEditor && (
          <StaffEditorModal
            key="editor"
            member={editMember}
            onClose={closeEditor}
            onSaved={() => { closeEditor(); load(); }}
          />
        )}
        {assignMember && (
          <AssignClientsModal
            key="assign"
            member={assignMember}
            onClose={() => { setAssignMember(null); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
