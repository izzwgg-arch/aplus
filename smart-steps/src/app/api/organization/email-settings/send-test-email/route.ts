import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { sendTestEmail } from "@/lib/mailer";
import { auditLog } from "@/lib/auditLogger";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /smart-steps/api/organization/email-settings/send-test-email
 * Sends the standard "SmartSteps Email Test" message to `to` from the
 * configured SmartSteps sender account (ADMIN only). Optional `appPassword`
 * supports testing before saving; it is never returned or logged.
 */
export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let to = "";
  let appPassword: string | undefined;
  try {
    const body = (await req.json()) as { to?: string; appPassword?: string };
    to = String(body?.to || "").trim();
    appPassword = body?.appPassword;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "Enter a valid test recipient email." }, { status: 400 });
  }

  try {
    await sendTestEmail(to, appPassword);
    await auditLog(user.id, "EMAIL_TEST_SEND", "OrganizationSettings", "singleton", {
      result: "success",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email send-test]", (err as Error)?.message);
    await auditLog(user.id, "EMAIL_TEST_SEND", "OrganizationSettings", "singleton", {
      result: "failure",
    });
    return NextResponse.json(
      { ok: false, error: "Could not send the test email. Verify the settings and try again." },
      { status: 400 },
    );
  }
}
