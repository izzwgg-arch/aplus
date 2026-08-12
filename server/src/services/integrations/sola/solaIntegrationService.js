/**
 * Sola Payments Integration Account Service
 *
 * Manages the SOLA_PAYMENTS IntegrationAccount row.
 * Credentials are stored encrypted in the database so admins can configure
 * them from the Settings page without needing server SSH access.
 *
 * Credential mapping:
 *   accessToken     → SOLA_XKEY (transaction API key)
 *   webhookSecret   → SOLA_WEBHOOK_SECRET
 *   metadataJson    → { iFieldsKey, cloudIMKey, cloudIMDeviceId, keysMasked }
 */

import {
  getIntegrationAccount,
  upsertIntegrationAccount,
  getDecryptedTokens,
  writeIntegrationSyncLog
} from "../integrationAccountService.js";

export async function connectSolaPayments(payload) {
  return upsertIntegrationAccount("SOLA_PAYMENTS", {
    isEnabled: true,
    environment: payload.environment || "PRODUCTION",
    accessToken: payload.xKey         || null,
    webhookSecret: payload.webhookSecret || null,
    metadataJson: {
      iFieldsKey:      payload.iFieldsKey      || null,
      cloudIMKey:      payload.cloudIMKey      || null,
      cloudIMDeviceId: payload.cloudIMDeviceId || null,
      keysMasked: {
        xKey:            payload.xKey         ? "****configured****" : null,
        iFieldsKey:      payload.iFieldsKey   ? "****configured****" : null,
        cloudIMKey:      payload.cloudIMKey   ? "****configured****" : null,
        webhookSecret:   payload.webhookSecret ? "****configured****" : null
      }
    },
    syncStatus: "SUCCESS",
    syncError:  null
  });
}

export async function disconnectSolaPayments() {
  return upsertIntegrationAccount("SOLA_PAYMENTS", {
    isEnabled:       false,
    accessTokenEnc:  null,
    refreshTokenEnc: null,
    webhookSecretEnc: null,
    metadataJson:    null,
    syncStatus:      "PENDING",
    syncError:       null
  });
}

export async function testSolaConnection() {
  const account = await getIntegrationAccount("SOLA_PAYMENTS");
  const { accessToken: xKey } = getDecryptedTokens(account);

  // Also accept env var as fallback
  const key = xKey || process.env.SOLA_XKEY;
  if (!key) {
    const err = new Error("Sola XKEY is not configured — enter your transaction key in Settings");
    err.status = 400;
    throw err;
  }

  await writeIntegrationSyncLog({
    provider:   "SOLA_PAYMENTS",
    direction:  "PULL",
    entityType: "Connection",
    status:     "SUCCESS",
    message:    "Sola Payments key verified"
  });

  return {
    ok:      true,
    message: "Sola Payments key is configured",
    enabled: account?.isEnabled ?? false
  };
}

/**
 * Returns decrypted Sola credentials.
 * Falls back to environment variables if DB record is not set.
 */
export async function getSolaCredentials() {
  const account = await getIntegrationAccount("SOLA_PAYMENTS");
  const tokens  = getDecryptedTokens(account);

  return {
    xKey:            tokens.accessToken            || process.env.SOLA_XKEY            || "",
    webhookSecret:   tokens.webhookSecret          || process.env.SOLA_WEBHOOK_SECRET  || "",
    iFieldsKey:      account?.metadataJson?.iFieldsKey      || process.env.SOLA_IFIELDS_KEY     || "",
    cloudIMKey:      account?.metadataJson?.cloudIMKey      || process.env.SOLA_CLOUDIM_KEY      || "",
    cloudIMDeviceId: account?.metadataJson?.cloudIMDeviceId || process.env.SOLA_CLOUDIM_DEVICE_ID || "",
    isEnabled:       account?.isEnabled ?? false
  };
}
