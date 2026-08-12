import { env, resolvePublicWebhookRootUrl } from "../../config/env.js";
import { formatVoipmsDestination } from "../reminders/phoneUtils.js";
import { logger } from "../../utils/logger.js";
import { getIntegrationAccount, getDecryptedTokens } from "./integrationAccountService.js";

const VOIPMS_REST = "https://voip.ms/api/v1/rest.php";

export async function resolveVoipmsApiCredentials() {
  const account = await getIntegrationAccount("VOIPMS");
  if (account?.isEnabled && account.accessTokenEnc) {
    const { accessToken: pass } = getDecryptedTokens(account);
    const apiUser = String(account.metadataJson?.apiUser || "").trim();
    if (apiUser && pass) return { user: apiUser, pass, source: "integration" };
  }
  const user = env.voipmsApiUser;
  const pass = env.voipmsApiPassword;
  if (user && pass) return { user, pass, source: "env" };
  return { user: "", pass: "", source: "none" };
}

export async function resolveVoipmsWebhookSecret() {
  const account = await getIntegrationAccount("VOIPMS");
  if (account?.isEnabled && account.webhookSecretEnc) {
    const { webhookSecret } = getDecryptedTokens(account);
    if (webhookSecret) return webhookSecret;
  }
  return env.voipmsWebhookSecret || "";
}

/**
 * Single VoIP.ms DID SMS webhook URL for admin UI (HTTPS + your domain, VoIP.ms placeholders).
 * If a webhook secret is configured, it is appended as `token=` (required by our server when a secret is set).
 * If none is set, the URL has no secret (matches servers that allow open webhooks until you add a secret).
 */
export async function getVoipmsWebhookCallbackHints() {
  const base = resolvePublicWebhookRootUrl();
  const wh = await resolveVoipmsWebhookSecret();
  const b = String(base || "").replace(/\/$/, "");
  // API_BASE_URL may already include /api (e.g. https://site.com/api) — avoid /api/api/...
  const path = /\/api$/i.test(b) ? "/webhooks/voipms/sms" : "/api/webhooks/voipms/sms";
  const root = b ? `${b}${path}` : "";
  const voipQs = "from={FROM}&to={TO}&message={MESSAGE}&id={ID}&date={DATE}";
  let webhookUrl = "";
  if (root) {
    webhookUrl = wh
      ? `${root}?token=${encodeURIComponent(wh)}&${voipQs}`
      : `${root}?${voipQs}`;
  }
  return {
    publicBaseUrl: base || null,
    webhookUrl,
    webhookSecretConfigured: Boolean(wh),
    apiBaseUrl: base || null,
    callbackWithToken: webhookUrl,
    callbackWithApiKey: ""
  };
}

async function voipmsCall(params) {
  const { user, pass } = await resolveVoipmsApiCredentials();
  if (!user || !pass) {
    const err = new Error(
      "VoIP.ms API credentials not configured. Add them under Settings → Integrations → VoIP.ms (or set VOIPMS_API_USER / VOIPMS_API_PASSWORD on the server)."
    );
    err.code = "VOIPMS_NO_CREDS";
    throw err;
  }
  const search = new URLSearchParams({
    api_username: user,
    api_password: pass,
    ...params
  });
  const url = `${VOIPMS_REST}?${search.toString()}`;
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    logger.warn("[voipms] Non-JSON response", { snippet: text.slice(0, 200) });
    const err = new Error("VoIP.ms returned non-JSON");
    err.raw = text;
    throw err;
  }
  return data;
}

/**
 * Send SMS via VoIP.ms REST API (GET sendSMS).
 * @returns {{ ok: boolean, messageId?: string, error?: string, raw?: unknown }}
 */
export async function sendVoipmsSms({ did, dst, message }) {
  const ten = formatVoipmsDestination(dst);
  if (!ten) {
    return { ok: false, error: "Invalid destination phone (need 10-digit US/CA)" };
  }
  const trimmed = String(message || "").slice(0, 1600);
  const data = await voipmsCall({
    method: "sendSMS",
    did: String(did).replace(/\D/g, ""),
    dst: ten,
    message: trimmed
  });
  if (data?.status === "success") {
    return {
      ok: true,
      messageId: data.sms != null ? String(data.sms) : data.message_id != null ? String(data.message_id) : undefined,
      raw: data
    };
  }
  return {
    ok: false,
    error: data?.message || data?.error || "VoIP.ms send failed",
    raw: data
  };
}

/** Lightweight connectivity check (lists DIDs). */
export async function testVoipmsConnection() {
  try {
    const data = await voipmsCall({ method: "getBalance" });
    if (data?.status === "success") {
      return { ok: true, message: "API credentials accepted", raw: data };
    }
    return { ok: false, message: data?.message || "Unexpected response", raw: data };
  } catch (e) {
    return { ok: false, message: e.message || "Connection failed", code: e.code };
  }
}
