import { prisma } from "../../config/prisma.js";

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export async function recalculateInvoiceBalance(invoiceId) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: { include: { refunds: true } } }
  });
  if (!invoice) return null;
  const paid = round2(invoice.payments
    .filter((payment) => ["AUTHORIZED", "SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status))
    .reduce((sum, payment) => sum + (payment.amount - (payment.refundedAmount || 0)), 0));
  const balanceDue = round2(Math.max(0, invoice.total - paid));
  let status = invoice.status;
  if (balanceDue <= 0) {
    status = "PAID";
  } else if (paid > 0) {
    status = "PARTIAL";
  } else if (invoice.status !== "VOID") {
    status = "OPEN";
  }
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      balanceDue,
      status,
      paidAt: status === "PAID" ? new Date() : null
    }
  });
}

export async function refreshPaymentAggregateStatus(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: true }
  });
  if (!payment) return null;
  const succeededRefunded = round2(payment.refunds
    .filter((refund) => refund.status === "SUCCEEDED")
    .reduce((sum, refund) => sum + refund.amount, 0));
  let status = payment.status;
  if (succeededRefunded <= 0 && payment.status === "SUCCEEDED") {
    status = "SUCCEEDED";
  } else if (succeededRefunded > 0 && succeededRefunded < payment.amount) {
    status = "PARTIALLY_REFUNDED";
  } else if (succeededRefunded >= payment.amount) {
    status = "REFUNDED";
  }
  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { refundedAmount: succeededRefunded, status }
  });
  if (updated.invoiceId) {
    await recalculateInvoiceBalance(updated.invoiceId);
  }
  return updated;
}
