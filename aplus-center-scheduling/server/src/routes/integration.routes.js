import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  connectQuickbooks,
  disconnectQuickbooks,
  testQuickbooksConnection,
  getAuthUrl,
  exchangeCodeForTokens
} from "../services/integrations/quickbooks/quickbooksService.js";
import {
  connectPaymentHub,
  disconnectPaymentHub,
  testPaymentHubConnection
} from "../services/integrations/payment-hub/paymentHubService.js";
import {
  connectGoogleWorkspace,
  disconnectGoogleWorkspace,
  sendGoogleWorkspaceTestEmail,
  testGoogleWorkspaceConnection
} from "../services/integrations/google-workspace/googleWorkspaceService.js";
import {
  connectVoipms,
  disconnectVoipms,
  testVoipmsIntegrationConnection
} from "../services/integrations/voipmsIntegrationService.js";
import { getVoipmsWebhookCallbackHints } from "../services/integrations/voipmsService.js";
import { writeAuditLog } from "../services/auditLogService.js";

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────── */
/* Public OAuth callback — Intuit redirects here after user authorises the app */
/* Must be registered as the redirect_uri in the Intuit Developer Portal.      */
/* ─────────────────────────────────────────────────────────────────────────── */

router.get("/quickbooks/callback", async (req, res) => {
  const { code, realmId, error: oauthError, error_description } = req.query;
  if (oauthError) {
    console.error("[qb-callback] OAuth error:", oauthError, error_description);
    return res.redirect(`/aplus/settings?tab=integrations&qb=error&msg=${encodeURIComponent(error_description || oauthError)}`);
  }
  if (!code || !realmId) {
    return res.redirect("/aplus/settings?tab=integrations&qb=error&msg=missing_code");
  }
  try {
    await exchangeCodeForTokens({ code, realmId });
    return res.redirect("/aplus/settings?tab=integrations&qb=connected");
  } catch (err) {
    console.error("[qb-callback] Token exchange failed:", err?.message);
    return res.redirect(`/aplus/settings?tab=integrations&qb=error&msg=${encodeURIComponent(err?.message || "Token exchange failed")}`);
  }
});

router.use(requireAuth);

// Returns the Intuit OAuth authorization URL — frontend opens it to start QB connect
router.get("/quickbooks/auth-url", requireRole("ADMIN"), (_req, res) => {
  try {
    const url = getAuthUrl();
    return res.json({ url });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "Could not build QuickBooks auth URL" });
  }
});

router.get("/", async (_req, res) => {
  const accounts = await prisma.integrationAccount.findMany({
    orderBy: { provider: "asc" },
    select: {
      id: true,
      provider: true,
      isEnabled: true,
      environment: true,
      realmId: true,
      companyName: true,
      metadataJson: true,
      lastSyncAt: true,
      syncStatus: true,
      syncError: true,
      createdAt: true,
      updatedAt: true
    }
  });
  return res.json(accounts);
});

router.get("/sync-logs", requireRole("ADMIN"), async (req, res) => {
  const provider = req.query.provider ? String(req.query.provider) : undefined;
  const logs = await prisma.integrationSyncLog.findMany({
    where: { provider },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(req.query.limit || 100), 300)
  });
  return res.json(logs);
});

router.post("/quickbooks/connect", requireRole("ADMIN"), async (req, res) => {
  const account = await connectQuickbooks(req.body || {});
  await writeAuditLog(req, {
    action: "INTEGRATION_CONNECTED",
    entityType: "IntegrationAccount",
    entityId: account.id,
    detailsJson: { provider: "QUICKBOOKS" }
  });
  return res.json(account);
});

router.post("/quickbooks/disconnect", requireRole("ADMIN"), async (req, res) => {
  const account = await disconnectQuickbooks();
  await writeAuditLog(req, {
    action: "INTEGRATION_DISCONNECTED",
    entityType: "IntegrationAccount",
    entityId: account.id,
    detailsJson: { provider: "QUICKBOOKS" }
  });
  return res.json(account);
});

router.post("/quickbooks/test", requireRole("ADMIN"), async (_req, res) => {
  try {
    return res.json(await testQuickbooksConnection());
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "QuickBooks test failed" });
  }
});

router.post("/quickbooks/sync-now", requireRole("ADMIN"), async (_req, res) => {
  const account = await prisma.integrationAccount.findUnique({ where: { provider: "QUICKBOOKS" } });
  if (!account?.isEnabled) return res.status(400).json({ error: "QuickBooks is not connected" });
  const updated = await prisma.integrationAccount.update({
    where: { provider: "QUICKBOOKS" },
    data: { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null }
  });
  await writeAuditLog(_req, {
    action: "QUICKBOOKS_SYNC_TRIGGERED",
    entityType: "IntegrationAccount",
    entityId: updated.id
  });
  return res.json(updated);
});

