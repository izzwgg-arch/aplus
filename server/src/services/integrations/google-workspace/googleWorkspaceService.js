import nodemailer from "nodemailer";
import { env } from "../../../config/env.js";
import {
  getDecryptedTokens,
  getIntegrationAccount,
  upsertIntegrationAccount,
  writeIntegrationSyncLog
} from "../integrationAccountService.js";

function buildOAuth2Transporter({ user, clientId, clientSecret, refreshToken, accessToken }) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user,
      clientId,
      clientSecret,
      refreshToken,
      accessToken
    }
  });
}

/** Google shows app passwords with spaces; SMTP requires the 16-char string without spaces. */
function normalizeAppPassword(value) {
  if (value == null || typeof value !== "string") return value;
  return value.replace(/\s+/g, "").trim();
}

function normalizeEmail(value) {
  if (value == null || typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

function ensureEmail(value, fieldName) {
  const email = normalizeEmail(value);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    const error = new Error(`${fieldName} is not a valid email`);
    error.status = 400;
    throw error;
  }
  return email;
}

function buildPasswordTransporters({ user, appPassword }) {
  const pass = normalizeAppPassword(appPassword);
  return [
    nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass }
    }),
    nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass }
    }),
    nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass }
    })
  ];
}

async function withTransportFallback(transporters, executor) {
  let lastError = null;
  for (const transporter of transporters) {
    try {
      return await executor(transporter);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError && /invalid login|username and password not accepted|535/i.test(String(lastError.message || ""))) {
    const wrapped = new Error(
      `${lastError.message}. If this user is an alias/group inbox, use the primary Google account login that created the app password.`
    );
    wrapped.status = lastError.status || 401;
    throw wrapped;
  }
  throw lastError || new Error("Google Workspace authentication failed");
}

function buildPasswordTransporter({ user, appPassword }) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass: normalizeAppPassword(appPassword) }
  });
}

async function buildTransportContext(payload = {}) {
  const account = await getIntegrationAccount("GOOGLE_WORKSPACE");
  if (!account?.isEnabled) {
    const error = new Error("Google Workspace is not connected");
    error.status = 400;
    throw error;
  }
  const tokens = getDecryptedTokens(account);
  const meta = account.metadataJson || {};
  const authType = meta.authType || "OAUTH2";
  const user = ensureEmail(payload.userEmail || meta.userEmail || env.emailUser, "Google Workspace user email");
  let transporter;
  let transporters = [];
  if (authType === "APP_PASSWORD") {
    transporters = buildPasswordTransporters({ user, appPassword: normalizeAppPassword(tokens.accessToken) });
    transporter = transporters[0];
  } else {
    transporter = buildOAuth2Transporter({
      user,
      clientId: payload.clientId || env.googleWorkspaceClientId,
      clientSecret: payload.clientSecret || env.googleWorkspaceClientSecret,
      refreshToken: tokens.refreshToken || payload.refreshToken,
      accessToken: tokens.accessToken || payload.accessToken
    });
    transporters = [transporter];
  }
  return {
    transporter,
    transporters,
    user,
    authType,
    fromEmail: normalizeEmail(meta.fromEmail) || user
  };
}

export async function connectGoogleWorkspace(payload) {
  const authType = payload.authType === "APP_PASSWORD" ? "APP_PASSWORD" : "OAUTH2";
  const userEmail = normalizeEmail(payload.userEmail);
  const fromEmail = normalizeEmail(payload.fromEmail) || userEmail;
  const metadataJson = {
    authType,
    userEmail,
    fromEmail,
    clientIdMasked: payload.clientId ? `${String(payload.clientId).slice(0, 6)}...` : null
  };
  return upsertIntegrationAccount("GOOGLE_WORKSPACE", {
    isEnabled: true,
    environment: payload.environment || "PRODUCTION",
    companyName: payload.workspaceDomain || null,
    accessToken: payload.appPassword != null ? normalizeAppPassword(String(payload.appPassword)) : (payload.accessToken != null ? normalizeAppPassword(String(payload.accessToken)) : null),
    refreshToken: payload.refreshToken || null,
    metadataJson,
    syncStatus: "SUCCESS",
    syncError: null,
    lastSyncAt: new Date()
  });
}

export async function disconnectGoogleWorkspace() {
  return upsertIntegrationAccount("GOOGLE_WORKSPACE", {
    isEnabled: false,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    metadataJson: null,
    syncStatus: "PENDING",
    syncError: null
  });
}

export async function testGoogleWorkspaceConnection(payload = {}) {
  try {
    const context = await buildTransportContext(payload);
    const { transporters, user, authType } = context;
    await withTransportFallback(transporters, async (transporter) => transporter.verify());
    await writeIntegrationSyncLog({
      provider: "GOOGLE_WORKSPACE",
      direction: "PULL",
      entityType: "Connection",
      status: "SUCCESS",
      message: "Google Workspace SMTP connection verified",
      payloadJson: { user, authType }
    });
    await upsertIntegrationAccount("GOOGLE_WORKSPACE", {
      lastSyncAt: new Date(),
      syncStatus: "SUCCESS",
      syncError: null
    });
    return { ok: true, user, authType };
  } catch (error) {
    await writeIntegrationSyncLog({
      provider: "GOOGLE_WORKSPACE",
      direction: "PULL",
      entityType: "Connection",
      status: "FAILED",
      message: "Google Workspace SMTP verify failed",
      payloadJson: { error: error.message || "Unknown error" }
    });
    await upsertIntegrationAccount("GOOGLE_WORKSPACE", {
      lastSyncAt: new Date(),
      syncStatus: "FAILED",
      syncError: error.message || "Google Workspace test failed"
    });
    throw error;
  }
}

export async function sendGoogleWorkspaceTestEmail({ to, payload = {} }) {
  const recipient = ensureEmail(to, "Recipient email");
  try {
    const context = await buildTransportContext(payload);
    const result = await withTransportFallback(context.transporters, async (transporter) =>
      transporter.sendMail({
      from: context.fromEmail,
      to: recipient,
      subject: "A+ Center Google Workspace integration test",
      html: "<p>This is a test email from your A+ Center integration settings.</p>"
      })
    );
    await writeIntegrationSyncLog({
      provider: "GOOGLE_WORKSPACE",
      direction: "PUSH",
      entityType: "Email",
      status: "SUCCESS",
      message: "Google Workspace test email sent",
      payloadJson: { to: recipient, user: context.user, messageId: result?.messageId || null, accepted: result?.accepted || [] }
    });
    await upsertIntegrationAccount("GOOGLE_WORKSPACE", {
      lastSyncAt: new Date(),
      syncStatus: "SUCCESS",
      syncError: null
    });
    return { ok: true, to: recipient, messageId: result?.messageId || null, accepted: result?.accepted || [] };
  } catch (error) {
    await writeIntegrationSyncLog({
      provider: "GOOGLE_WORKSPACE",
      direction: "PUSH",
      entityType: "Email",
      status: "FAILED",
      message: "Google Workspace test email failed",
      payloadJson: { to: recipient, error: error.message || "Unknown error" }
    });
    await upsertIntegrationAccount("GOOGLE_WORKSPACE", {
      lastSyncAt: new Date(),
      syncStatus: "FAILED",
      syncError: error.message || "Test email failed"
    });
    throw error;
  }
}
