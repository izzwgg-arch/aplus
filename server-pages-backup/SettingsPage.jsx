import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

export default function SettingsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const tabs = ["General", "Users", "Billing", "Integrations", "Audit Logs"];
  const [activeTab, setActiveTab] = useState("General");
  const [form, setForm] = useState({
    defaultHourlyRate: 130,
    defaultCancellationFeeEnabled: false
  });
  const [integrations, setIntegrations] = useState([]);
  const [qbForm, setQbForm] = useState({ environment: "SANDBOX", realmId: "", companyName: "", accessToken: "", refreshToken: "", syncMode: "FULL" });
  const [phForm, setPhForm] = useState({ environment: "SANDBOX", apiKey: "", webhookSecret: "", paymentCollectionEnabled: true });
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
        <div className="empty-state">
          Billing operations are available in <Link className="text-primary-600 underline" to="/aplus/invoices">Invoicing</Link>.
        </div>
      )}

      {activeTab === "Audit Logs" && (
        <div className="empty-state">
          Audit logs are available in the dedicated view. <Link className="text-primary-600 underline" to="/aplus/audit-logs">Open Audit Logs</Link>
        </div>
      )}

      {activeTab === "Integrations" && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-semibold text-slate-900">QuickBooks</h3>
            <p className="mt-1 text-sm text-slate-500">Connection status: {quickbooks?.isEnabled ? "Connected" : "Disconnected"}</p>
            <div className="mt-3 grid gap-2">
              <select className="saas-input" value={qbForm.environment} onChange={(e) => setQbForm((prev) => ({ ...prev, environment: e.target.value }))}>
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION">Production</option>
              </select>
              <input className="saas-input" placeholder="Realm ID" value={qbForm.realmId} onChange={(e) => setQbForm((prev) => ({ ...prev, realmId: e.target.value }))} />
              <input className="saas-input" placeholder="Company Name" value={qbForm.companyName} onChange={(e) => setQbForm((prev) => ({ ...prev, companyName: e.target.value }))} />
              <input className="saas-input" type="password" placeholder="Access Token" value={qbForm.accessToken} onChange={(e) => setQbForm((prev) => ({ ...prev, accessToken: e.target.value }))} />
              <input className="saas-input" type="password" placeholder="Refresh Token" value={qbForm.refreshToken} onChange={(e) => setQbForm((prev) => ({ ...prev, refreshToken: e.target.value }))} />
              <select className="saas-input" value={qbForm.syncMode} onChange={(e) => setQbForm((prev) => ({ ...prev, syncMode: e.target.value }))}>
                <option value="CUSTOMERS_ONLY">Customers only</option>
                <option value="INVOICES_ONLY">Invoices only</option>
                <option value="PAYMENTS_ONLY">Payments only</option>
                <option value="FULL">Full sync</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!isAdmin || loadingAction === "qb-connect"}
                onClick={() => runIntegrationAction(
                  "qb-connect",
                  () => api.post("/integrations/quickbooks/connect", qbForm),
                  "QuickBooks connected."
                )}
              >
                Connect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || loadingAction === "qb-disconnect"}
                onClick={() => runIntegrationAction("qb-disconnect", () => api.post("/integrations/quickbooks/disconnect"), "QuickBooks disconnected.")}
              >
                Disconnect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !quickbooks?.isEnabled || loadingAction === "qb-test"}
                onClick={() => runIntegrationAction("qb-test", () => api.post("/integrations/quickbooks/test"), "QuickBooks test successful.")}
              >
                Test Connection
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !quickbooks?.isEnabled || loadingAction === "qb-sync"}
                onClick={() => runIntegrationAction("qb-sync", () => api.post("/integrations/quickbooks/sync-now"), "QuickBooks sync started.")}
              >
                Sync Now
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Last sync: {quickbooks?.lastSyncAt ? new Date(quickbooks.lastSyncAt).toLocaleString() : "Never"}</p>
            {quickbooks?.syncError && <p className="text-xs text-red-600">{quickbooks.syncError}</p>}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-semibold text-slate-900">Payment Hub</h3>
            <p className="mt-1 text-sm text-slate-500">Connection status: {paymentHub?.isEnabled ? "Connected" : "Disconnected"}</p>
            <div className="mt-3 grid gap-2">
              <select className="saas-input" value={phForm.environment} onChange={(e) => setPhForm((prev) => ({ ...prev, environment: e.target.value }))}>
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION">Production</option>
              </select>
              <input className="saas-input" type="password" placeholder="API Key" value={phForm.apiKey} onChange={(e) => setPhForm((prev) => ({ ...prev, apiKey: e.target.value }))} />
              <input className="saas-input" type="password" placeholder="Webhook Secret" value={phForm.webhookSecret} onChange={(e) => setPhForm((prev) => ({ ...prev, webhookSecret: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={phForm.paymentCollectionEnabled} onChange={(e) => setPhForm((prev) => ({ ...prev, paymentCollectionEnabled: e.target.checked }))} />
                Enable payment collection
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={!isAdmin || loadingAction === "ph-connect"}
                onClick={() => runIntegrationAction("ph-connect", () => api.post("/integrations/payment-hub/connect", phForm), "Payment Hub connected.")}
              >
                Connect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || loadingAction === "ph-disconnect"}
                onClick={() => runIntegrationAction("ph-disconnect", () => api.post("/integrations/payment-hub/disconnect"), "Payment Hub disconnected.")}
              >
                Disconnect
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !paymentHub?.isEnabled || loadingAction === "ph-test"}
                onClick={() => runIntegrationAction("ph-test", () => api.post("/integrations/payment-hub/test"), "Payment Hub test successful.")}
              >
                Test Connection
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin || !paymentHub?.isEnabled || loadingAction === "ph-sync"}
                onClick={() => runIntegrationAction("ph-sync", () => api.post("/integrations/payment-hub/sync-now"), "Payment Hub sync started.")}
              >
                Sync Now
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Last sync: {paymentHub?.lastSyncAt ? new Date(paymentHub.lastSyncAt).toLocaleString() : "Never"}</p>
            <p className="text-xs text-slate-500">Credentials: {paymentHub?.metadataJson?.credentialMasked || "Not configured"}</p>
            <p className="text-xs text-slate-500">Webhook secret: {paymentHub?.metadataJson?.webhookSecretMasked || "Not configured"}</p>
            {paymentHub?.syncError && <p className="text-xs text-red-600">{paymentHub.syncError}</p>}
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
        </div>
      )}
      </div>
    </div>
  );
}
