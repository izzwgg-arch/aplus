import { prisma } from "../../config/prisma.js";
import { getOrCreateClinicSettings } from "../settingsService.js";

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function statusBadge(status, accent) {
  const map = {
    DRAFT:   { bg: "#F1F5F9", color: "#64748B", label: "Draft" },
    OPEN:    { bg: "#EFF6FF", color: "#2563EB", label: "Open" },
    SENT:    { bg: "#F0FDF4", color: "#16A34A", label: "Sent" },
    PAID:    { bg: "#F0FDF4", color: "#15803D", label: "Paid" },
    PARTIAL: { bg: "#FFFBEB", color: "#B45309", label: "Partially Paid" },
    OVERDUE: { bg: "#FEF2F2", color: "#DC2626", label: "Overdue" },
    VOID:    { bg: "#F8FAFC", color: "#94A3B8", label: "Void" }
  };
  const s = map[status] || { bg: "#F1F5F9", color: "#64748B", label: status };
  return `<span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:${s.bg};color:${s.color};font-size:12px;font-weight:600;letter-spacing:0.04em;">${s.label}</span>`;
}

export async function generateInvoiceHtml(invoiceId) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: true,
      lineItems: { orderBy: { createdAt: "asc" } },
      payments: { where: { status: { in: ["SUCCEEDED", "AUTHORIZED", "PARTIALLY_REFUNDED"] } }, orderBy: { paymentDate: "desc" } }
    }
  });
  if (!invoice) {
    const error = new Error("Invoice not found");
    error.status = 404;
    throw error;
  }

  const settings = await getOrCreateClinicSettings();
  const accent = settings.invoiceAccentColor || "#2563EB";
  const companyName = settings.companyName || "A+ Center";
  const companyAddress = settings.companyAddress || "";
  const companyEmail = settings.companyEmail || "";
  const companyPhone = settings.companyPhone || "";
  const footerText = settings.invoiceFooterText || "Thank you for choosing A+ Center.";
  const logoUrl = settings.invoiceLogoUrl || null;

  const amountPaid = invoice.payments.reduce((s, p) => s + Number(p.amount || 0) - Number(p.refundedAmount || 0), 0);

  const lineItemRows = invoice.lineItems.map((item) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;font-size:14px;color:#334155;">
        ${item.description || ""}
        ${item.serviceDate ? `<br><span style="font-size:12px;color:#94A3B8;">${fmt(item.serviceDate)}</span>` : ""}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;text-align:right;font-size:14px;color:#334155;">${Number(item.quantity).toFixed(2)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;text-align:right;font-size:14px;color:#334155;">${money(item.unitPrice)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #F1F5F9;text-align:right;font-size:14px;font-weight:600;color:#1E293B;">${money(item.amount)}</td>
    </tr>`).join("");

  const paymentRows = invoice.payments.length ? invoice.payments.map((p) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#334155;">${fmt(p.paymentDate)}</td>
      <td style="padding:8px 0;font-size:13px;color:#334155;">${p.paymentMethod || p.cardBrand || "Payment"}</td>
      <td style="padding:8px 0;font-size:13px;text-align:right;color:#16A34A;font-weight:600;">${money(p.amount)}</td>
    </tr>`).join("") : `<tr><td colspan="3" style="padding:8px 0;font-size:13px;color:#94A3B8;">No payments recorded.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Invoice ${invoice.invoiceNumber || invoice.id}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; background: #F7F9FC; color: #1E293B; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 860px; margin: 40px auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: ${accent}; padding: 36px 48px 32px; color: #fff; }
  .header-inner { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .logo-block img { max-height: 56px; max-width: 200px; object-fit: contain; }
  .logo-text { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .company-meta { font-size: 13px; opacity: 0.85; margin-top: 6px; line-height: 1.6; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .invoice-number { font-size: 14px; opacity: 0.85; margin-top: 4px; }
  .body { padding: 40px 48px; }
  .bill-row { display: flex; gap: 48px; margin-bottom: 36px; }
  .bill-block { flex: 1; }
  .bill-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 8px; }
  .bill-name { font-size: 16px; font-weight: 600; color: #1E293B; }
  .bill-detail { font-size: 13px; color: #64748B; margin-top: 4px; line-height: 1.5; }
  .dates-row { display: flex; gap: 32px; }
  .date-block { }
  .date-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 4px; }
  .date-value { font-size: 14px; font-weight: 600; color: #1E293B; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94A3B8; margin-bottom: 12px; margin-top: 32px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #F8FAFC; }
  thead th { padding: 10px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #94A3B8; text-align: left; }
  thead th:last-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: right; }
  .totals-table { margin-left: auto; width: 320px; margin-top: 16px; }
  .totals-table td { padding: 6px 0; font-size: 14px; color: #475569; }
  .totals-table td:last-child { text-align: right; font-weight: 500; }
  .total-row td { font-size: 18px; font-weight: 700; color: #1E293B; padding-top: 12px; border-top: 2px solid #E2E8F0; }
  .balance-row td { color: ${invoice.balanceDue <= 0 ? "#15803D" : "#DC2626"}; font-size: 18px; font-weight: 700; }
  .payments-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid #F1F5F9; }
  .notes-section { margin-top: 24px; padding: 16px 20px; background: #F8FAFC; border-radius: 10px; font-size: 13px; color: #64748B; line-height: 1.6; }
  .footer { padding: 24px 48px; border-top: 1px solid #F1F5F9; text-align: center; font-size: 12px; color: #94A3B8; }
  .status-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; border-radius: 0; margin: 0; max-width: 100%; }
    .no-print { display: none !important; }
  }
</style>
${invoice.autoprint ? "<script>window.onload=function(){window.print();}</script>" : ""}
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="header-inner">
      <div>
        <div class="logo-block">
          ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" />` : `<div class="logo-text">${companyName}</div>`}
        </div>
        <div class="company-meta">
          ${companyAddress ? `${companyAddress}<br>` : ""}
          ${companyEmail ? `${companyEmail}` : ""}${companyEmail && companyPhone ? " &nbsp;·&nbsp; " : ""}${companyPhone || ""}
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">Invoice</div>
        <div class="invoice-number">#${invoice.invoiceNumber || invoice.id}</div>
      </div>
    </div>
  </div>

  <!-- Body -->
  <div class="body">
    <div class="status-bar">
      <div class="dates-row">
        <div class="date-block">
          <div class="date-label">Issue Date</div>
          <div class="date-value">${fmt(invoice.issueDate)}</div>
        </div>
        <div class="date-block">
          <div class="date-label">Due Date</div>
          <div class="date-value">${fmt(invoice.dueDate)}</div>
        </div>
      </div>
      <div>${statusBadge(invoice.status, accent)}</div>
    </div>

    <div class="bill-row">
      <div class="bill-block">
        <div class="bill-label">From</div>
        <div class="bill-name">${companyName}</div>
        ${companyAddress ? `<div class="bill-detail">${companyAddress.replace(/\n/g, "<br>")}</div>` : ""}
        ${companyEmail ? `<div class="bill-detail">${companyEmail}</div>` : ""}
        ${companyPhone ? `<div class="bill-detail">${companyPhone}</div>` : ""}
      </div>
      <div class="bill-block">
        <div class="bill-label">Billed To</div>
        <div class="bill-name">${invoice.client?.fullName || "—"}</div>
        ${invoice.client?.email ? `<div class="bill-detail">${invoice.client.email}</div>` : ""}
        ${invoice.client?.phone ? `<div class="bill-detail">${invoice.client.phone}</div>` : ""}
      </div>
    </div>

    <!-- Line Items -->
    <div class="section-title">Services</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right;">Qty / Hrs</th>
          <th style="text-align:right;">Rate</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows || `<tr><td colspan="4" style="padding:16px;color:#94A3B8;font-size:13px;">No line items.</td></tr>`}
      </tbody>
    </table>

    <!-- Totals -->
    <table class="totals-table">
      <tr><td>Subtotal</td><td>${money(invoice.subtotal)}</td></tr>
      ${Number(invoice.tax || 0) !== 0 ? `<tr><td>Tax</td><td>${money(invoice.tax)}</td></tr>` : ""}
      ${Number(invoice.discount || 0) !== 0 ? `<tr><td>Discount</td><td style="color:#16A34A;">−${money(invoice.discount)}</td></tr>` : ""}
      <tr class="total-row"><td>Total</td><td>${money(invoice.total)}</td></tr>
      ${amountPaid > 0 ? `<tr><td style="font-size:14px;font-weight:500;color:#16A34A;">Amount Paid</td><td style="color:#16A34A;">−${money(amountPaid)}</td></tr>` : ""}
      <tr class="balance-row"><td>Balance Due</td><td>${money(invoice.balanceDue)}</td></tr>
    </table>

    <!-- Payment History -->
    ${invoice.payments.length > 0 ? `
    <div class="payments-section">
      <div class="section-title">Payment History</div>
      <table>
        <tr>
          <th style="text-align:left;padding:6px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;">Date</th>
          <th style="text-align:left;padding:6px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;">Method</th>
          <th style="text-align:right;padding:6px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;">Amount</th>
        </tr>
        ${paymentRows}
      </table>
    </div>` : ""}

    <!-- Notes -->
    ${invoice.notes ? `<div class="notes-section"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}
  </div>

  <!-- Footer -->
  <div class="footer">${footerText}</div>
</div>
</body>
</html>`;
}
