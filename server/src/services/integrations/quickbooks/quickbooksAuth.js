/**
 * QuickBooks OAuth / app credentials (Intuit platform).
 * Shared by quickbooksApiClient and quickbooksService.
 */

import { prisma } from "../../../config/prisma.js";
import { env } from "../../../config/env.js";

export const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QB_API_SANDBOX = "https://sandbox-quickbooks.api.intuit.com/v3/company";
export const QB_API_PROD = "https://quickbooks.api.intuit.com/v3/company";

export function apiBase(environment) {
  return (environment || "").toUpperCase() === "PRODUCTION" ? QB_API_PROD : QB_API_SANDBOX;
}

export async function getQBAppCredentials() {
  let clientId = env.quickbooksClientId;
  let clientSecret = env.quickbooksClientSecret;
  let redirectUri = env.quickbooksRedirectUri;
  let environment = env.quickbooksEnvironment || "SANDBOX";

  if (!clientId || !clientSecret) {
    try {
      const account = await prisma.integrationAccount.findUnique({
        where: { provider: "QUICKBOOKS" },
        select: { metadataJson: true, environment: true }
      });
      const meta = account?.metadataJson || {};
      if (meta.clientId) clientId = meta.clientId;
      if (meta.clientSecret) clientSecret = meta.clientSecret;
      if (meta.redirectUri) redirectUri = meta.redirectUri;
      if (account?.environment) environment = account.environment;
    } catch {}
  }

  return { clientId, clientSecret, redirectUri, environment };
}

export async function basicAuthHeader() {
  const { clientId, clientSecret } = await getQBAppCredentials();
  if (!clientId || !clientSecret) {
    const err = new Error("QuickBooks Client ID and Secret are not configured.");
    err.status = 500;
    throw err;
  }
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function refreshAccessToken(refreshToken) {
  const response = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: await basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Failed to refresh QuickBooks access token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 3600
  };
}
