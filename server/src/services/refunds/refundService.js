import { prisma } from "../../config/prisma.js";
import { createRefund } from "../payments/provider/paymentHubProviderService.js";
import { refreshPaymentAggregateStatus } from "../payments/paymentService.js";

export async function createPaymentRefund({ paymentId, amount, reason, notes }) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    const error = new Error("Payment not found");
    error.status = 404;
    throw error;
  }
  if (!["AUTHORIZED", "SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
    const error = new Error("Payment is not refundable");
    error.status = 400;
    throw error;
  }
  const remaining = Math.max(0, Number(payment.amount) - Number(payment.refundedAmount || 0));
  if (amount <= 0) {
    const error = new Error("Refund amount must be greater than zero");
    error.status = 400;
    throw error;
  }
  if (amount > remaining) {
    const error = new Error("Refund amount exceeds remaining refundable amount");
    error.status = 400;
    throw error;
  }

  const external = await createRefund({
    paymentId: payment.externalPaymentId,
    amount,
    currency: payment.currency,
    reason: reason || undefined
  });
  const refund = await prisma.refund.create({
    data: {
      paymentId: payment.id,
      externalRefundId: String(external.id),
      amount: Number(external.amount ?? amount),
      currency: external.currency || payment.currency,
      status: String(external.status || "").toUpperCase() === "SUCCEEDED" ? "SUCCEEDED" : "PENDING",
      reason: reason || null,
      notes: notes || null,
      processorResponseJson: external
    }
  });

  await refreshPaymentAggregateStatus(payment.id);
  return refund;
}
