import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { getIntegrationAccount, getDecryptedTokens } from "../services/integrations/integrationAccountService.js";
import { logger } from "./logger.js";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Transporter resolution                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

const fallbackTransporter = nodemailer.createTransport({
  host: env.emailHost,
  port: env.emailPort,
  secure: env.emailPort === 465,
  auth: env.emailUser && env.emailPass ? { user: env.emailUser, pass: env.emailPass } : undefined
});

async function resolveTransporter() {
  const account = await getIntegrationAccount("GOOGLE_WORKSPACE");
  if (!account?.isEnabled) return { transporter: fallbackTransporter, from: env.emailFrom };
  const meta = account.metadataJson || {};
  const { accessToken, refreshToken } = getDecryptedTokens(account);
  const user = meta.userEmail || env.emailUser;
  if (!user) return { transporter: fallbackTransporter, from: env.emailFrom };
  const authType = meta.authType || "OAUTH2";
  if (authType === "APP_PASSWORD") {
    if (!accessToken) return { transporter: fallbackTransporter, from: env.emailFrom };
    const t = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass: accessToken }
    });
    return { transporter: t, from: meta.fromEmail || user };
  }
  if (!env.googleWorkspaceClientId || !env.googleWorkspaceClientSecret || !refreshToken) {
    return { transporter: fallbackTransporter, from: env.emailFrom };
  }
  const t = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user,
      clientId: env.googleWorkspaceClientId,
      clientSecret: env.googleWorkspaceClientSecret,
      refreshToken,
      accessToken: accessToken || undefined
    }
  });
  return { transporter: t, from: meta.fromEmail || user };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Core send helper                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendEmail({ to, subject, html, attachments }) {
  if (!env.emailHost || !env.emailUser || !env.emailPass) {
    logger.info("Email settings missing, skipping send", { to, subject });
    const account = await getIntegrationAccount("GOOGLE_WORKSPACE");
    if (!account?.isEnabled) return;
  }
  const resolved = await resolveTransporter();
  await resolved.transporter.sendMail({
    from: resolved.from,
    to,
    subject,
    html,
    attachments
  });
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Shared formatting helpers                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v || 0));
}
function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
function emailWrapper({ accent = "#2563EB", logoUrl, companyName, footerText, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>A+ Center</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <!-- Header -->
      <tr><td style="background:${accent};padding:28px 40px;">
        <table width="100%"><tr>
          <td>
            ${logoUrl
              ? `<img src="${logoUrl}" alt="${companyName}" style="max-height:48px;max-width:180px;object-fit:contain;" />`
              : `<span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">${companyName || "A+ Center"}</span>`
            }
          </td>
          <td align="right" style="color:rgba(255,255,255,0.8);font-size:13px;"></td>
        </tr></table>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:36px 40px;">
        ${body}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:20px 40px;border-top:1px solid #F1F5F9;text-align:center;font-size:12px;color:#94A3B8;">
        ${footerText || `Thank you for choosing ${companyName || "A+ Center"}.`}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Invoice email — branded HTML with Pay Now button                            */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendInvoiceEmail({ invoice, settings, paymentLinkUrl }) {
  const accent = settings?.invoiceAccentColor || "#2563EB";
  const companyName = settings?.companyName || "A+ Center";
  const footerText = settings?.invoiceFooterText || `Thank you for choosing ${companyName}.`;
  const logoUrl = settings?.invoiceLogoUrl || null;

  const client = invoice.client || {};
  const to = client.email;
  if (!to) throw new Error("Client has no email address");

  const lineRows = (invoice.lineItems || []).map((item) => `
    <tr>
      <td style="padding:10px 0;font-size:14px;color:#334155;border-bottom:1px solid #F1F5F9;">${item.description || ""}</td>
      <td style="padding:10px 0;font-size:14px;color:#334155;text-align:right;border-bottom:1px solid #F1F5F9;">${Number(item.quantity).toFixed(2)}</td>
      <td style="padding:10px 0;font-size:14px;color:#334155;text-align:right;border-bottom:1px solid #F1F5F9;">${money(item.unitPrice)}</td>
      <td style="padding:10px 0;font-size:14px;font-weight:600;color:#1E293B;text-align:right;border-bottom:1px solid #F1F5F9;">${money(item.amount)}</td>
    </tr>`).join("");

  const payNowButton = paymentLinkUrl
    ? `<tr><td colspan="4" align="center" style="padding-top:24px;">
        <a href="${paymentLinkUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
          Pay Now
        </a>
        <p style="font-size:12px;color:#94A3B8;margin-top:10px;">Or copy this link: <a href="${paymentLinkUrl}" style="color:${accent};word-break:break-all;">${paymentLinkUrl}</a></p>
      </td></tr>`
    : "";

  const body = `
    <p style="font-size:22px;font-weight:700;color:#0F172A;margin:0 0 6px;">Invoice ${invoice.invoiceNumber || ""}</p>
    <p style="font-size:14px;color:#64748B;margin:0 0 28px;">Hi ${client.fullName || "there"}, please find your invoice summary below.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;padding-bottom:6px;">Invoice Date</td>
        <td style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;padding-bottom:6px;text-align:right;">Due Date</td>
      </tr>
      <tr>
        <td style="font-size:15px;font-weight:600;color:#1E293B;">${fmt(invoice.issueDate)}</td>
        <td style="font-size:15px;font-weight:600;color:#DC2626;text-align:right;">${fmt(invoice.dueDate)}</td>
      </tr>
    </table>

    <!-- Line items -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #F1F5F9;margin-bottom:4px;">
      <thead>
        <tr style="background:#F8FAFC;">
          <th style="padding:8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;text-align:left;">Description</th>
          <th style="padding:8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;text-align:right;">Qty</th>
          <th style="padding:8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;text-align:right;">Rate</th>
          <th style="padding:8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#94A3B8;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows || `<tr><td colspan="4" style="padding:12px 0;color:#94A3B8;font-size:13px;">See full invoice for details.</td></tr>`}
        <!-- Totals -->
        <tr><td colspan="3" style="padding:12px 0 4px;font-size:14px;font-weight:600;color:#475569;border-top:1px solid #E2E8F0;text-align:right;">Total</td>
            <td style="padding:12px 0 4px;font-size:16px;font-weight:700;color:#0F172A;text-align:right;border-top:1px solid #E2E8F0;">${money(invoice.total)}</td></tr>
        <tr><td colspan="3" style="padding:4px 0;font-size:15px;font-weight:700;color:#DC2626;text-align:right;">Balance Due</td>
            <td style="padding:4px 0;font-size:17px;font-weight:700;color:#DC2626;text-align:right;">${money(invoice.balanceDue)}</td></tr>
        ${payNowButton}
      </tbody>
    </table>

    ${invoice.notes ? `<p style="font-size:13px;color:#64748B;margin-top:20px;padding:12px 16px;background:#F8FAFC;border-radius:8px;"><strong>Note:</strong> ${invoice.notes}</p>` : ""}
  `;

  const html = emailWrapper({ accent, logoUrl, companyName, footerText, body });

  await sendEmail({
    to,
    subject: `Invoice ${invoice.invoiceNumber || ""} from ${companyName} — ${money(invoice.balanceDue)} due ${fmt(invoice.dueDate)}`,
    html
  });
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Receipt email — branded HTML confirmation after successful payment          */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function sendReceiptEmail({ invoice, payment, settings }) {
  const accent = settings?.invoiceAccentColor || "#2563EB";
  const companyName = settings?.companyName || "A+ Center";
  const footerText = settings?.invoiceFooterText || `Thank you for choosing ${companyName}.`;
  const logoUrl = settings?.invoiceLogoUrl || null;

  const client = invoice.client || {};
  const to = client.email;
  if (!to) throw new Error("Client has no email address");

  const payMethod = payment.paymentMethod || payment.cardBrand
    ? `${payment.paymentMethod || ""}${payment.cardLast4 ? ` ···· ${payment.cardLast4}` : ""}`.trim()
    : "Payment";

  const remaining = Number(invoice.balanceDue || 0);

  const body = `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#DCFCE7;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;margin-bottom:12px;">✓</div>
      <p style="font-size:24px;font-weight:700;color:#0F172A;margin:0 0 6px;">Payment Received</p>
      <p style="font-size:14px;color:#64748B;margin:0;">Thank you, ${client.fullName || ""}!</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <tr>
        <td style="font-size:13px;color:#64748B;padding:5px 0;">Invoice</td>
        <td style="font-size:13px;font-weight:600;color:#1E293B;text-align:right;">${invoice.invoiceNumber || "—"}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#64748B;padding:5px 0;">Amount Paid</td>
        <td style="font-size:15px;font-weight:700;color:#15803D;text-align:right;">${money(payment.amount)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#64748B;padding:5px 0;">Payment Method</td>
        <td style="font-size:13px;font-weight:500;color:#1E293B;text-align:right;">${payMethod}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#64748B;padding:5px 0;">Date</td>
        <td style="font-size:13px;font-weight:500;color:#1E293B;text-align:right;">${fmt(payment.paymentDate)}</td>
      </tr>
      ${remaining > 0.01 ? `
      <tr>
        <td style="font-size:13px;color:#64748B;padding:5px 0;border-top:1px solid #E2E8F0;padding-top:10px;">Remaining Balance</td>
        <td style="font-size:14px;font-weight:700;color:#DC2626;text-align:right;border-top:1px solid #E2E8F0;padding-top:10px;">${money(remaining)}</td>
      </tr>` : `
      <tr>
        <td colspan="2" style="font-size:13px;font-weight:700;color:#15803D;text-align:center;padding-top:10px;border-top:1px solid #E2E8F0;">Invoice fully paid ✓</td>
      </tr>`}
    </table>

    ${payment.description ? `<p style="font-size:13px;color:#64748B;margin-top:0;">Note: ${payment.description}</p>` : ""}

    <p style="font-size:13px;color:#94A3B8;margin-top:16px;">
      Please keep this email as your receipt. If you have any questions, reply to this email.
    </p>
  `;

  const html = emailWrapper({ accent, logoUrl, companyName, footerText, body });

  await sendEmail({
    to,
    subject: `Receipt — Payment of ${money(payment.amount)} received · ${companyName}`,
    html
  });
}
