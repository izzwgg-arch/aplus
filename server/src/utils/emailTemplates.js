const APP_NAME = "A+ Center";

const baseStyle = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
  .header { background: #1e293b; padding: 28px 32px; }
  .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.3px; }
  .header p { color: #94a3b8; margin: 4px 0 0; font-size: 13px; }
  .body { padding: 32px; color: #374151; font-size: 15px; line-height: 1.6; }
  .body p { margin: 0 0 16px; }
  .cta { display: inline-block; background: #1e293b; color: #ffffff !important; padding: 13px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 4px 0 24px; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  .link-box { background: #f1f5f9; border-radius: 6px; padding: 12px 14px; font-size: 13px; color: #475569; word-break: break-all; }
  .footer { padding: 20px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
`;

function html(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP_NAME}</title>
<style>${baseStyle}</style>
</head>
<body>${body}</body>
</html>`;
}

export function buildInviteEmail({ fullName, url, expiresHours = 48 }) {
  return html(`
<div class="wrap">
  <div class="header">
    <h1>${APP_NAME}</h1>
    <p>You have been invited</p>
  </div>
  <div class="body">
    <p>Hi ${fullName || "there"},</p>
    <p>You've been invited to access <strong>${APP_NAME}</strong>. Click the button below to set your password and activate your account.</p>
    <a href="${url}" class="cta">Set Your Password</a>
    <p>This invitation link will expire in <strong>${expiresHours} hours</strong>. If you did not expect this invitation, you can safely ignore this email.</p>
    <hr class="divider">
    <p style="font-size:13px;color:#64748b;">If the button above doesn't work, copy and paste this link into your browser:</p>
    <div class="link-box">${url}</div>
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} ${APP_NAME}. This is an automated message — please do not reply.</div>
</div>`);
}

export function buildResetEmail({ fullName, url, expiresMin = 30 }) {
  const expiresText =
    expiresMin >= 60
      ? `${expiresMin / 60} hour${expiresMin / 60 === 1 ? "" : "s"}`
      : `${expiresMin} minutes`;

  return html(`
<div class="wrap">
  <div class="header">
    <h1>${APP_NAME}</h1>
    <p>Password reset request</p>
  </div>
  <div class="body">
    <p>Hi ${fullName || "there"},</p>
    <p>We received a request to reset the password for your account. Click the button below to choose a new password.</p>
    <a href="${url}" class="cta">Reset Password</a>
    <p>This link will expire in <strong>${expiresText}</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
    <hr class="divider">
    <p style="font-size:13px;color:#64748b;">If the button above doesn't work, copy and paste this link into your browser:</p>
    <div class="link-box">${url}</div>
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} ${APP_NAME}. This is an automated message — please do not reply.</div>
</div>`);
}
