import { prisma } from "../config/prisma.js";

export async function writeAuditLog(req, payload) {
  const actor = req?.user || null;
  await prisma.auditLog.create({
    data: {
      userId: actor?.sub || null,
      action: payload.action,
      entityType: payload.entityType || payload.targetType || null,
      entityId: payload.entityId || payload.targetId || null,
      detailsJson: payload.detailsJson || payload.metadata || null,
      targetType: payload.targetType || null,
      targetId: payload.targetId || null,
      actorId: actor?.sub || null,
      actorEmail: actor?.email || null,
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.["user-agent"] || null,
      metadata: payload.metadata || null
    }
  });
}
