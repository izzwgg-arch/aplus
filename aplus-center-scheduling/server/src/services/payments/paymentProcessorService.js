import { prisma } from "../../config/prisma.js";
import { createCharge as phCreateCharge, getPayment as phGetPayment } from "./provider/paymentHubProviderService.js";
import { chargeWithToken, chargeCloudIM } from "./provider/solaPaymentsProviderService.js";
import { recalculateInvoiceBalance } from "./paymentService.js";

function mapExternalStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "AUTHORIZED") return "AUTHORIZED";
  if (normalized === "SUCCEEDED" || normalized === "SUCCESS") return "SUCCEEDED";
  if (normalized === "FAILED") return "FAILED";
  if (normalized === "CANCELED") return "CANCELED";
  return "PENDING";
}

/**
 * Create a charge via Sola Payments (card-not-present via iFields token).
 * Returns the created Payment record.
 */
async function createSolaCharge(payload) {
  const result = await chargeWithToken({
    xToken:        payload.xToken,
    amount:        payload.amount,
    invoiceNumber: payload.invoiceNumber || payload.invoiceId,
    clientEmail:   payload.billingEmail  || undefined,
    billingName:   payload.billingName   || undefined,
    billingZip:    payload.billingZip    || undefined,
    description:   payload.description  || undefined
  });

  if (!result.approved) {
    const err = new Error(result.xError || `Card declined: ${result.xStatus || "Unknown"}`);
    err.status = 402;
    err.solaResult = result;
    throw err;
  }

  const payment = await prisma.payment.create({
    data: {
      clientId:              payload.clientId   || null,
      invoiceId:             payload.invoiceId  || null,
      processor:             "SOLA_PAYMENTS",
      externalPaymentId:     result.xRefNum,
      solaXRefNum:           result.xRefNum,
      solaXToken:            result.xToken      || null,
      amount:                payload.amount,
      currency:              "USD",
      status:                "SUCCEEDED",
      capturedAt:            new Date(),
      paymentDate:           new Date(),
      description:           payload.description || null,
      processorResponseJson: result.raw,
      cardBrand:             result.xCardType   || null,
      cardLast4:             result.cardLast4   || null,
      cardExpMonth:          result.cardExpMonth || null,
      cardExpYear:           result.cardExpYear  || null,
      billingName:           payload.billingName || null,
      billingEmail:          payload.billingEmail || null,
      billingZip:            payload.billingZip  || null,
      paymentMethod:         result.xCardType   || "Card",
      paymentSourceType:     "CARD"
    }
  });

  if (payment.invoiceId) await recalculateInvoiceBalance(payment.invoiceId);

  // Store card-on-file token on the Client record for future charges
  if (result.xToken && payload.clientId) {
    await prisma.client.update({
      where: { id: payload.clientId },
      data:  { solaXToken: result.xToken }
    }).catch(() => {});
  }

  return payment;
}

/**
 * Create a card-present charge via CloudIM terminal.
 */
async function createSolaCloudIMCharge(payload) {
  const result = await chargeCloudIM({
    deviceId:      payload.deviceId,
    amount:        payload.amount,
    invoiceNumber: payload.invoiceNumber || payload.invoiceId,
    description:   payload.description  || undefined
  });

  if (!result.approved) {
    const err = new Error(result.xError || `Terminal declined: ${result.xStatus || "Unknown"}`);
    err.status = 402;
    err.solaResult = result;
    throw err;
  }

  const payment = await prisma.payment.create({
    data: {
      clientId:              payload.clientId   || null,
      invoiceId:             payload.invoiceId  || null,
      processor:             "SOLA_PAYMENTS",
      externalPaymentId:     result.xRefNum,
      solaXRefNum:           result.xRefNum,
      solaXToken:            result.xToken      || null,
      amount:                payload.amount,
      currency:              "USD",
      status:                "SUCCEEDED",
      capturedAt:            new Date(),
      paymentDate:           new Date(),
      description:           payload.description || null,
      processorResponseJson: result.raw,
      cardBrand:             result.xCardType   || null,
      cardLast4:             result.cardLast4   || null,
      cardExpMonth:          result.cardExpMonth || null,
      cardExpYear:           result.cardExpYear  || null,
      billingName:           payload.billingName || null,
      billingEmail:          payload.billingEmail || null,
      paymentMethod:         result.xCardType   || "Card",
      paymentSourceType:     "CARD_PRESENT"
    }
  });

  if (payment.invoiceId) await recalculateInvoiceBalance(payment.invoiceId);
  return payment;
}

