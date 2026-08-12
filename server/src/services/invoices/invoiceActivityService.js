import { prisma } from "../../config/prisma.js";

/**
 * Append a structured activity event to an invoice's timeline.
 *
 * type values:
 *   CREATED | SENT | PAYMENT_LINK_GENERATED | PAYMENT_RECEIVED | MANUAL_PAYMENT
 *   CARD_PAYMENT | QB_SYNCED | QB_FAILED | RECEIPT_SENT | VOIDED | DUPLICATED | NOTE
 */
export async function logActivity({ invoiceId, type, message, actorType = "SYSTEM", actorId = null, metadata = null }) {
  if (!invoiceId) return;
  try {
    return await prisma.invoiceActivity.create({
      data: { invoiceId, type, message, actorType, actorId, metadata }
    });
  } catch (err) {
    // Never let activity logging crash the main flow
    console.error("[activity] Failed to log", type, err?.message);
  }
}

export async function getActivities(invoiceId) {
  return prisma.invoiceActivity.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" }
  });
}
