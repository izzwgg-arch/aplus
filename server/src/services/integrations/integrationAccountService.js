import { prisma } from "../../config/prisma.js";
import { encryptText, decryptText } from "../../utils/crypto.js";

export async function getIntegrationAccount(provider) {
  return prisma.integrationAccount.findUnique({ where: { provider } });
}

export async function upsertIntegrationAccount(provider, data) {
  const existing = await getIntegrationAccount(provider);
  const payload = {
    ...data,
    accessTokenEnc: data.accessToken ? encryptText(data.accessToken) : data.accessTokenEnc,
    refreshTokenEnc: data.refreshToken ? encryptText(data.refreshToken) : data.refreshTokenEnc,
    webhookSecretEnc: data.webhookSecret ? encryptText(data.webhookSecret) : data.webhookSecretEnc
  };
  delete payload.accessToken;
  delete payload.refreshToken;
  delete payload.webhookSecret;
  if (!existing) {
    return prisma.integrationAccount.create({ data: { provider, ...payload } });
  }
  return prisma.integrationAccount.update({
    where: { provider },
    data: payload
  });
}

export function getDecryptedTokens(account) {
  return {
    accessToken: account?.accessTokenEnc ? decryptText(account.accessTokenEnc) : null,
    refreshToken: account?.refreshTokenEnc ? decryptText(account.refreshTokenEnc) : null,
    webhookSecret: account?.webhookSecretEnc ? decryptText(account.webhookSecretEnc) : null
  };
}

export async function writeIntegrationSyncLog(payload) {
  return prisma.integrationSyncLog.create({
    data: {
      provider: payload.provider,
      direction: payload.direction,
      entityType: payload.entityType,
      entityId: payload.entityId || null,
      status: payload.status,
      message: payload.message,
      payloadJson: payload.payloadJson || null
    }
  });
}
