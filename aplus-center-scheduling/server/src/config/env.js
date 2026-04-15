import dotenv from "dotenv";

dotenv.config();

function stripTrailingSlash(u) {
  return String(u || "").replace(/\/$/, "");
}

function isLoopbackUrl(u) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(String(u || ""));
}

/**
 * Base URL VoIP.ms and other webhooks must call (HTTPS, your real domain).
 * Order: PUBLIC_WEBHOOK_BASE_URL → API_BASE_URL (if not localhost) → APP_BASE_URL (if not localhost) → API_BASE_URL → APP_BASE_URL.
 */
export function resolvePublicWebhookRootUrl() {
  const explicit = stripTrailingSlash(
    process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.WEBHOOK_PUBLIC_BASE_URL || ""
  );
  if (explicit) return explicit;

  const api = stripTrailingSlash(process.env.API_BASE_URL || "");
  if (api && !isLoopbackUrl(api)) return api;

  const app = stripTrailingSlash(process.env.APP_BASE_URL || "");
  if (app && !isLoopbackUrl(app)) return app;

  if (api) return api;
  return app;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",
  resetTokenExpiresMin: Number(process.env.RESET_TOKEN_EXPIRES_MIN || 30),
  inviteTokenExpiresHours: Number(process.env.INVITE_TOKEN_EXPIRES_HOURS || 48),
  encryptionKey: process.env.ENCRYPTION_KEY || "replace-this-with-32-char-key____",
  emailHost: process.env.EMAIL_HOST,
  emailPort: Number(process.env.EMAIL_PORT || 587),
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM || "A+ Center <no-reply@aplus.local>",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:5173",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:4000",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  globalHourlyRate: Number(process.env.GLOBAL_HOURLY_RATE || 130),
  globalCancellationFeeEnabled: process.env.GLOBAL_CANCELLATION_FEE_ENABLED === "true",
  quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID || "",
  quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || "",
  quickbooksRedirectUri: process.env.QUICKBOOKS_REDIRECT_URI || "",
  quickbooksEnvironment: process.env.QUICKBOOKS_ENVIRONMENT || "SANDBOX",
  paymentHubBaseUrl: process.env.PAYMENT_HUB_BASE_URL || "",
  paymentHubWebhookSecret: process.env.PAYMENT_HUB_WEBHOOK_SECRET || "",
  paymentHubPublicKey: process.env.PAYMENT_HUB_PUBLIC_KEY || "",
  solaXKey: process.env.SOLA_XKEY || "",
  solaIFieldsKey: process.env.SOLA_IFIELDS_KEY || "",
  solaCloudIMKey: process.env.SOLA_CLOUDIM_KEY || "",
  solaCloudIMDeviceId: process.env.SOLA_CLOUDIM_DEVICE_ID || "",
  solaWebhookSecret: process.env.SOLA_WEBHOOK_SECRET || "",
  googleWorkspaceClientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID || "",
  googleWorkspaceClientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET || "",
  /** VoIP.ms SMS — prefer env; never expose to client */
  voipmsApiUser: process.env.VOIPMS_API_USER || "",
  voipmsApiPassword: process.env.VOIPMS_API_PASSWORD || "",
  voipmsWebhookSecret: process.env.VOIPMS_WEBHOOK_SECRET || ""
};
