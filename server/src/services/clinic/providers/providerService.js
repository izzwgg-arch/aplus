import { prisma } from "../../../config/prisma.js";

export async function listProviders({ search, status }) {
  const where = {
    isActive: status === "active" ? true : status === "inactive" ? false : undefined,
    OR: search ? [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { credential: { contains: search, mode: "insensitive" } }
    ] : undefined
  };
  return prisma.provider.findMany({
    where,
    include: {
      communicationPreference: true,
      _count: { select: { appointments: true, serviceLinks: true } },
      serviceLinks: { include: { service: true }, orderBy: { createdAt: "desc" } }
    },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }]
  });
}

export async function getProviderById(id) {
  return prisma.provider.findUnique({
    where: { id },
    include: {
      communicationPreference: true,
      _count: { select: { appointments: true, serviceLinks: true } },
      serviceLinks: { include: { service: true }, orderBy: { createdAt: "desc" } },
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 25,
        include: { client: true, service: true }
      }
    }
  });
}

export async function createProvider(data) {
  return prisma.provider.create({ data });
}

export async function updateProvider(id, data) {
  return prisma.provider.update({ where: { id }, data });
}

export async function setProviderActive(id, isActive) {
  return prisma.provider.update({ where: { id }, data: { isActive } });
}

export async function replaceProviderServices(providerId, links = []) {
  await prisma.serviceProvider.deleteMany({ where: { providerId } });
  if (!links.length) return [];
  await prisma.serviceProvider.createMany({
    data: links.map((item) => ({
      providerId,
      serviceId: item.serviceId,
      isEnabled: item.isEnabled !== false,
      customRate: item.customRate ?? null,
      customOvertimeRate: item.customOvertimeRate ?? null
    }))
  });
  return prisma.serviceProvider.findMany({ where: { providerId }, include: { service: true } });
}
