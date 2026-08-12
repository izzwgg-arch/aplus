import { prisma } from "../../../config/prisma.js";

export async function listServices({ search, status }) {
  const where = {
    isActive: status === "active" ? true : status === "inactive" ? false : undefined,
    OR: search ? [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } }
    ] : undefined
  };

  return prisma.service.findMany({
    where,
    include: { _count: { select: { appointments: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }]
  });
}

export async function getServiceById(id) {
  return prisma.service.findUnique({
    where: { id },
    include: { _count: { select: { appointments: true, providerLinks: true } }, providerLinks: true }
  });
}

export async function createService(data) {
  return prisma.service.create({
    data
  });
}

export async function updateService(id, data) {
  return prisma.service.update({
    where: { id },
    data
  });
}

export async function setServiceActive(id, isActive) {
  return prisma.service.update({
    where: { id },
    data: { isActive }
  });
}