/**
 * Legacy Payment Hub charge (kept for historical compatibility).
 */
async function createPaymentHubCharge(payload) {
  const external = await phCreateCharge({
    amount: payload.amount,
    currency: payload.currency,
    paymentMethodToken: payload.paymentMethodToken,
    customerId: payload.externalCustomerId || undefined,
    paymentMethodId: payload.externalPaymentMethodId || undefined,
    description: payload.description || undefined,
    metadata: {
      clientId: payload.clientId || undefined,
      invoiceId: payload.invoiceId || undefined
    },
    billing: {
      name: payload.billingName || undefined,
      email: payload.billingEmail || undefined,
      zip: payload.billingZip || undefined
    },
    capture: true
  });
  const status = mapExternalStatus(external.status);
  const payment = await prisma.payment.create({
    data: {
      clientId: payload.clientId || null,
      invoiceId: payload.invoiceId || null,
      processor: "PAYMENT_HUB",
      externalPaymentId: String(external.id),
      externalCustomerId: external.customerId || payload.externalCustomerId || null,
      externalPaymentMethodId: external.paymentMethodId || payload.externalPaymentMethodId || null,
      amount: Number(external.amount ?? payload.amount),
      currency: external.currency || payload.currency || "USD",
      status,
      capturedAt: external.capturedAt ? new Date(external.capturedAt) : null,
      paymentDate: external.createdAt ? new Date(external.createdAt) : new Date(),
      description: payload.description || null,
      receiptUrl: external.receiptUrl || null,
      processorResponseJson: external,
      failureCode: external.failureCode || null,
      failureMessage: external.failureMessage || null,
      cardBrand: external.card?.brand || null,
      cardLast4: external.card?.last4 || null,
      cardExpMonth: external.card?.expMonth || null,
      cardExpYear: external.card?.expYear || null,
      billingName: payload.billingName || external.billing?.name || null,
      billingEmail: payload.billingEmail || external.billing?.email || null,
      billingZip: payload.billingZip || external.billing?.zip || null,
      feeAmount: external.feeAmount ?? null,
      netAmount: external.netAmount ?? null
    }
  });
  if (payment.invoiceId) await recalculateInvoiceBalance(payment.invoiceId);
  return payment;
}

/**
 * Main entry point. Routes to the correct processor based on payload.processor.
 * Default processor is SOLA_PAYMENTS.
 */
export async function createProcessorCharge(payload) {
  const processor = String(payload.processor || "SOLA_PAYMENTS").toUpperCase();

  if (processor === "PAYMENT_HUB") {
    return createPaymentHubCharge(payload);
  }

  if (payload.cloudIM) {
    return createSolaCloudIMCharge(payload);
  }

  return createSolaCharge(payload);
}

export async function refreshProcessorPaymentStatus(paymentId) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) {
    const error = new Error("Payment not found");
    error.status = 404;
    throw error;
  }

  // Sola payments are synchronous — status is final at charge time.
  // For Payment Hub, refresh from the external API.
  if (payment.processor === "PAYMENT_HUB") {
    const external = await phGetPayment(payment.externalPaymentId);
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: mapExternalStatus(external.status),
        capturedAt: external.capturedAt ? new Date(external.capturedAt) : payment.capturedAt,
        receiptUrl: external.receiptUrl || payment.receiptUrl,
        processorResponseJson: external,
        failureCode: external.failureCode || null,
        failureMessage: external.failureMessage || null,
        feeAmount: external.feeAmount ?? payment.feeAmount,
        netAmount: external.netAmount ?? payment.netAmount
      }
    });
    if (updated.invoiceId) await recalculateInvoiceBalance(updated.invoiceId);
    return updated;
  }

  // Sola — return as-is (status already set at charge time)
  return payment;
}
