import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";

async function main() {
  const adminEmail = "admin@apluscenter.local";
  const exists = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!exists) {
    const hash = await bcrypt.hash("ChangeMe123!", 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: "A+ Admin",
        role: "ADMIN",
        passwordHash: hash
      }
    });
  }

  const settings = await prisma.clinicSetting.findUnique({ where: { id: 1 } });
  if (!settings) {
    await prisma.clinicSetting.create({
      data: {
        id: 1,
        defaultHourlyRate: env.globalHourlyRate,
        defaultCancellationFeeEnabled: env.globalCancellationFeeEnabled
      }
    });
  }
}

main().finally(() => prisma.$disconnect());
