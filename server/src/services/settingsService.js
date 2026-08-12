import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

export async function getOrCreateClinicSettings() {
  const existing = await prisma.clinicSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.clinicSetting.create({
    data: {
      id: 1,
      defaultHourlyRate: env.globalHourlyRate,
      defaultCancellationFeeEnabled: env.globalCancellationFeeEnabled
    }
  });
}
