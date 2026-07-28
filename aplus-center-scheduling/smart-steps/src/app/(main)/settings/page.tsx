"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Moon, Sun, Monitor, Shield, Database, User, Building2, Upload, ShieldCheck, LifeBuoy, Mail } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

type OrgSettings = {
  orgName: string;
  orgAddress: string;
  orgPhone: string;
  orgEmail: string;
  logoUrl: string;
  letterheadHtml: string;
  footerHtml: string;
};

type EmailSettings = {
  emailEnabled: boolean;
  emailSenderName: string;
  emailFromAddress: string;
  emailReplyTo: string;
  emailUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  hasAppPassword: boolean;
};

const EMPTY_EMAIL: EmailSettings = {
  emailEnabled: false,
  emailSenderName: "",
  emailFromAddress: "",
  emailReplyTo: "",
  emailUser: "",
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  hasAppPassword: false,
};

export default function SettingsPage() {
  const { theme, setTheme, resolved } = useThemeStore();
  const { data: session } = useSession();
  const { can } = usePermissions();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const handleTheme = (t: "dark" | "light" | "system") => {
    setTheme(t);
    toast.success(`Theme set to ${t}`);
  };

  const user = session?.user as { name?: string | null; email?: string | null; role?: string } | undefined;
  // Permission-driven (not the legacy role string) so custom roles reassigned
  // via Settings → Roles & Permissions are respected immediately.
  const canEditOrg = can("smartsteps.organization_settings.edit");
  const canViewOrg = can("smartsteps.organization_settings.view");

  // ── Org settings state ──────────────────────────────────────────────────────
  const [org, setOrg]           = useState<OrgSettings>({ orgName: "", orgAddress: "", orgPhone: "", orgEmail: "", logoUrl: "", letterheadHtml: "", footerHtml: "" });
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaving,  setOrgSaving]  = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const loadOrg = useCallback(async () => {
    try {
      const r = await fetch("/smart-steps/api/organization/settings");
      if (r.ok) {
        const d = await r.json();
        setOrg({
          orgName:        d.orgName        ?? "",
          orgAddress:     d.orgAddress     ?? "",
          orgPhone:       d.orgPhone       ?? "",
          orgEmail:       d.orgEmail       ?? "",
          logoUrl:        d.logoUrl        ?? "",
          letterheadHtml: d.letterheadHtml ?? "",
          footerHtml:     d.footerHtml     ?? "",
        });
      }
    } catch { /* silent */ } finally { setOrgLoading(false); }
  }, []);

  useEffect(() => { if (canViewOrg) loadOrg(); else setOrgLoading(false); }, [loadOrg, canViewOrg]);

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    setOrgSaving(true);
    try {
      const r = await fetch("/smart-steps/api/organization/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(org),
      });
      if (!r.ok) throw new Error();
      toast.success("Organization settings saved");
    } catch {
      toast.error("Could not save organization settings");
    } finally {
      setOrgSaving(false);
    }
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) {
      toast.error("Logo file must be under 300 KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setOrg((p) => ({ ...p, logoUrl: dataUrl }));
      toast.success("Logo loaded — save to apply");
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
  }

  // ── Email integration (ADMIN only) ──────────────────────────────────────────
  const isAdmin = user?.role === "ADMIN";
  const [email, setEmail] = useState<EmailSettings>(EMPTY_EMAIL);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailBusy, setEmailBusy] = useState<null | "test" | "send">(null);
  // Plaintext app password entered in the form. Blank = keep the stored one.
  const [appPassword, setAppPassword] = useState("");
  const [testRecipient, setTestRecipient] = useState("");

  const loadEmail = useCallback(async () => {
    try {
      const r = await fetch("/smart-steps/api/organization/email-settings");
      if (r.ok) {
        const d = await r.json();
        setEmail({
          emailEnabled:     Boolean(d.emailEnabled),
          emailSenderName:  d.emailSenderName  ?? "",
          emailFromAddress: d.emailFromAddress ?? "",
          emailReplyTo:     d.emailReplyTo     ?? "",
          emailUser:        d.emailUser        ?? "",
          smtpHost:         d.smtpHost         || "smtp.gmail.com",
          smtpPort:         d.smtpPort         ?? 465,
          smtpSecure:       d.smtpSecure       ?? true,
          hasAppPassword:   Boolean(d.hasAppPassword),
        });
      }
    } catch { /* silent */ } finally { setEmailLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) loadEmail(); else setEmailLoading(false); }, [loadEmail, isAdmin]);

  function emailPayload() {
    return {
      emailEnabled: email.emailEnabled,
      emailSenderName: email.emailSenderName,
      emailFromAddress: email.emailFromAddress,
      emailReplyTo: email.emailReplyTo,
      emailUser: email.emailUser,
      smtpHost: email.smtpHost,
      smtpPort: email.smtpPort,
      smtpSecure: email.smtpSecure,
      // Only send a password when the admin typed a new one. Strip all
      // whitespace — Google shows app passwords as space-separated groups and
      // pasted spaces would otherwise break SMTP auth.
      appPassword: appPassword.replace(/\s+/g, "") || undefined,
    };
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailSaving(true);
    try {
      const r = await fetch("/smart-steps/api/organization/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailPayload()),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setEmail((p) => ({ ...p, hasAppPassword: Boolean(d.hasAppPassword) }));
      setAppPassword("");
      toast.success("Email settings saved");
    } catch {
      toast.error("Could not save email settings");
    } finally {
      setEmailSaving(false);
    }
  }

  async function testEmailConnection() {
    setEmailBusy("test");
    try {
      const r = await fetch("/smart-steps/api/organization/email-settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appPassword: appPassword.replace(/\s+/g, "") || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) toast.success("SMTP connection succeeded");
      else toast.error(d.error || "Connection failed");
    } catch {
      toast.error("Connection failed");
    } finally {
      setEmailBusy(null);
    }
  }

  async function sendTestEmail() {
    if (!testRecipient.trim()) { toast.error("Enter a test recipient email"); return; }
    setEmailBusy("send");
    try {
      const r = await fetch("/smart-steps/api/organization/email-settings/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testRecipient.trim(), appPassword: appPassword.replace(/\s+/g, "") || undefined }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) toast.success(`Test email sent to ${testRecipient.trim()}`);
      else toast.error(d.error || "Could not send test email");
    } catch {
      toast.error("Could not send test email");
    } finally {
      setEmailBusy(null);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        <p className="text-zinc-500 text-sm">Account, appearance, organization, and system info</p>
      </motion.div>

      {/* Account */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <User className="h-5 w-5 text-[var(--accent-cyan)]" />
          <h2 className="font-semibold text-[var(--foreground)]">Account</h2>
        </div>
        {user ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
              <span className="text-sm text-zinc-400">Name</span>
              <span className="text-sm text-[var(--foreground)]">{user.name ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
              <span className="text-sm text-zinc-400">Email</span>
              <span className="text-sm text-[var(--foreground)]">{user.email ?? "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-zinc-400">Role</span>
              <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${
                user.role === "ADMIN" ? "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)]"
                : user.role === "BCBA" ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)]"
                : "bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]"
              }`}>
                {user.role ?? "RBT"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Not signed in</p>
        )}
      </motion.section>

      {/* Appearance */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="h-5 w-5 text-[var(--accent-purple)]" />
          <h2 className="font-semibold text-[var(--foreground)]">Appearance</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { value: "dark", Icon: Moon, label: "Dark" },
            { value: "light", Icon: Sun, label: "Light" },
            { value: "system", Icon: Monitor, label: "System" },
          ].map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTheme(value as "dark" | "light" | "system")}
              className={`tap-target flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition-all ${
                theme === value
                  ? "bg-[var(--accent-cyan)]/20 text-[var(--accent-cyan)] ring-1 ring-[var(--accent-cyan)]/50"
                  : "bg-[var(--glass-bg)] text-zinc-400 hover:text-[var(--foreground)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </motion.section>

      {/* Roles & Permissions management */}
      {can("smartsteps.permissions.manage") && (
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="glass-card rounded-2xl p-5 mb-4"
        >
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck className="h-5 w-5 text-[var(--accent-cyan)]" />
            <h2 className="font-semibold text-[var(--foreground)]">Roles &amp; Permissions</h2>
          </div>
          <p className="text-sm text-zinc-500 mb-3">
            Control what each role can see and do, and assign staff members to roles.
          </p>
          <Link href="/settings/permissions" className="btn-primary inline-flex rounded-xl px-4 py-2 text-sm font-semibold">
            Open Permissions
          </Link>
        </motion.section>
      )}

      {/* Local data recovery */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-3">
          <LifeBuoy className="h-5 w-5 text-amber-400" />
          <h2 className="font-semibold text-[var(--foreground)]">Local Data Recovery</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-3">
          If data you entered on THIS device ever seemed to disappear, use this to scan this
          browser&apos;s offline storage for anything that never made it to the server, and push it up.
        </p>
        <Link href="/data-recovery" className="btn-primary inline-flex rounded-xl px-4 py-2 text-sm font-semibold">
          Open Data Recovery
        </Link>
      </motion.section>

      {/* Access control info */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-[var(--accent-pink)]" />
          <h2 className="font-semibold text-[var(--foreground)]">Access control</h2>
        </div>
        <div className="space-y-2 text-sm text-zinc-400">
          <p><span className="text-[var(--accent-pink)] font-medium">ADMIN:</span> Full access — create, edit, archive, delete anything</p>
          <p><span className="text-[var(--accent-cyan)] font-medium">BCBA:</span> Create and manage clients, goals, programs, assessments</p>
          <p><span className="text-[var(--accent-purple)] font-medium">RBT:</span> View assigned clients, record session data</p>
        </div>
      </motion.section>

      {/* Organization branding — RBT has zero visibility into org settings */}
      {canViewOrg && (
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="h-5 w-5 text-emerald-400" />
          <h2 className="font-semibold text-[var(--foreground)]">Organization</h2>
          {!canEditOrg && (
            <span className="ml-auto text-[11px] text-zinc-600">View only — BCBA/ADMIN can edit</span>
          )}
        </div>

        {orgLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse" />)}
          </div>
        ) : (
          <form onSubmit={saveOrg} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Organization Name</label>
                <input
                  className="field-input w-full text-sm"
                  value={org.orgName}
                  onChange={(e) => setOrg((p) => ({ ...p, orgName: e.target.value }))}
                  disabled={!canEditOrg}
                  placeholder="A+ Center"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Email</label>
                <input
                  className="field-input w-full text-sm"
                  value={org.orgEmail}
                  onChange={(e) => setOrg((p) => ({ ...p, orgEmail: e.target.value }))}
                  disabled={!canEditOrg}
                  placeholder="info@example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Phone</label>
                <input
                  className="field-input w-full text-sm"
                  value={org.orgPhone}
                  onChange={(e) => setOrg((p) => ({ ...p, orgPhone: e.target.value }))}
                  disabled={!canEditOrg}
                  placeholder="(555) 000-0000"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Address</label>
                <input
                  className="field-input w-full text-sm"
                  value={org.orgAddress}
                  onChange={(e) => setOrg((p) => ({ ...p, orgAddress: e.target.value }))}
                  disabled={!canEditOrg}
                  placeholder="123 Main St, City, State"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                Logo <span className="normal-case text-zinc-600 font-normal">(upload image or paste URL)</span>
              </label>
              {/* File upload — converts to base64 data URL, stored in logoUrl */}
              {canEditOrg && (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleLogoFile}
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-xs text-zinc-400 hover:border-[var(--accent-cyan)]/40 hover:text-[var(--accent-cyan)] transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload Image
                  </button>
                  <span className="text-[10px] text-zinc-600">PNG, JPG, SVG — max 300 KB</span>
                </div>
              )}
              {/* Logo preview */}
              {org.logoUrl && (
                <div className="mb-2 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={org.logoUrl}
                    alt="Logo preview"
                    className="h-10 max-w-[120px] rounded object-contain border border-[var(--glass-border)] bg-white/5 p-1"
                  />
                  {canEditOrg && (
                    <button
                      type="button"
                      onClick={() => setOrg((p) => ({ ...p, logoUrl: "" }))}
                      className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
              {/* URL fallback */}
              <input
                className="field-input w-full text-sm"
                value={org.logoUrl.startsWith("data:") ? "" : org.logoUrl}
                onChange={(e) => setOrg((p) => ({ ...p, logoUrl: e.target.value }))}
                disabled={!canEditOrg}
                placeholder="Or paste image URL (https://...)"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                Letterhead HTML <span className="normal-case text-zinc-600 font-normal">(used in printed reports)</span>
              </label>
              <textarea
                className="field-input w-full text-sm font-mono"
                rows={3}
                value={org.letterheadHtml}
                onChange={(e) => setOrg((p) => ({ ...p, letterheadHtml: e.target.value }))}
                disabled={!canEditOrg}
                placeholder="Leave blank to auto-generate from org name/logo/address above"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                Footer HTML <span className="normal-case text-zinc-600 font-normal">(used in printed reports)</span>
              </label>
              <textarea
                className="field-input w-full text-sm font-mono"
                rows={2}
                value={org.footerHtml}
                onChange={(e) => setOrg((p) => ({ ...p, footerHtml: e.target.value }))}
                disabled={!canEditOrg}
                placeholder="Leave blank to auto-generate from org name/address"
              />
            </div>
            {canEditOrg && (
              <button
                type="submit"
                disabled={orgSaving}
                className="btn-primary rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {orgSaving ? "Saving…" : "Save Organization Settings"}
              </button>
            )}
          </form>
        )}
      </motion.section>
      )}

      {/* Email Integration — ADMIN only (carries outgoing SMTP credentials) */}
      {isAdmin && (
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="glass-card rounded-2xl p-5 mb-4"
      >
        <div className="flex items-center gap-3 mb-1">
          <Mail className="h-5 w-5 text-[var(--accent-cyan)]" />
          <h2 className="font-semibold text-[var(--foreground)]">Email Integration</h2>
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          Dedicated SmartSteps outgoing email (separate from A+ Scheduling). Use a Google Workspace
          address and a Google <span className="text-zinc-400">App Password</span> (not the account password).
        </p>

        {emailLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse" />)}
          </div>
        ) : (
          <form onSubmit={saveEmail} className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={email.emailEnabled}
                onChange={(e) => setEmail((p) => ({ ...p, emailEnabled: e.target.checked }))}
              />
              Enabled — send SmartSteps email through this account
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Sender Name</label>
                <input
                  className="field-input w-full text-sm"
                  value={email.emailSenderName}
                  onChange={(e) => setEmail((p) => ({ ...p, emailSenderName: e.target.value }))}
                  placeholder="SmartSteps ABA"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Workspace Email</label>
                <input
                  className="field-input w-full text-sm"
                  value={email.emailFromAddress}
                  onChange={(e) => setEmail((p) => ({ ...p, emailFromAddress: e.target.value }))}
                  placeholder="aba@yourdomain.com"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                Google App Password
              </label>
              <input
                type="password"
                className="field-input w-full text-sm"
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                placeholder={email.hasAppPassword ? "•••••••••••• (saved — leave blank to keep)" : "16-character app password"}
                autoComplete="new-password"
              />
              <p className="mt-1 text-[11px] text-zinc-600">
                Stored encrypted. Never displayed after saving. Leave blank to keep the existing password.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Reply-To Email <span className="normal-case text-zinc-600 font-normal">(optional)</span></label>
                <input
                  className="field-input w-full text-sm"
                  value={email.emailReplyTo}
                  onChange={(e) => setEmail((p) => ({ ...p, emailReplyTo: e.target.value }))}
                  placeholder="replies@yourdomain.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">SMTP Username <span className="normal-case text-zinc-600 font-normal">(defaults to Workspace Email)</span></label>
                <input
                  className="field-input w-full text-sm"
                  value={email.emailUser}
                  onChange={(e) => setEmail((p) => ({ ...p, emailUser: e.target.value }))}
                  placeholder="aba@yourdomain.com"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">SMTP Host</label>
                <input
                  className="field-input w-full text-sm"
                  value={email.smtpHost}
                  onChange={(e) => setEmail((p) => ({ ...p, smtpHost: e.target.value }))}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">SMTP Port</label>
                <input
                  type="number"
                  className="field-input w-full text-sm"
                  value={email.smtpPort}
                  onChange={(e) => setEmail((p) => ({ ...p, smtpPort: Number(e.target.value) }))}
                  placeholder="465"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Encryption</label>
                <select
                  className="field-input w-full text-sm"
                  value={email.smtpSecure ? "ssl" : "starttls"}
                  onChange={(e) => {
                    const secure = e.target.value === "ssl";
                    setEmail((p) => ({ ...p, smtpSecure: secure, smtpPort: secure ? 465 : 587 }));
                  }}
                >
                  <option value="ssl">SSL/TLS (465)</option>
                  <option value="starttls">STARTTLS (587)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={emailSaving}
                className="btn-primary rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {emailSaving ? "Saving…" : "Save Settings"}
              </button>
              <button
                type="button"
                onClick={testEmailConnection}
                disabled={emailBusy !== null}
                className="rounded-xl border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-[var(--foreground)] disabled:opacity-40"
              >
                {emailBusy === "test" ? "Testing…" : "Test Connection"}
              </button>
            </div>

            <div className="mt-2 rounded-xl border border-[var(--glass-border)] bg-white/5 p-3">
              <label className="mb-1 block text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">Send Test Email</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="field-input flex-1 min-w-[220px] text-sm"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="recipient@example.com"
                />
                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={emailBusy !== null}
                  className="rounded-xl border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-[var(--foreground)] disabled:opacity-40"
                >
                  {emailBusy === "send" ? "Sending…" : "Send Test Email"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-zinc-600">
                Sends a “SmartSteps Email Test” message from the configured sender account.
              </p>
            </div>
          </form>
        )}
      </motion.section>
      )}

      {/* System info */}
      <motion.section
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-center gap-3 mb-4">
          <Database className="h-5 w-5 text-emerald-400" />
          <h2 className="font-semibold text-[var(--foreground)]">System</h2>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
            <span className="text-sm text-zinc-400">App</span>
            <span className="text-sm text-[var(--foreground)]">Smart Steps ABA Tracker</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
            <span className="text-sm text-zinc-400">Auth</span>
            <span className="text-sm text-emerald-400">NextAuth v5 / SSO</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-[var(--glass-border)]">
            <span className="text-sm text-zinc-400">Offline</span>
            <span className="text-sm text-[var(--accent-cyan)]">Dexie.js / IndexedDB</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-zinc-400">Data</span>
            <span className="text-sm text-[var(--foreground)]">PostgreSQL via Prisma</span>
          </div>
        </div>
        <p className="mt-4 text-xs text-zinc-600">
          Assessment templates, clients, goals, and session data are stored in the connected PostgreSQL database.
          Offline session data is queued in IndexedDB and synced when you reconnect.
        </p>
      </motion.section>
    </div>
  );
}