router.post("/payment-hub/connect", requireRole("ADMIN"), async (req, res) => {
  const account = await connectPaymentHub(req.body || {});
  await writeAuditLog(req, {
    action: "INTEGRATION_CONNECTED",
    entityType: "IntegrationAccount",
    entityId: account.id,
    detailsJson: { provider: "PAYMENT_HUB" }
  });
  return res.json(account);
});

router.post("/payment-hub/disconnect", requireRole("ADMIN"), async (req, res) => {
  const account = await disconnectPaymentHub();
  await writeAuditLog(req, {
    action: "INTEGRATION_DISCONNECTED",
    entityType: "IntegrationAccount",
    entityId: account.id,
    detailsJson: { provider: "PAYMENT_HUB" }
  });
  return res.json(account);
});

router.post("/payment-hub/test", requireRole("ADMIN"), async (_req, res) => {
  try {
    return res.json(await testPaymentHubConnection());
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Payment Hub test failed" });
  }
});

router.post("/payment-hub/sync-now", requireRole("ADMIN"), async (req, res) => {
  const account = await prisma.integrationAccount.findUnique({ where: { provider: "PAYMENT_HUB" } });
  if (!account?.isEnabled) return res.status(400).json({ error: "Payment Hub is not connected" });
  const updated = await prisma.integrationAccount.update({
    where: { provider: "PAYMENT_HUB" },
    data: { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null }
  });
  await writeAuditLog(req, {
    action: "PAYMENT_HUB_SYNC_TRIGGERED",
    entityType: "IntegrationAccount",
    entityId: updated.id
  });
  return res.json(updated);
});

router.post("/google-workspace/connect", requireRole("ADMIN"), async (req, res) => {
  const account = await connectGoogleWorkspace(req.body || {});
  await writeAuditLog(req, {
    action: "INTEGRATION_CONNECTED",
    entityType: "IntegrationAccount",
    entityId: account.id,
    detailsJson: { provider: "GOOGLE_WORKSPACE" }
  });
  return res.json(account);
});

router.post("/google-workspace/disconnect", requireRole("ADMIN"), async (req, res) => {
  const account = await disconnectGoogleWorkspace();
  await writeAuditLog(req, {
    action: "INTEGRATION_DISCONNECTED",
    entityType: "IntegrationAccount",
    entityId: account.id,
    detailsJson: { provider: "GOOGLE_WORKSPACE" }
  });
  return res.json(account);
});

router.post("/google-workspace/test", requireRole("ADMIN"), async (req, res) => {
  try {
    return res.json(await testGoogleWorkspaceConnection(req.body || {}));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Google Workspace test failed" });
  }
});

router.post("/google-workspace/sync-now", requireRole("ADMIN"), async (req, res) => {
  const account = await prisma.integrationAccount.findUnique({ where: { provider: "GOOGLE_WORKSPACE" } });
  if (!account?.isEnabled) return res.status(400).json({ error: "Google Workspace is not connected" });
  const updated = await prisma.integrationAccount.update({
    where: { provider: "GOOGLE_WORKSPACE" },
    data: { lastSyncAt: new Date(), syncStatus: "SUCCESS", syncError: null }
  });
  await writeAuditLog(req, {
    action: "GOOGLE_WORKSPACE_SYNC_TRIGGERED",
    entityType: "IntegrationAccount",
    entityId: updated.id
  });
  return res.json(updated);
});

router.post("/google-workspace/send-test-email", requireRole("ADMIN"), async (req, res) => {
  try {
    const to = String(req.body?.to || "").trim();
    const result = await sendGoogleWorkspaceTestEmail({ to, payload: req.body || {} });
    await writeAuditLog(req, {
      action: "GOOGLE_WORKSPACE_TEST_EMAIL_SENT",
      entityType: "IntegrationAccount",
      entityId: "GOOGLE_WORKSPACE",
      detailsJson: { to }
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "Failed to send test email" });
  }
});

router.get("/voipms/callback-hints", requireRole("ADMIN"), async (_req, res) => {
  return res.json(await getVoipmsWebhookCallbackHints());
});

router.post("/voipms/connect", requireRole("ADMIN"), async (req, res) => {
  const account = await connectVoipms(req.body || {});
  await writeAuditLog(req, {
    action: "INTEGRATION_CONNECTED",
    entityType: "IntegrationAccount",
    entityId: account.id,
    detailsJson: { provider: "VOIPMS" }
  });
  return res.json(account);
});

router.post("/voipms/disconnect", requireRole("ADMIN"), async (req, res) => {
  const account = await disconnectVoipms();
  await writeAuditLog(req, {
    action: "INTEGRATION_DISCONNECTED",
    entityType: "IntegrationAccount",
    entityId: account?.id ?? "VOIPMS",
    detailsJson: { provider: "VOIPMS" }
  });
  return res.json(account ?? { ok: true, disconnected: true });
});

router.post("/voipms/test", requireRole("ADMIN"), async (_req, res) => {
  try {
    const r = await testVoipmsIntegrationConnection();
    if (!r.ok) return res.status(400).json({ error: r.message || "VoIP.ms test failed", ...r });
    return res.json(r);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || "VoIP.ms test failed" });
  }
});

export default router;
