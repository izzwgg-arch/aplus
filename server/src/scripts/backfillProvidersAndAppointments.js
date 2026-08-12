import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function splitName(fullName) {
  const value = String(fullName || "").trim();
  if (!value) return { firstName: "Unknown", lastName: "Provider", fullName: "Unknown Provider" };
  const parts = value.split(/\s+/);
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "Provider",
    fullName: value
  };
}

async function main() {
  const providerMap = new Map();
  let providersCreated = 0;
  let appointmentsBackfilled = 0;

  const bcbaUsers = await prisma.user.findMany({
    where: { role: "BCBA" },
    select: { id: true, email: true, fullName: true }
  });

  for (const user of bcbaUsers) {
    const names = splitName(user.fullName);
    const provider = await prisma.provider.create({
      data: {
        firstName: names.firstName,
        lastName: names.lastName,
        fullName: names.fullName,
        email: user.email || null,
        isActive: true
      }
    });
    providerMap.set(user.id, provider.id);
    providersCreated += 1;
  }

  const appointments = await prisma.appointment.findMany({
    where: { providerId: null },
    select: { id: true, bcbaId: true }
  });

  for (const appointment of appointments) {
    let providerId = appointment.bcbaId ? providerMap.get(appointment.bcbaId) : null;
    if (!providerId) {
      const fallback = await prisma.provider.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
      providerId = fallback?.id || null;
    }
    if (!providerId) continue;
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { providerId }
    });
    appointmentsBackfilled += 1;
  }

  // Persist a migration summary in audit logs for traceability.
  await prisma.auditLog.create({
    data: {
      action: "BACKFILL_PROVIDERS_AND_APPOINTMENTS",
      entityType: "System",
      detailsJson: {
        providersCreated,
        appointmentsBackfilled
      },
      metadata: {
        providersCreated,
        appointmentsBackfilled
      }
    }
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ providersCreated, appointmentsBackfilled }));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
