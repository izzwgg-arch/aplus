/**
 * Centralized QuickBooks Online accounting API client.
 * All QBO REST calls MUST go through qbAccountingApiRequest — enforced via code review / single import site.
 *
 * Features: mandatory feature labels, audit logging, short-window dedupe, GET caching,
 * rate limits per tenant (realmId), controlled retries (401/429/network), QB_SAFE_MODE.
 */

import { prisma } from "../../../config/prisma.js";
import { env } from "../../../config/env.js";
import { logger } from "../../../utils/logger.js";
import {
  getIntegrationAccount,
  getDecryptedTokens,
  upsertIntegrationAccount
} from "../integrationAccountService.js";
import { apiBase, refreshAccessToken } from "./quickbooksAuth.js";

/** @typedef {"user"|"background"|"retry"} QbTriggerType */

export const QB_FEATURES = new Set([
  "connection_test",
  "companyinfo_read",
  "oauth_companyinfo",
  "customer_query",
  "customer_create",
  "invoice_read",
  "invoice_create",
  "invoice_update",
  "payment_create"
]);

const SAFE_MODE_FEATURES = new Set([
  "invoice_read",
  "invoice_create",
  "invoice_update",
  "payment_create",
  "customer_query",
  "customer_create",
  "oauth_companyinfo"
]);

const minuteCalls = new Map();
const hourCalls = new Map();
const getCache = new Map();
const shortDupOk = new Map();
const inFlight = new Map();

function tenantKey(account, explicitTenantId) {
  return (
    explicitTenantId
    || account?.realmId
    || env.qbTenantIdFallback
    || "default"
  );
}

