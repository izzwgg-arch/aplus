import { prisma } from "../../config/prisma.js";
import { encryptText } from "../../utils/crypto.js";
import { getIntegrationAccount } from "./integrationAccountService.js";
import { testVoipmsConnection } from "./voipmsService.js";

export async function connectVoipms(payload) {
  const apiUser = String(payload?.apiUser || "").trim();
  const apiPassword = String(payload?.apiPassword || "").trim();
  const hasWebhookKey = Object.prototype.hasOwnProperty.call(payload || {}, "webhookSecret");

  if (!apiUser || !apiPassword) {
    const e = new Error("VoIP.ms API email and API password are required");
    e.status = 400;
    throw e;
  }

  const existing = await getIntegrationAccount("VOIPMS");
  const whRaw = hasWebhookKey ? payload.webhookSecret : undefined;
  const webhookSecretEnc = !hasWebhookKey
    ? existing?.webhookSecretEnc ?? null
    : String(whRaw || "").trim()
      ? encryptText(String(whRaw).trim())
      : null;

  return prisma.integrationAccount.upsert({
    where: { provider: "VOIPMS" },
    create: {
      provider: "VOIPMS",
      isEnabled: true,
      environment: "PRODUCTION",
      accessTokenEnc: encryptText(apiPassword),
      webhookSecretEnc,
      metadataJson: {
        apiUser,
        apiPasswordMasked: "****configured****",
        webhookSecretMasked: webhookSecretEnc ? "****configured****" : null
      },
      syncStatus: "SUCCESS",
      syncError: null
    },
    update: {
      isEnabled: true,
      accessTokenEnc: encryptText(apiPassword),
      webhookSecretEnc,
      metadataJson: {
        apiUser,
        apiPasswordMasked: "****configured****",
        webhookSecretMasked: webhookSecretEnc ? "****configured****" : null
      },
      syncStatus: "SUCCESS",
      syncError: null
    }
  });
}

export async function disconnectVoipms() {
  const row = await prisma.integrationAccount.findUnique({ where: { provider: "VOIPMS" } });
  if (!row) return row;
  return prisma.integrationAccount.update({
    where: { provider: "VOIPMS" },
    data: {
      isEnabled: false,
      accessTokenEnc: null,
      webhookSecretEnc: null,
      refreshTokenEnc: null,
      metadataJson: null,
      syncStatus: "PENDING",
      syncError: null
    }
  });
}

export async function testVoipmsIntegrationConnection() {
  const account = await getIntegrationAccount("VOIPMS");
  if (!account?.isEnabled) {
    const e = new Error("VoIP.ms is not connected");
    e.status = 400;
    throw e;
  }
  return testVoipmsConnection();
}
