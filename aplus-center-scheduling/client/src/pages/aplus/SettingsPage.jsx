import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RemindersSettingsTab } from "./RemindersSettingsTab";

function BillingTab({ isAdmin, toast }) {
  const [branding, setBranding] = useState({
    companyName: "",
    companyAddress: "",
    companyEmail: "",
    companyPhone: "",
    invoiceFooterText: "",
    invoiceAccentColor: "#2563EB",
    invoiceLogoUrl: ""
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => {
    api.get("/settings").then((res) => {
      setBranding({
        companyName: res.data.companyName || "",
        companyAddress: res.data.companyAddress || "",
        companyEmail: res.data.companyEmail || "",
        companyPhone: res.data.companyPhone || "",
        invoiceFooterText: res.data.invoiceFooterText || "",
        invoiceAccentColor: res.data.invoiceAccentColor || "#2563EB",
        invoiceLogoUrl: res.data.invoiceLogoUrl || ""
      });
    }).catch(() => {});
  }, []);

  const saveBranding = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put("/settings", {
        companyName: branding.companyName || null,
        companyAddress: branding.companyAddress || null,
        companyEmail: branding.companyEmail || null,
        companyPhone: branding.companyPhone || null,
        invoiceFooterText: branding.invoiceFooterText || null,
        invoiceAccentColor: branding.invoiceAccentColor || "#2563EB"
      });
      setBranding((prev) => ({ ...prev, ...res.data }));
      toast?.success("Branding settings saved.");
    } catch {
      toast?.error("Could not save branding settings.");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await api.post("/settings/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setBranding((prev) => ({ ...prev, invoiceLogoUrl: res.data.invoiceLogoUrl || "" }));
      toast?.success("Logo uploaded.");
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Logo upload failed.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const Field = ({ label, children }) => (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Quick link */}
      <div style={{ padding: "14px 18px", background: "#EFF6FF", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 14, color: "#1D4ED8" }}>Invoices, payments, and billing records are managed in the Invoicing workspace.</p>
        <Link to="/aplus/invoices" style={{ fontSize: 13, fontWeight: 600, color: "#2563EB", textDecoration: "none", whiteSpace: "nowrap" }}>Open Invoicing →</Link>
      </div>

      {/* Branding card */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>Invoice Branding</p>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>This information appears on all invoices sent to clients.</p>
        </div>

        {/* Logo section */}
        <div style={{ marginBottom: 24, padding: "16px 20px", background: "#F8FAFC", borderRadius: 12, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 80, height: 60, borderRadius: 8, border: "1px dashed #CBD5E1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#fff", flexShrink: 0 }}>
            {branding.invoiceLogoUrl ? (
              <img src={branding.invoiceLogoUrl} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <p style={{ fontSize: 11, color: "#94A3B8", textAlign: "center" }}>No logo</p>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>Company Logo</p>
            <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>PNG, JPG up to 10MB. Appears on all invoice headers.</p>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={uploadLogo} />
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 12, padding: "6px 14px", height: "auto" }}
                disabled={!isAdmin || uploadingLogo}
                onClick={() => logoInputRef.current?.click()}
              >
                {uploadingLogo ? "Uploading…" : branding.invoiceLogoUrl ? "Change Logo" : "Upload Logo"}
              </button>
              {branding.invoiceLogoUrl && (
                <button
                  type="button"
                  style={{ fontSize: 12, color: "#EF4444", background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}
                  disabled={!isAdmin}
                  onClick={async () => {
                    try {
                      await api.put("/settings", { invoiceLogoUrl: null });
                      setBranding((prev) => ({ ...prev, invoiceLogoUrl: "" }));
                      toast?.success("Logo removed.");
                    } catch {
                      toast?.error("Could not remove logo.");
                    }
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={saveBranding} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Company Name">
            <input className="saas-input" value={branding.companyName} placeholder="A+ Center" disabled={!isAdmin} onChange={(e) => setBranding((p) => ({ ...p, companyName: e.target.value }))} />
          </Field>
          <Field label="Company Email">
            <input className="saas-input" type="email" value={branding.companyEmail} placeholder="billing@aclinic.com" disabled={!isAdmin} onChange={(e) => setBranding((p) => ({ ...p, companyEmail: e.target.value }))} />
          </Field>
          <Field label="Company Phone">
            <input className="saas-input" value={branding.companyPhone} placeholder="(555) 000-0000" disabled={!isAdmin} onChange={(e) => setBranding((p) => ({ ...p, companyPhone: e.target.value }))} />
          </Field>
          <Field label="Invoice Accent Color">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={branding.invoiceAccentColor || "#2563EB"}
                disabled={!isAdmin}
                onChange={(e) => setBranding((p) => ({ ...p, invoiceAccentColor: e.target.value }))}
                style={{ width: 40, height: 40, border: "none", cursor: isAdmin ? "pointer" : "default", borderRadius: 8, padding: 2 }}
              />
              <input
                className="saas-input"
                value={branding.invoiceAccentColor || "#2563EB"}
                placeholder="#2563EB"
                disabled={!isAdmin}
                onChange={(e) => setBranding((p) => ({ ...p, invoiceAccentColor: e.target.value }))}
              />
            </div>
          </Field>
          <Field label="Company Address">
            <textarea className="saas-textarea" rows={3} style={{ gridColumn: "1/-1" }} value={branding.companyAddress} placeholder="123 Main St, Suite 100&#10;City, State 00000" disabled={!isAdmin} onChange={(e) => setBranding((p) => ({ ...p, companyAddress: e.target.value }))} />
          </Field>
          <div style={{ gridColumn: "1/-1" }}>
            <Field label="Invoice Footer Text">
              <textarea className="saas-textarea" rows={2} value={branding.invoiceFooterText} placeholder="Thank you for choosing A+ Center. Payment is due within 30 days." disabled={!isAdmin} onChange={(e) => setBranding((p) => ({ ...p, invoiceFooterText: e.target.value }))} />
            </Field>
          </div>
          <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
            <button className="btn-primary" disabled={!isAdmin || saving} style={{ minWidth: 140 }}>
              {saving ? "Saving…" : "Save Branding"}
            </button>
            {!isAdmin && <p style={{ fontSize: 12, color: "#F59E0B", alignSelf: "center" }}>Only ADMIN users can edit branding settings.</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const tabs = ["General", "Users", "Billing", "Reminders", "Integrations", "Audit Logs"];
  const [activeTab, setActiveTab] = useState("General");
  const [form, setForm] = useState({
    defaultHourlyRate: 130,
    defaultCancellationFeeEnabled: false
  });
  const [integrations, setIntegrations] = useState([]);
  const [qbForm, setQbForm] = useState({ environment: "SANDBOX", realmId: "", companyName: "", accessToken: "", refreshToken: "", syncMode: "FULL" });
  const [phForm, setPhForm] = useState({ environment: "SANDBOX", apiKey: "", webhookSecret: "", paymentCollectionEnabled: true });
  const [voipmsForm, setVoipmsForm] = useState({ apiUser: "", apiPassword: "", webhookSecret: "" });
  const [voipmsWebhookTouched, setVoipmsWebhookTouched] = useState(false);
  const [voipmsWebhookHints, setVoipmsWebhookHints] = useState(null);
  const [voipmsHintsLoading, setVoipmsHintsLoading] = useState(false);
  const [gwForm, setGwForm] = useState({
    environment: "PRODUCTION",
    authType: "OAUTH2",
    workspaceDomain: "",
    userEmail: "",
    fromEmail: "",
    clientId: "",
    clientSecret: "",
    accessToken: "",
    refreshToken: "",
    appPassword: ""
  });
  const [gwTestRecipient, setGwTestRecipient] = useState("");
  const [gwTestResult, setGwTestResult] = useState(null);
  const [loadingAction, setLoadingAction] = useState("");
  const isAdmin = user?.role === "ADMIN";

  const quickbooks = useMemo(() => integrations.find((item) => item.provider === "QUICKBOOKS"), [integrations]);
  const paymentHub = useMemo(() => integrations.find((item) => item.provider === "PAYMENT_HUB"), [integrations]);
  const googleWorkspace = useMemo(() => integrations.find((item) => item.provider === "GOOGLE_WORKSPACE"), [integrations]);
  const voipms = useMemo(() => integrations.find((item) => item.provider === "VOIPMS"), [integrations]);

  const loadIntegrations = () => {
    api.get("/integrations").then((res) => setIntegrations(res.data)).catch(() => setIntegrations([]));
  };

  useEffect(() => {
    api.get("/settings")
      .then((res) => {
        setForm({
          defaultHourlyRate: res.data.defaultHourlyRate,
          defaultCancellationFeeEnabled: res.data.defaultCancellationFeeEnabled
        });
      })
      .catch(() => {});
    loadIntegrations();
  }, []);

  useEffect(() => {
    if (voipms?.metadataJson?.apiUser) {
      setVoipmsForm((prev) => ({ ...prev, apiUser: voipms.metadataJson.apiUser || "" }));
    }
  }, [voipms?.metadataJson?.apiUser]);

  useEffect(() => {
    if (activeTab !== "Integrations" || !isAdmin) return undefined;
    let cancelled = false;
    setVoipmsHintsLoading(true);
    api
      .get("/integrations/voipms/callback-hints")
      .then((res) => {
        if (!cancelled) setVoipmsWebhookHints(res.data);
      })
      .catch(() => {
        if (!cancelled) setVoipmsWebhookHints(null);
      })
      .finally(() => {
        if (!cancelled) setVoipmsHintsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, integrations]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.put("/settings", {
        defaultHourlyRate: Number(form.defaultHourlyRate),
        defaultCancellationFeeEnabled: Boolean(form.defaultCancellationFeeEnabled)
      });
      toast?.success("Settings saved.");
    } catch {
      toast?.error("Unable to save settings.");
    }
  };

  const runIntegrationAction = async (key, fn, successMessage) => {
    setLoadingAction(key);
    try {
      await fn();
      loadIntegrations();
      toast?.success(successMessage);
    } catch (error) {
      toast?.error(error?.response?.data?.error || "Integration action failed");
    } finally {
      setLoadingAction("");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Configure clinic-wide defaults for operations and billing.</p>
      </div>
      <div className="card">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? "btn-primary" : "btn-secondary"}
            >
              {tab}
            </button>
          ))}
        </div>

      {activeTab === "General" && <form onSubmit={save} className="max-w-2xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Default hourly rate ($)</span>
          <input
            className="saas-input"
            type="number"
            step="0.01"
            value={form.defaultHourlyRate}
            onChange={(e) => setForm((prev) => ({ ...prev, defaultHourlyRate: e.target.value }))}
            disabled={!isAdmin}
          />
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.defaultCancellationFeeEnabled}
            onChange={(e) => setForm((prev) => ({ ...prev, defaultCancellationFeeEnabled: e.target.checked }))}
            disabled={!isAdmin}
          />
          Enable cancellation fee by default for new clients
        </label>

        <button className="btn-primary disabled:opacity-50" disabled={!isAdmin}>
          Save Settings
        </button>
      {!isAdmin && <p className="text-xs text-amber-700 mt-2">Only ADMIN users can edit settings.</p>}
      </form>}

      {activeTab === "Users" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">User Management</h3>
            <p className="mt-1 text-sm text-slate-500">Open user roles and account management.</p>
            <Link className="btn-secondary mt-3 inline-flex" to="/aplus/users">Open Users</Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">User Settings</h3>
            <p className="mt-1 text-sm text-slate-500">Update your account password securely.</p>
            <Link className="btn-secondary mt-3 inline-flex" to="/change-password">Change Password</Link>
          </div>
        </div>
      )}

      {activeTab === "Billing" && (
        <BillingTab isAdmin={isAdmin} toast={toast} />
      )}

      {activeTab === "Reminders" && (
        <RemindersSettingsTab isAdmin={isAdmin} toast={toast} />
      )}

      {activeTab === "Audit Logs" && (
        <div className="empty-state">
          Audit logs are available in the dedicated view. <Link className="text-primary-600 underline" to="/aplus/audit-logs">Open Audit Logs</Link>
        </div>
      )}

      {activeTab === "Integrations" && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {/* ── Sola Payments ─────────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Sola Payments</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                loadingAction === "sola-test" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"
              }`}>
                {loadingAction === "sola-test" ? "Checking…" : "Active processor"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Sola Payments is configured via server environment variables
              (<code className="text-xs bg-slate-100 px-1 rounded">SOLA_XKEY</code>,{" "}
              <code className="text-xs bg-slate-100 px-1 rounded">SOLA_IFIELDS_KEY</code>).
              Use the button below to verify connectivity.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || loadingAction === "sola-test"}
                onClick={() => runIntegrationAction("sola-test", () => api.post("/payments/test-connection"), "Sola Payments key is configured.")}
              >
                {loadingAction === "sola-test" ? "Testing…" : "Test Connection"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Webhook URL to register in Sola portal:{" "}
              <code className="bg-slate-100 px-1 rounded break-all">
                {window.location.origin.replace(/:\d+$/, "")}/api/payments/webhook/sola
              </code>
            </p>
          </section>

          {/* ── QuickBooks ────────────────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">QuickBooks</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                quickbooks?.isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}>
                {quickbooks?.isEnabled ? "Connected" : "Not connected"}
              </span>
            </div>
            {quickbooks?.isEnabled ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm text-slate-700 font-medium">{quickbooks.companyName || "Company connected"}</p>
                <p className="text-xs text-slate-500">Realm ID: {quickbooks.realmId}</p>
                <p className="text-xs text-slate-500">Last sync: {quickbooks.lastSyncAt ? new Date(quickbooks.lastSyncAt).toLocaleString() : "Never"}</p>
                {quickbooks.syncError && <p className="text-xs text-red-600">{quickbooks.syncError}</p>}
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Connect QuickBooks to automatically create invoices and record payments.
                Invoices will be marked as Paid when a Sola payment is collected.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {!quickbooks?.isEnabled ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!isAdmin || loadingAction === "qb-auth"}
                  onClick={async () => {
                    setLoadingAction("qb-auth");
                    try {
                      const res = await api.get("/integrations/quickbooks/auth-url");
                      window.location.href = res.data.url;
                    } catch (err) {
                      setLoadingAction("");
                    }
                  }}
                >
                  {loadingAction === "qb-auth" ? "Redirecting…" : "Connect with QuickBooks"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!isAdmin || loadingAction === "qb-test"}
                    onClick={() => runIntegrationAction("qb-test", () => api.post("/integrations/quickbooks/test"), "QuickBooks connection verified.")}
                  >
                    Test Connection
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!isAdmin || loadingAction === "qb-sync"}
                    onClick={() => runIntegrationAction("qb-sync", () => api.post("/integrations/quickbooks/sync-now"), "QuickBooks sync triggered.")}
                  >
                    Sync Now
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-rose-600 hover:bg-rose-50"
                    disabled={!isAdmin || loadingAction === "qb-disconnect"}
                    onClick={() => runIntegrationAction("qb-disconnect", () => api.post("/integrations/quickbooks/disconnect"), "QuickBooks disconnected.")}
                  >
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-semibold text-slate-900">Google Workspace Email</h3>
            <p className="mt-1 text-sm text-slate-500">Connection status: {googleWorkspace?.isEnabled ? "Connected" : "Disconnected"}</p>
            <div className="mt-3 grid gap-2">
              <select className="saas-input" value={gwForm.environment} onChange={(e) => setGwForm((prev) => ({ ...prev, environment: e.target.value }))}>
                <option value="PRODUCTION">Production</option>
                <option value="SANDBOX">Sandbox</option>
              </select>
              <select className="saas-input" value={gwForm.authType} onChange={(e) => setGwForm((prev) => ({ ...prev, authType: e.target.value }))}>
                <option value="OAUTH2">OAuth2</option>
                <option value="APP_PASSWORD">App Password</option>
              </select>
              <input className="saas-input" placeholder="Workspace domain" value={gwForm.workspaceDomain} onChange={(e) => setGwForm((prev) => ({ ...prev, workspaceDomain: e.target.value }))} />
              <input className="saas-input" placeholder="User email" value={gwForm.userEmail} onChange={(e) => setGwForm((prev) => ({ ...prev, userEmail: e.target.value }))} />
              <input className="saas-input" placeholder="From email" value={gwForm.fromEmail} onChange={(e) => setGwForm((prev) => ({ ...prev, fromEmail: e.target.value }))} />
              {gwForm.authType === "OAUTH2" ? (
                <>
                  <input className="saas-input" placeholder="OAuth Client ID" value={gwForm.clientId} onChange={(e) => setGwForm((prev) => ({ ...prev, clientId: e.target.value }))} />
                  <input className="saas-input" type="password" placeholder="OAuth Client Secret" value={gwForm.clientSecret} onChange={(e) => setGwForm((prev) => ({ ...prev, clientSecret: e.target.value }))} />
                  <input className="saas-input" type="password" placeholder="Access Token" value={gwForm.accessToken} onChange={(e) => setGwForm((prev) => ({ ...prev, accessToken: e.target.value }))} />
                  <input className="saas-input" type="password" placeholder="Refresh Token" value={gwForm.refreshToken} onChange={(e) => setGwForm((prev) => ({ ...prev, refreshToken: e.target.value }))} />
                </>
              ) : (
                <>
                  <input className="saas-input" type="password" placeholder="Google App Password" value={gwForm.appPassword} onChange={(e) => setGwForm((prev) => ({ ...prev, appPassword: e.target.value }))} />
                  <p className="text-xs text-slate-500">You can paste the 16-character app password with or without spaces.</p>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!isAdmin || loadingAction === "gw-connect"}
                onClick={() => runIntegrationAction("gw-connect", () => api.post("/integrations/google-workspace/connect", gwForm), "Google Workspace connected.")}
              >
                Connect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || loadingAction === "gw-disconnect"}
                onClick={() => runIntegrationAction("gw-disconnect", () => api.post("/integrations/google-workspace/disconnect"), "Google Workspace disconnected.")}
              >
                Disconnect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !googleWorkspace?.isEnabled || loadingAction === "gw-test"}
                onClick={() => runIntegrationAction("gw-test", () => api.post("/integrations/google-workspace/test", gwForm), "Google Workspace test successful.")}
              >
                Test Connection
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !googleWorkspace?.isEnabled || loadingAction === "gw-sync"}
                onClick={() => runIntegrationAction("gw-sync", () => api.post("/integrations/google-workspace/sync-now"), "Google Workspace sync recorded.")}
              >
                Sync Now
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="saas-input min-w-[220px] flex-1"
                placeholder="Test recipient email"
                value={gwTestRecipient}
                onChange={(e) => setGwTestRecipient(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !googleWorkspace?.isEnabled || !gwTestRecipient || loadingAction === "gw-send-test"}
                onClick={async () => {
                  setLoadingAction("gw-send-test");
                  setGwTestResult(null);
                  try {
                    const { data } = await api.post("/integrations/google-workspace/send-test-email", { ...gwForm, to: gwTestRecipient });
                    setGwTestResult({
                      type: "success",
                      message: `Sent to ${gwTestRecipient}${data?.messageId ? ` (message id: ${data.messageId})` : ""}`
                    });
                    toast?.success(`Test email sent to ${gwTestRecipient}.`);
                    loadIntegrations();
                  } catch (error) {
                    const msg = error?.response?.data?.error || "Failed to send test email";
                    setGwTestResult({ type: "error", message: msg });
                    toast?.error(msg);
                    loadIntegrations();
                  } finally {
                    setLoadingAction("");
                  }
                }}
              >
                Send Test Email
              </button>
            </div>
            {gwTestResult && (
              <p className={`text-xs ${gwTestResult.type === "success" ? "text-emerald-700" : "text-red-600"}`}>
                {gwTestResult.type === "success" ? "Sent: " : "Failed: "}
                {gwTestResult.message}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">Last sync: {googleWorkspace?.lastSyncAt ? new Date(googleWorkspace.lastSyncAt).toLocaleString() : "Never"}</p>
            <p className="text-xs text-slate-500">User: {googleWorkspace?.metadataJson?.userEmail || "Not configured"}</p>
            <p className="text-xs text-slate-500">Auth: {googleWorkspace?.metadataJson?.authType || "Not configured"}</p>
            {googleWorkspace?.syncError && <p className="text-xs text-red-600">{googleWorkspace.syncError}</p>}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-semibold text-slate-900">VoIP.ms (SMS)</h3>
            <p className="mt-1 text-sm text-slate-500">
              Connection status: {voipms?.isEnabled ? "Connected" : "Disconnected"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              API credentials from your VoIP.ms portal (API &gt; REST API). Used for outbound reminder SMS and optional inbound STOP handling.
            </p>

            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-800">VoIP.ms webhook URL</p>
              <p className="text-xs text-slate-600">
                Paste into <strong>VoIP.ms → DID → SMS → SMS URL/API</strong>. VoIP.ms fills in{" "}
                <code className="rounded bg-white px-1">{`{FROM}`}</code>,{" "}
                <code className="rounded bg-white px-1">{`{TO}`}</code>,{" "}
                <code className="rounded bg-white px-1">{`{MESSAGE}`}</code>,{" "}
                <code className="rounded bg-white px-1">{`{ID}`}</code>,{" "}
                <code className="rounded bg-white px-1">{`{DATE}`}</code>.
              </p>
              {!voipmsWebhookHints?.publicBaseUrl && !voipmsHintsLoading && (
                <p className="text-xs text-amber-800">
                  Set <code className="rounded bg-white px-1">APP_BASE_URL</code> (or <code className="rounded bg-white px-1">PUBLIC_WEBHOOK_BASE_URL</code>) on the server to your live site, e.g.{" "}
                  <code className="rounded bg-white px-1">https://app.apluscenterinc.org</code>.
                </p>
              )}
              {voipmsHintsLoading && <p className="text-xs text-slate-500">Loading…</p>}
              {!voipmsWebhookHints?.webhookSecretConfigured && !voipmsHintsLoading && (voipmsWebhookHints?.webhookUrl || voipmsWebhookHints?.callbackWithToken) && (
                <p className="text-xs text-slate-600">
                  Optional: enter a webhook password below and click Save — the URL will update to include it (recommended for production).
                </p>
              )}
              {(voipmsWebhookHints?.webhookUrl || voipmsWebhookHints?.callbackWithToken) && (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">Copy for VoIP.ms</span>
                    <button
                      type="button"
                      className="btn-secondary py-1 px-2 text-xs"
                      onClick={() => {
                        const u = voipmsWebhookHints.webhookUrl || voipmsWebhookHints.callbackWithToken;
                        navigator.clipboard
                          .writeText(u)
                          .then(() => toast?.success("Copied."))
                          .catch(() => toast?.error("Could not copy."));
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-200 bg-white p-2 font-mono text-[11px] text-slate-800">
                    {voipmsWebhookHints.webhookUrl || voipmsWebhookHints.callbackWithToken}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-2">
              <input
                className="saas-input"
                placeholder="API email (username)"
                autoComplete="off"
                value={voipmsForm.apiUser}
                onChange={(e) => setVoipmsForm((prev) => ({ ...prev, apiUser: e.target.value }))}
              />
              <input
                className="saas-input"
                type="password"
                placeholder="API password"
                autoComplete="new-password"
                value={voipmsForm.apiPassword}
                onChange={(e) => setVoipmsForm((prev) => ({ ...prev, apiPassword: e.target.value }))}
              />
              <input
                className="saas-input"
                type="password"
                placeholder="Webhook password (optional — only if changing it)"
                autoComplete="new-password"
                value={voipmsForm.webhookSecret}
                onChange={(e) => {
                  setVoipmsWebhookTouched(true);
                  setVoipmsForm((prev) => ({ ...prev, webhookSecret: e.target.value }));
                }}
              />
              <p className="text-xs text-slate-500">
                Leave blank to keep the current password. After you save, copy the webhook URL again so it matches.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!isAdmin || loadingAction === "voipms-connect"}
                onClick={async () => {
                  setLoadingAction("voipms-connect");
                  try {
                    const body = {
                      apiUser: voipmsForm.apiUser,
                      apiPassword: voipmsForm.apiPassword
                    };
                    if (voipmsWebhookTouched) body.webhookSecret = voipmsForm.webhookSecret.trim();
                    await api.post("/integrations/voipms/connect", body);
                    loadIntegrations();
                    setVoipmsWebhookTouched(false);
                    setVoipmsForm((p) => ({ ...p, apiPassword: "", webhookSecret: "" }));
                    toast?.success("VoIP.ms saved.");
                  } catch (error) {
                    toast?.error(error?.response?.data?.error || "VoIP.ms save failed");
                  } finally {
                    setLoadingAction("");
                  }
                }}
              >
                Save / Connect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || loadingAction === "voipms-disconnect"}
                onClick={() =>
                  runIntegrationAction("voipms-disconnect", () => api.post("/integrations/voipms/disconnect"), "VoIP.ms disconnected.")
                }
              >
                Disconnect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !voipms?.isEnabled || loadingAction === "voipms-test"}
                onClick={() =>
                  runIntegrationAction("voipms-test", () => api.post("/integrations/voipms/test"), "VoIP.ms API test OK.")
                }
              >
                Test API
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              API password: {voipms?.metadataJson?.apiPasswordMasked || "Not configured"}
            </p>
            <p className="text-xs text-slate-500">
              Webhook secret: {voipms?.metadataJson?.webhookSecretMasked || "Not configured"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Reminder sending DID is set under <strong>Settings → Reminders</strong> (not here).
            </p>
          </section>
        </div>
      )}
      </div>
    </div>
  );
}
