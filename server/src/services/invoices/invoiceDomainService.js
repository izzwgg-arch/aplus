import { prisma } from "../../config/prisma.js";

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateInvoiceTotals({ lineItems = [], tax = 0, discount = 0 }) {
  const subtotal = round2(lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const cleanTax = round2(Number(tax || 0));
  const cleanDiscount = round2(Number(discount || 0));
  const total = round2(Math.max(0, subtotal + cleanTax - cleanDiscount));
  return { subtotal, tax: cleanTax, discount: cleanDiscount, total };
}

// Minimum sequence — ensures the first new invoice is 202604-0215
const MIN_SEQUENCE = 214;

export async function nextInvoiceNumber() {
  const now = new Date();
  const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-`;

  // Find highest sequence across ALL existing invoices (handles both old INV- and new format)
  const latest = await prisma.invoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true }
  });

  let maxSeq = MIN_SEQUENCE;
  if (latest?.invoiceNumber) {
    const match = latest.invoiceNumber.match(/(\d+)$/);
    if (match) {
      const parsed = Number(match[1]);
      if (parsed > maxSeq) maxSeq = parsed;
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export async function hydrateInvoice(invoiceId) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: true,
      lineItems: { orderBy: { createdAt: "asc" } },
      payments: {
        include: { refunds: { orderBy: { createdAt: "desc" } } },
        orderBy: { paymentDate: "desc" }
      }
    }
  });
}
