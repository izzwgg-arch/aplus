import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { verifyEmailConnection } from "@/lib/mailer";
import { auditLog } from "@/lib/auditLogger";

/**
 * POST /smart-steps/api/organization/email-settings/test-connection
 * Verifies SMTP authentication for the SmartSteps account (ADMIN only).
 * An optional `appPassword` in the body lets the admin test a value they
 * typed but haven't saved yet; it is never returned or logged.
 */
export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let appPassword: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { appPassword?: string };
    appPassword = body?.appPassword;
  } catch {
    /* empty body is fine — falls back to the stored password */
  }

  try {
    await verifyEmailConnection(appPassword);
    await auditLog(user.id, "EMAIL_TEST_CONNECTION", "OrganizationSettings", "singleton", {
      result: "success",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Log the underlying reason server-side (no secrets), return a generic message.
    console.error("[email test-connection]", (err as Error)?.message);
    await auditLog(user.id, "EMAIL_TEST_CONNECTION", "OrganizationSettings", "singleton", {
      result: "failure",
    });
    return NextResponse.json(
      { ok: false, error: "Could not connect. Check the address, app password, host, and port." },
      { status: 400 },
    );
  }
}
