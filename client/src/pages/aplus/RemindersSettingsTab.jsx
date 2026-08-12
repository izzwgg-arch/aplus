import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api";
import ReminderTemplateEditor from "../../components/reminders/ReminderTemplateEditor";
import {
  describeOffsetsHuman,
  minutesToTimeLabel,
  REMINDER_TEMPLATE_DEFAULTS,
  TEMPLATE_SECTION_META,
  TEMPLATE_TAB_ORDER
} from "../../lib/reminderTemplateUtils";

const SUB_KEYS = ["sending", "messages", "sms", "activity"];

const subLabels = {
  sending: "Sending & schedule",
  messages: "Message templates",
  sms: "SMS & VoIP",
  activity: "Queue & activity"
};

/** Shared reminder admin UI — used by Settings → Reminders and /aplus/reminders */
export function RemindersSettingsTab({ isAdmin, toast }) {
  const [g, setG] = useState(null);
  const [providers, setProviders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sub, setSub] = useState("sending");
  const [savingSettings, setSavingSettings] = useState(false);
  const [testSmsTo, setTestSmsTo] = useState("");
  const [testSmsDid, setTestSmsDid] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [dash, setDash] = useState(null);

  const load = () => {
    api.get("/reminders/settings/global").then((r) => setG(r.data)).catch(() => setG(null));
    api.get("/reminders/templates").then((r) => setTemplates(r.data || [])).catch(() => setTemplates([]));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    api
      .get("/providers", { params: { status: "active" } })
      .then((r) => setProviders(Array.isArray(r.data) ? r.data : []))
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (g?.voipmsDid) setTestSmsDid((prev) => prev || g.voipmsDid);
  }, [g]);

  const offsetSummary = useMemo(() => (g ? describeOffsetsHuman(g.defaultOffsetsJson) : ""), [g]);

  const saveSettings = async (e) => {
    e?.preventDefault?.();
    if (!g) return;
    setSavingSettings(true);
    try {
      const res = await api.put("/reminders/settings/global", g);
      setG(res.data);
      toast?.success("Sending settings saved.");
    } catch (err) {
      toast?.error(err?.response?.data?.error || "Could not save.");
    } finally {
      setSavingSettings(false);
    }
  };

  const loadDash = () => {
    api.get("/reminders/dashboard").then((r) => setDash(r.data)).catch(() => setDash(null));
  };

  const sortedTemplates = useMemo(() => {
    const order = TEMPLATE_TAB_ORDER;
    return [...templates].sort(
      (a, b) => order.indexOf(a.templateKey) - order.indexOf(b.templateKey)
    );
  }, [templates]);

  const saveTemplate = async (templateKey, subject, bodyTemplate) => {
    await api.put(`/reminders/templates/${templateKey}`, { subject, bodyTemplate });
    toast?.success("Message saved.");
  };

  if (!g) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">Loading reminder settings…</div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Section switcher */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5">
        {SUB_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              sub === k
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
          >
            {subLabels[k]}
          </button>
        ))}
      </div>

      {/* ——— Sending & schedule ——— */}
      {sub === "sending" && (
        <form onSubmit={saveSettings} className="space-y-6">
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Reminder sending</h2>
            <p className="mt-1 text-sm text-slate-500">
              Turn reminders on or off for the whole clinic. Individual appointments can still override some options.
            </p>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={g.remindersEnabledGlobal !== false}
                disabled={!isAdmin}
                onChange={(e) => setG((p) => ({ ...p, remindersEnabledGlobal: e.target.checked }))}
              />
              <span>
                <span className="font-medium text-slate-900">Send appointment reminders</span>
                <span className="mt-0.5 block text-sm text-slate-500">
                  When off, no queued reminders go out until you turn this back on.
                </span>
              </span>
            </label>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Who receives reminders</h2>
            <p className="mt-1 text-sm text-slate-500">Defaults for new appointments. You can change each visit separately.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ToggleRow
                checked={g.remindClientByDefault !== false}
                disabled={!isAdmin}
                onChange={(v) => setG((p) => ({ ...p, remindClientByDefault: v }))}
                title="Clients"
                desc="Patients and families get reminders."
              />
              <ToggleRow
                checked={g.remindProviderByDefault === true}
                disabled={!isAdmin}
                onChange={(v) => setG((p) => ({ ...p, remindProviderByDefault: v }))}
                title="Providers / staff"
                desc="Assigned provider, or your backup person if the visit has no provider."
              />
            </div>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  If an appointment has no provider, remind…
                </span>
                <select
                  className="saas-input mt-2 max-w-md"
                  disabled={!isAdmin}
                  value={g.defaultReminderProviderId || ""}
                  onChange={(e) => setG((p) => ({ ...p, defaultReminderProviderId: e.target.value || null }))}
                >
                  <option value="">No one (only assigned providers)</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.id}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  Useful for a coordinator or office manager who should see unassigned visits.
                </p>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Channels</h2>
            <p className="mt-1 text-sm text-slate-500">How reminders are delivered when an appointment uses the defaults.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ToggleRow
                checked={g.emailEnabledByDefault !== false}
                disabled={!isAdmin}
                onChange={(v) => setG((p) => ({ ...p, emailEnabledByDefault: v }))}
                title="Email"
                desc="HTML email reminders."
              />
              <ToggleRow
                checked={g.smsEnabledByDefault === true}
                disabled={!isAdmin}
                onChange={(v) => setG((p) => ({ ...p, smsEnabledByDefault: v }))}
                title="Text messages (SMS)"
                desc="Requires VoIP.ms below and a sending number."
              />
              <ToggleRow
                checked={g.smsProviderEnabled === true}
                disabled={!isAdmin}
                onChange={(v) => setG((p) => ({ ...p, smsProviderEnabled: v }))}
                title="SMS provider active"
                desc="Turn off to pause all outbound texts without losing settings."
              />
            </div>
            <div className="mt-5">
              <label className="block max-w-md">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sending phone number (VoIP.ms)
                </span>
                <input
                  className="saas-input mt-2"
                  disabled={!isAdmin}
                  value={g.voipmsDid || ""}
                  onChange={(e) => setG((p) => ({ ...p, voipmsDid: e.target.value.replace(/\D/g, "") }))}
                  placeholder="10-digit number texts are sent from"
                />
                <p className="mt-1 text-xs text-slate-500">Same as in VoIP.ms — not the office main line unless it’s set up there.</p>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">When &amp; how often</h2>
            <p className="mt-1 text-sm text-slate-500">
              Quiet hours and how long before the visit we try to notify people.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time zone</span>
                <input
                  className="saas-input mt-2"
                  disabled={!isAdmin}
                  value={g.timezone || ""}
                  onChange={(e) => setG((p) => ({ ...p, timezone: e.target.value }))}
                  placeholder="America/New_York"
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Earliest send time (each day)</span>
                <input
                  className="saas-input mt-2"
                  type="time"
                  disabled={!isAdmin}
                  value={minutesToTimeInput(g.sendWindowStartMinutes ?? 480)}
                  onChange={(e) => {
                    const m = timeInputToMinutes(e.target.value);
                    if (m != null) setG((p) => ({ ...p, sendWindowStartMinutes: m }));
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">{minutesToTimeLabel(g.sendWindowStartMinutes ?? 480)}</p>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest send time (each day)</span>
                <input
                  className="saas-input mt-2"
                  type="time"
                  disabled={!isAdmin}
                  value={minutesToTimeInput(g.sendWindowEndMinutes ?? 1200)}
                  onChange={(e) => {
                    const m = timeInputToMinutes(e.target.value);
                    if (m != null) setG((p) => ({ ...p, sendWindowEndMinutes: m }));
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">{minutesToTimeLabel(g.sendWindowEndMinutes ?? 1200)}</p>
              </label>
            </div>
            <div className="mt-5 rounded-xl bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950 ring-1 ring-indigo-100">
              <p className="font-medium">Current schedule</p>
              <p className="mt-1 text-indigo-900/90">{offsetSummary}</p>
            </div>
            <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Advanced — reminder timing (JSON)</summary>
              <p className="mt-2 text-xs text-slate-500">
                For technical edits only. Example:{" "}
                <code className="rounded bg-white px-1 text-[11px]">
                  [{`{"value":24,"unit":"HOURS"},{"value":30,"unit":"MINUTES"}`}]
                </code>
              </p>
              <textarea
                className="saas-textarea mt-2 min-h-[100px] font-mono text-xs"
                disabled={!isAdmin}
                value={g.defaultOffsetsJson || ""}
                onChange={(e) => setG((p) => ({ ...p, defaultOffsetsJson: e.target.value }))}
              />
            </details>
            <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Advanced — retries</summary>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={g.retryEnabled !== false}
                    disabled={!isAdmin}
                    onChange={(e) => setG((p) => ({ ...p, retryEnabled: e.target.checked }))}
                  />
                  Retry failed sends
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Attempts</span>
                  <input
                    className="saas-input w-20"
                    type="number"
                    min={1}
                    disabled={!isAdmin}
                    value={g.maxRetries ?? 3}
                    onChange={(e) => setG((p) => ({ ...p, maxRetries: Number(e.target.value) }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Wait (min)</span>
                  <input
                    className="saas-input w-20"
                    type="number"
                    min={1}
                    disabled={!isAdmin}
                    value={g.retryDelayMinutes ?? 15}
                    onChange={(e) => setG((p) => ({ ...p, retryDelayMinutes: Number(e.target.value) }))}
                  />
                </label>
              </div>
            </details>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={!isAdmin || savingSettings}>
              {savingSettings ? "Saving…" : "Save sending settings"}
            </button>
            {!isAdmin && <p className="text-xs text-amber-800">Only administrators can change these settings.</p>}
          </div>
        </form>
      )}

      {/* ——— Message templates ——— */}
      {sub === "messages" && (
        <div className="space-y-8">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 px-5 py-4 text-sm text-indigo-950">
            <p className="font-medium">Write messages in plain language</p>
            <p className="mt-1 text-indigo-900/85">
              Use the buttons to drop in names, date, and time. Everything saves exactly as the reminder system expects — no
              need to memorize codes.
            </p>
          </div>
          {sortedTemplates.map((t) => {
            const meta = TEMPLATE_SECTION_META[t.templateKey] || {
              title: t.templateKey.replace(/_/g, " "),
              subtitle: "",
              kind: t.templateKey.includes("SMS") ? "sms" : "email"
            };
            return (
              <ReminderTemplateEditor
                key={t.templateKey}
                title={meta.title}
                subtitle={meta.subtitle}
                subject={t.subject}
                bodyTemplate={t.bodyTemplate || ""}
                hasSubject={t.subject != null}
                kind={meta.kind}
                disabled={!isAdmin}
                onSubjectChange={
                  t.subject != null
                    ? (v) =>
                        setTemplates((prev) =>
                          prev.map((x) => (x.templateKey === t.templateKey ? { ...x, subject: v } : x))
                        )
                    : undefined
                }
                onBodyChange={(v) =>
                  setTemplates((prev) =>
                    prev.map((x) => (x.templateKey === t.templateKey ? { ...x, bodyTemplate: v } : x))
                  )
                }
                onSave={() => saveTemplate(t.templateKey, t.subject, t.bodyTemplate)}
                suggestedDefaults={REMINDER_TEMPLATE_DEFAULTS[t.templateKey] || null}
              />
            );
          })}
        </div>
      )}

      {/* ——— SMS & VoIP ——— */}
      {sub === "sms" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">VoIP.ms — inbound webhook</h2>
            <p className="mt-1 text-sm text-slate-500">
              Paste this URL into VoIP.ms so replies (e.g. STOP) can reach your system. API login is configured under{" "}
              <strong className="text-slate-700">Settings → Integrations → VoIP.ms</strong>.
            </p>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook URL</p>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <pre className="max-h-40 flex-1 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-800 shadow-sm">
                  {g.voipmsCallbackTemplate || g.voipmsWebhookUrlHint || "Set your public site URL on the server (APP_BASE_URL)."}
                </pre>
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-sm"
                  onClick={() => {
                    const u = g.voipmsCallbackTemplate || g.voipmsWebhookUrlHint;
                    if (!u) {
                      toast?.error("Nothing to copy yet.");
                      return;
                    }
                    navigator.clipboard.writeText(u).then(
                      () => toast?.success("Copied."),
                      () => toast?.error("Could not copy.")
                    );
                  }}
                >
                  Copy URL
                </button>
              </div>
              {g.voipmsCallbackAltApiKey && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-semibold text-slate-600">Alternate URL (api_key style)</p>
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white bg-white p-3 font-mono text-[11px] text-slate-800">
                    {g.voipmsCallbackAltApiKey}
                  </pre>
                </div>
              )}
            </div>
            <details className="mt-4 rounded-lg border border-slate-100 bg-white/60 p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">Technical note for VoIP.ms</summary>
              <p className="mt-2">
                VoIP.ms fills in <code className="rounded bg-slate-100 px-1">{`{FROM}`}</code>,{" "}
                <code className="rounded bg-slate-100 px-1">{`{TO}`}</code>,{" "}
                <code className="rounded bg-slate-100 px-1">{`{MESSAGE}`}</code>,{" "}
                <code className="rounded bg-slate-100 px-1">{`{ID}`}</code>,{" "}
                <code className="rounded bg-slate-100 px-1">{`{DATE}`}</code>
                {", "}optional <code className="rounded bg-slate-100 px-1">{`{MEDIA}`}</code>.
              </p>
              <p className="mt-2 text-slate-500">
                Environment variables <code className="rounded bg-slate-100 px-1">VOIPMS_*</code> still work if the integration
                is not connected.
              </p>
            </details>
            <p className="mt-4 text-xs text-slate-500">
              API connected: <strong>{g.voipmsApiConfigured ? "Yes" : "No"}</strong>
              {" · "}
              Webhook secret set: <strong>{g.voipmsWebhookConfigured ? "Yes" : "No"}</strong>
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Test delivery</h2>
            <p className="mt-1 text-sm text-slate-500">
              Check VoIP.ms login, your sending number, and mail — without waiting for a real appointment.
            </p>
            {g.lastSmsTestAt && (
              <p className="mt-3 text-xs text-slate-500">
                Last SMS test: {new Date(g.lastSmsTestAt).toLocaleString()} —{" "}
                {g.lastSmsTestOk ? "OK" : g.lastSmsTestResult || "Failed"}
              </p>
            )}
            <div className="mt-4 rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-amber-950">
              SMS tests need the <strong>sending number</strong> from VoIP.ms, not only your API password.
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-secondary"
                disabled={!isAdmin}
                onClick={async () => {
                  try {
                    await api.post("/reminders/voipms/test-connection");
                    toast?.success("VoIP.ms connection OK.");
                    load();
                  } catch (err) {
                    toast?.error(err?.response?.data?.error || "Connection test failed");
                  }
                }}
              >
                Test VoIP.ms API
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
              <label className="block text-sm">
                <span className="text-xs font-medium text-slate-500">Sending number</span>
                <input
                  className="saas-input mt-1"
                  value={testSmsDid}
                  onChange={(e) => setTestSmsDid(e.target.value.replace(/\D/g, ""))}
                  placeholder="10 digits"
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-medium text-slate-500">Send test text to</span>
                <input
                  className="saas-input mt-1"
                  value={testSmsTo}
                  onChange={(e) => setTestSmsTo(e.target.value)}
                  placeholder="Mobile number"
                />
              </label>
              <button
                type="button"
                className="btn-primary h-10"
                disabled={!isAdmin}
                onClick={async () => {
                  try {
                    await api.post("/reminders/test-sms", { to: testSmsTo, did: testSmsDid || undefined });
                    toast?.success("Test SMS sent.");
                    load();
                  } catch (err) {
                    toast?.error(err?.response?.data?.error || "SMS failed");
                  }
                }}
              >
                Send test SMS
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">If the sending number is blank, the saved number under Sending &amp; schedule is used.</p>
            <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-6">
              <label className="min-w-[220px] flex-1 text-sm">
                <span className="text-xs font-medium text-slate-500">Send test email to</span>
                <input
                  className="saas-input mt-1"
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-secondary h-10"
                disabled={!isAdmin}
                onClick={async () => {
                  try {
                    await api.post("/reminders/test-email", { to: testEmailTo });
                    toast?.success("Test email sent.");
                  } catch (err) {
                    toast?.error(err?.response?.data?.error || "Email failed");
                  }
                }}
              >
                Send test email
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ——— Queue ——— */}
      {sub === "activity" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Reminder queue</h2>
                <p className="mt-1 text-sm text-slate-500">What’s waiting, what failed, and what went out recently.</p>
              </div>
              <button type="button" className="btn-secondary text-sm" onClick={loadDash}>
                Refresh
              </button>
            </div>
            {!dash && <p className="mt-6 text-sm text-slate-500">Click refresh to load the queue.</p>}
            {dash && (
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <QueueCard title="Queued" items={dash.upcoming} empty="Nothing in the queue." render={(j) => (
                  <>
                    <span className="font-medium text-slate-800">{j.channel}</span>
                    <span className="text-slate-500"> · {new Date(j.scheduledFor).toLocaleString()}</span>
                  </>
                )} />
                <QueueCard title="Failed" items={dash.failed} empty="No failures." render={(j) => (
                  <span className="text-red-700">{j.errorMessage || j.status}</span>
                )} />
                <QueueCard title="Recently sent" items={dash.recent} empty="No recent sends." render={(j) => (
                  <>
                    <span className="font-medium text-slate-800">{j.channel}</span>
                    {j.sentAt && <span className="text-slate-500"> · {new Date(j.sentAt).toLocaleString()}</span>}
                  </>
                )} />
              </div>
            )}
            <div className="mt-8 border-t border-slate-100 pt-6">
              <p className="text-sm text-slate-600">
                Rebuild reminder jobs for all upcoming appointments (next 90 days) if you changed timing or templates.
              </p>
              <button
                type="button"
                className="btn-secondary mt-3 text-sm"
                disabled={!isAdmin}
                onClick={async () => {
                  try {
                    const { data } = await api.post("/reminders/admin/backfill");
                    toast?.success(`Updated ${data.appointmentsProcessed} appointments.`);
                  } catch {
                    toast?.error("Could not run reconcile.");
                  }
                }}
              >
                Reconcile upcoming appointments
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ checked, disabled, onChange, title, desc }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/40 p-4 transition hover:bg-slate-50">
      <input
        type="checkbox"
        className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{desc}</span>
      </span>
    </label>
  );
}

function minutesToTimeInput(totalMinutes) {
  const m = Number(totalMinutes);
  if (!Number.isFinite(m)) return "08:00";
  const h24 = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeInputToMinutes(value) {
  const [h, min] = String(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function QueueCard({ title, items, empty, render }) {
  const list = items || [];
  return (
    <div className="flex max-h-80 flex-col rounded-xl border border-slate-100 bg-slate-50/30">
      <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">{title}</p>
      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {list.length === 0 && <p className="text-slate-400">{empty}</p>}
        {list.map((j) => (
          <div key={j.id} className="border-b border-slate-100/80 py-2 last:border-0">
            {render(j)}
          </div>
        ))}
      </div>
    </div>
  );
}
