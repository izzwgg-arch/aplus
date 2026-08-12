import { prisma } from "../../config/prisma.js";

export async function getOrCreateReminderGlobalSettings() {
  let row = await prisma.reminderGlobalSettings.findUnique({ where: { id: 1 } });
  if (!row) {
    row = await prisma.reminderGlobalSettings.create({
      data: { id: 1, updatedAt: new Date() }
    });
  }
  return row;
}

export async function updateReminderGlobalSettings(data) {
  await getOrCreateReminderGlobalSettings();
  const allowed = [
    "remindersEnabledGlobal",
    "emailEnabledByDefault",
    "smsEnabledByDefault",
    "smsProviderEnabled",
    "voipmsDid",
    "defaultReminderProviderId",
    "remindClientByDefault",
    "remindProviderByDefault",
    "timezone",
    "sendWindowStartMinutes",
    "sendWindowEndMinutes",
    "defaultOffsetsJson",
    "retryEnabled",
    "maxRetries",
    "retryDelayMinutes",
    "lastSmsTestAt",
    "lastSmsTestResult",
    "lastSmsTestOk"
  ];
  const patch = {};
  for (const k of allowed) {
    if (data[k] !== undefined) patch[k] = data[k];
  }
  if (Object.prototype.hasOwnProperty.call(patch, "defaultReminderProviderId")) {
    const v = patch.defaultReminderProviderId;
    patch.defaultReminderProviderId =
      typeof v === "string" && v.trim() ? v.trim() : null;
  }
  return prisma.reminderGlobalSettings.update({
    where: { id: 1 },
    data: patch
  });
}
