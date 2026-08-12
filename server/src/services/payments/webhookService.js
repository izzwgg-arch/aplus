import crypto from "crypto";
import { prisma } from "../../config/prisma.js";
import { refreshPaymentAggregateStatus, recalculateInvoiceBalance } from "./paymentService.js";
import { syncPaymentToQuickbooks } from "../integrations/quickbooks/quickbooksService.js";
import { sendReceiptEmail } from "../../utils/mailer.js";
import { getOrCreateClinicSettings } from "../settingsService.js";
import { logActivity } from "../invoices/invoiceActivityService.js";

function safeCompare(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function verifyPaymentHubSignature({ payloadRaw, signature, secret }) {
  if (!secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(payloadRaw).digest("hex");
  return safeCompare(digest, signature);
}

export async function processPaymentWebhookEvent({ provider, externalEventId, eventType, payloadJson }) {
  // Idempotency — skip already-processed events
  const existing = await prisma.paymentWebhookEvent.findUnique({ where: { externalEventId } });
  if (existing?.processedAt) return { duplicate: true };

  const saved = existing || await prisma.paymentWebhookEvent.create({
    data: { provider, externalEventId, eventType, payloadJson }
  });

  const externalPaymentId =
    payloadJson?.data?.paymentId ||
    payloadJson?.data?.id        ||
    payloadJson?.paymentId       ||
    payloadJson?.transactionId;

  if (externalPaymentId) {
    const payment = await prisma.payment.findFirst({
      where: { externalPaymentId: String(externalPaymentId) },
      include: { invoice: { include: { client: true } } }
    });

    if (payment) {
      const event = String(eventType || "").toLowerCase();

      if (event.includes("refund")) {
        // ── Refund event ──
        const refundExternalId = payloadJson?.data?.refundId || payloadJson?.data?.id;
        if (refundExternalId) {
          await prisma.refund.upsert({
            where: { externalRefundId: String(refundExternalId) },
            create: {
              paymentId:            payment.id,
              externalRefundId:     String(refundExternalId),
              amount:               Number(payloadJson?.data?.amount || 0),
              currency:             payloadJson?.data?.currency || payment.currency,
              status:               event.includes("failed") ? "FAILED" : "SUCCEEDED",
              processorResponseJson: payloadJson
            },
            update: {
              status:               event.includes("failed") ? "FAILED" : "SUCCEEDED",
              processorResponseJson: payloadJson
            }
          });
        }
        await refreshPaymentAggregateStatus(payment.id);

      } else {
        // ── Payment status update ──
        const succeeded = event.includes("succeed") || event.includes("captured") || event.includes("approved") || event.includes("paid");
        const failed    = event.includes("failed")   || event.includes("declined") || event.includes("reject");
        const canceled  = event.includes("cancel")   || event.includes("void");

        const newStatus = failed ? "FAILED" : canceled ? "CANCELED" : succeeded ? "SUCCEEDED" : "PENDING";
        const previousStatus = payment.status;

        const updatedPayment = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status:               newStatus,
            failureMessage:       payloadJson?.data?.failureMessage || null,
            processorResponseJson: payloadJson
          }
        });

        if (payment.invoiceId) {
          const updatedInvoice = await recalculateInvoiceBalance(payment.invoiceId);

          // Avoid duplicate receipt / QB payment when webhook replays after API already marked SUCCEEDED (e.g. Sola + /payments/charge).
          if (newStatus === "SUCCEEDED" && previousStatus !== "SUCCEEDED") {
            // Log activity
            logActivity({
              invoiceId: payment.invoiceId,
              type:      "PAYMENT_RECEIVED",
              message:   `Payment of $${Number(updatedPayment.amount).toFixed(2)} confirmed via webhook (${provider})`,
              metadata:  { paymentId: payment.id, externalPaymentId, eventType }
            }).catch(() => {});

            // Send receipt email (non-blocking)
            const settings = await getOrCreateClinicSettings().catch(() => null);
            if (payment.invoice?.client?.email) {
              sendReceiptEmail({
                invoice:  updatedInvoice ? { ...updatedInvoice, client: payment.invoice.client } : payment.invoice,
                payment:  updatedPayment,
                settings
              })
                .then(async () => {
                  await prisma.payment.update({ where: { id: payment.id }, data: { receiptSentAt: new Date() } });
                  logActivity({ invoiceId: payment.invoiceId, type: "RECEIPT_SENT", message: `Receipt emailed to ${payment.invoice.client.email}`, metadata: { to: payment.invoice.client.email } }).catch(() => {});
                })
                .catch((err) => console.error("[webhook-receipt]", err?.message));
            }

            // QB sync (non-blocking)
            syncPaymentToQuickbooks(payment.id, { triggerType: "background" }).catch((err) => {
              console.error("[webhook-qb-sync]", err?.message);
              logActivity({ invoiceId: payment.invoiceId, type: "QB_FAILED", message: `QB sync failed: ${err?.message}` }).catch(() => {});
            });
          }

          if (newStatus === "FAILED") {
            logActivity({
              invoiceId: payment.invoiceId,
              type:      "NOTE",
              message:   `Payment failed via webhook: ${payloadJson?.data?.failureMessage || eventType}`,
              metadata:  { paymentId: payment.id, eventType }
            }).catch(() => {});
          }
        }
      }
    }
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: saved.id },
    data: { processedAt: new Date() }
  });

  return { duplicate: false };
}