function stableStringify(value) {
  if (value === undefined) return "undef";
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",")}}`;
}

function requestDedupeKey(tenantId, method, path, body) {
  return `${tenantId}|${method}|${path}|${body === undefined ? "" : stableStringify(body)}`;
}

function pruneTimestamps(arr, windowMs, nowMs) {
  while (arr.length && arr[0] < nowMs - windowMs) arr.shift();
  return arr;
}

function assertRateLimit(tenantId) {
  const maxMin = env.qbMaxCallsPerMinute;
  const maxHr = env.qbMaxCallsPerHour;
  const nowMs = Date.now();
  if (!minuteCalls.has(tenantId)) minuteCalls.set(tenantId, []);
  if (!hourCalls.has(tenantId)) hourCalls.set(tenantId, []);
  const m = minuteCalls.get(tenantId);
  const h = hourCalls.get(tenantId);
  pruneTimestamps(m, 60_000, nowMs);
  pruneTimestamps(h, 3_600_000, nowMs);
  if (m.length >= maxMin) {
    logger.warn("QuickBooks rate limit (per minute)", { tenantId, maxMin });
    const err = new Error(`QuickBooks rate limit: max ${maxMin} calls per minute for this company.`);
    err.status = 429;
    err.qbBlocked = "rate_limit_minute";
    throw err;
  }
  if (h.length >= maxHr) {
    logger.warn("QuickBooks rate limit (per hour)", { tenantId, maxHr });
    const err = new Error(`QuickBooks rate limit: max ${maxHr} calls per hour for this company.`);
    err.status = 429;
    err.qbBlocked = "rate_limit_hour";
    throw err;
  }
}

function recordRateLimitHit(tenantId) {
  const nowMs = Date.now();
  if (!minuteCalls.has(tenantId)) minuteCalls.set(tenantId, []);
  if (!hourCalls.has(tenantId)) hourCalls.set(tenantId, []);
  minuteCalls.get(tenantId).push(nowMs);
  hourCalls.get(tenantId).push(nowMs);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(response) {
  const ra = response.headers?.get?.("Retry-After");
  if (!ra) return null;
  const n = Number(ra);
  if (!Number.isNaN(n) && n > 0) return Math.min(n * 1000, 120_000);
  return null;
}

async function writeAuditRow(row) {
  try {
    await prisma.quickBooksApiCallLog.create({ data: row });
  } catch (e) {
    logger.error("QuickBooks audit log insert failed", { error: e.message });
  }
}

/**
 * @param {object} opts
 * @param {string} opts.path - Relative to company base, e.g. `/invoice/1?minorversion=65`
 * @param {string} [opts.method]
 * @param {object} [opts.body]
 * @param {object} [opts.account] - Integration account row (QUICKBOOKS); optional if tokenOverride set
 * @param {string} opts.feature - Required label (see QB_FEATURES)
 * @param {QbTriggerType} [opts.triggerType]
 * @param {string|null} [opts.userId]
 * @param {string} [opts.tenantId] - Override tenant id (realm)
 * @param {string|null} [opts.tokenOverride] - Bearer for one-shot calls (e.g. post-OAuth companyinfo)
 * @param {string} [opts.realmId] - QBO realm when account row is incomplete (tokenOverride / early connect)
 * @param {boolean} [opts.bypassCache]
 * @param {boolean} [opts.bypassDedupe]
 */
export async function qbAccountingApiRequest(opts) {
  const {
    path,
    method = "GET",
    body,
    account: acctIn,
    feature,
    triggerType = "background",
    userId = null,
    tenantId: tenantIdOpt,
    realmId: realmIdOpt,
    tokenOverride = null,
    bypassCache = false,
    bypassDedupe = false
  } = opts;

  if (!feature || typeof feature !== "string") {
    const err = new Error("QuickBooks API call rejected: missing feature label.");
    err.status = 400;
    throw err;
  }
  if (!QB_FEATURES.has(feature)) {
    const err = new Error(`QuickBooks API call rejected: unknown feature "${feature}".`);
    err.status = 400;
    throw err;
  }

  const account = tokenOverride ? acctIn : (acctIn || await getIntegrationAccount("QUICKBOOKS"));
  const tenantId = tenantKey(account, tenantIdOpt);
  const dedupeKey = requestDedupeKey(tenantId, method, path, body);
  const t0 = Date.now();

  const finishLog = async (partial) => {
    await writeAuditRow({
      tenantId,
      userId,
      endpoint: path.split("?")[0],
      method,
      feature,
      triggerType,
      durationMs: Math.max(0, Date.now() - t0),
      statusCode: partial.statusCode ?? null,
      success: partial.success,
      retryCount: partial.retryCount ?? 0,
      errorMessage: partial.errorMessage ?? null,
      metadata: partial.metadata ?? null
    });
  };

  if (env.qbSafeMode && !SAFE_MODE_FEATURES.has(feature)) {
    await finishLog({
      success: false,
      statusCode: null,
      errorMessage: "Blocked by QB_SAFE_MODE",
      metadata: { blockedReason: "safe_mode" }
    });
    const err = new Error("QuickBooks call blocked: QB_SAFE_MODE allows only invoice and payment sync operations.");
    err.status = 403;
    err.qbBlocked = "safe_mode";
    throw err;
  }

  if (!bypassDedupe && shortDupOk.has(dedupeKey)) {
    const slot = shortDupOk.get(dedupeKey);
    if (Date.now() - slot.at < env.qbDedupeWindowMs) {
      await finishLog({
        success: true,
        statusCode: slot.statusCode,
        retryCount: 0,
        metadata: { cacheHit: true, blockedReason: "duplicate_short" }
      });
      return JSON.parse(JSON.stringify(slot.data));
    }
    shortDupOk.delete(dedupeKey);
  }

  if (method === "GET" && !tokenOverride && !bypassCache) {
    const ckey = `GET|${dedupeKey}`;
    const hit = getCache.get(ckey);
    if (hit && hit.expires > Date.now()) {
      await finishLog({
        success: true,
        statusCode: hit.statusCode,
        retryCount: 0,
        metadata: { cacheHit: true, cacheLayer: "ttl" }
      });
      return JSON.parse(JSON.stringify(hit.data));
    }
  }

  if (inFlight.has(dedupeKey)) {
    const waitStart = Date.now();
    try {
      const out = await inFlight.get(dedupeKey);
      await writeAuditRow({
        tenantId,
        userId,
        endpoint: path.split("?")[0],
        method,
        feature,
        triggerType,
        durationMs: Math.max(0, Date.now() - waitStart),
        statusCode: null,
        success: true,
        retryCount: 0,
        errorMessage: null,
        metadata: { mergedInflight: true }
      });
      return out;
    } catch (e) {
      await writeAuditRow({
        tenantId,
        userId,
        endpoint: path.split("?")[0],
        method,
        feature,
        triggerType,
        durationMs: Math.max(0, Date.now() - waitStart),
        statusCode: e.status ?? null,
        success: false,
        retryCount: 0,
        errorMessage: e.message || "inflight_failed",
        metadata: { mergedInflight: true }
      });
      throw e;
    }
  }

  let p = inFlight.get(dedupeKey);
  if (!p) {
    p = (async () => {
      let retryCount = 0;
      let lastErr = null;
      let authRetryDone = false;

      try {
        assertRateLimit(tenantId);
      } catch (e) {
        await finishLog({
          success: false,
          statusCode: e.status || null,
          errorMessage: e.message,
          metadata: { blockedReason: e.qbBlocked || "rate_limit" }
        });
        throw e;
      }

      if (!tokenOverride) {
        if (!account?.isEnabled || !account?.realmId) {
          const err = new Error("QuickBooks is not connected");
          err.status = 400;
          await finishLog({ success: false, errorMessage: err.message, retryCount });
          throw err;
        }
      }

      const execOnce = async (accessToken, acct) => {
        const base = apiBase(acct?.environment || "SANDBOX");
        const realm = realmIdOpt || acct?.realmId || tenantIdOpt;
        if (!realm) {
          const err = new Error("QuickBooks realmId is required for API request");
          err.status = 500;
          throw err;
        }
        const url = `${base}/${realm}${path}`;
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: body ? JSON.stringify(body) : undefined
        });
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
        return { response, data };
      };

    const ensureFreshAccess = async (acct) => {
      let working = acct;
      let { accessToken, refreshToken } = getDecryptedTokens(working);
      const expiresAt = working.tokenExpiresAt ? new Date(working.tokenExpiresAt) : null;
      const now = new Date();
      const needsRefresh = !expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
      if (needsRefresh && refreshToken) {
        const refreshed = await refreshAccessToken(refreshToken);
        accessToken = refreshed.accessToken;
        await upsertIntegrationAccount("QUICKBOOKS", {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || refreshToken,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000)
        });
        working = await getIntegrationAccount("QUICKBOOKS");
        ({ accessToken, refreshToken } = getDecryptedTokens(working));
      }
      if (!accessToken) {
        const err = new Error("QuickBooks access token is missing — please reconnect");
        err.status = 401;
        throw err;
      }
      return { accessToken, refreshToken, account: working };
    };

    let networkAttempt = 0;
    const maxNetworkRetries = 2;

    while (networkAttempt <= maxNetworkRetries) {
      try {
        let accessToken = tokenOverride;
        let acct = account;

        if (!tokenOverride) {
          const fresh = await ensureFreshAccess(await getIntegrationAccount("QUICKBOOKS"));
          accessToken = fresh.accessToken;
          acct = fresh.account;
        }

        let { response, data } = await execOnce(accessToken, acct);

        if (response.status === 401 && !tokenOverride) {
          const { refreshToken } = getDecryptedTokens(await getIntegrationAccount("QUICKBOOKS"));
          if (refreshToken && !authRetryDone) {
            authRetryDone = true;
            retryCount += 1;
            const refreshed = await refreshAccessToken(refreshToken);
            await upsertIntegrationAccount("QUICKBOOKS", {
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken || refreshToken,
              tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000)
            });
            acct = await getIntegrationAccount("QUICKBOOKS");
            ({ response, data } = await execOnce(refreshed.accessToken, acct));
          }
        }

        let attempt = 0;
        while (response.status === 429 && attempt < 2) {
          attempt += 1;
          retryCount += 1;
          const waitMs = parseRetryAfterMs(response) ?? Math.min(2000 * 2 ** attempt, 60_000);
          await sleep(waitMs);
          const fresh2 = await ensureFreshAccess(await getIntegrationAccount("QUICKBOOKS"));
          ({ response, data } = await execOnce(fresh2.accessToken, fresh2.account));
        }

        if (!response.ok) {
          const msg =
            data?.Fault?.Error?.[0]?.Detail
            || data?.Fault?.Error?.[0]?.Message
            || data?.error_description
            || `QuickBooks API error ${response.status}`;
          const err = new Error(msg);
          err.status = response.status;
          err.qbFault = data?.Fault;
          await finishLog({
            success: false,
            statusCode: response.status,
            errorMessage: msg,
            retryCount
          });
          throw err;
        }

        recordRateLimitHit(tenantId);

        if (method === "GET" && !tokenOverride && !bypassCache) {
          const ckey = `GET|${dedupeKey}`;
          getCache.set(ckey, {
            data,
            statusCode: response.status,
            expires: Date.now() + env.qbGetCacheTtlMs
          });
        }

        if (!bypassDedupe) {
          shortDupOk.set(dedupeKey, {
            at: Date.now(),
            data,
            statusCode: response.status
          });
        }

        await finishLog({
          success: true,
          statusCode: response.status,
          retryCount
        });

        return data;
      } catch (e) {
        lastErr = e;
        const isNetwork =
          e.name === "TypeError"
          || /fetch|network|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(String(e.message || ""));
        if (isNetwork && networkAttempt < maxNetworkRetries) {
          networkAttempt += 1;
          retryCount += 1;
          await sleep(500 * networkAttempt);
          continue;
        }
        if (!e.status && !e.qbFault) {
          await finishLog({
            success: false,
            errorMessage: e.message || "QuickBooks request failed",
            retryCount
          });
        }
        throw e;
      }
    }

    throw lastErr || new Error("QuickBooks request failed");
    })();
    inFlight.set(dedupeKey, p);
  }

  try {
    return await p;
  } finally {
    inFlight.delete(dedupeKey);
  }
}
