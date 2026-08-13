import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getEmailSettingsPublic, saveEmailSettings } from "@/lib/emailSettings";
import { isEncryptionConfigured } from "@/lib/crypto";

/**
 * SmartSteps Email Integration settings. ADMIN only — these carry the outgoing
 * SMTP credentials. The Google App Password is NEVER returned; the response
 * only exposes `hasAppPassword`.
 */

/** GET /smart-steps/api/organization/email-settings — masked settings (ADMIN only) */
export async function GET() {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const settings = await getEmailSettingsPublic();
    return NextResponse.json({ ...settings, encryptionConfigured: isEncryptionConfigured() });
  } catch (err) {
    console.error("[email-settings GET]", (err as Error)?.name);
    return NextResponse.json({ error: "Failed to load email settings" }, { status: 500 });
  }
}

/** PUT /smart-steps/api/organization/email-settings — save settings (ADMIN only) */
export async function PUT(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = (await req.json()) as {
      emailEnabled?: boolean;
      emailSenderName?: string | null;
      emailFromAddress?: string | null;
      emailReplyTo?: string | null;
      emailUser?: string | null;
      smtpHost?: string | null;
      smtpPort?: number | string | null;
      smtpSecure?: boolean;
      appPassword?: string | null;
    };

    // A new app password requires an encryption key to store it safely.
    if (
      typeof body.appPassword === "string" &&
      body.appPassword.trim().length > 0 &&
      !isEncryptionConfigured()
    ) {
      console.error("[email-settings PUT] ENCRYPTION_KEY missing — refusing to store app password");
      return NextResponse.json(
        { error: "Server is missing an encryption key; cannot store the app password." },
        { status: 500 },
      );
    }

    const port =
      body.smtpPort === undefined || body.smtpPort === null || body.smtpPort === ""
        ? undefined
        : Number(body.smtpPort);
    if (port !== undefined && (!Number.isFinite(port) || port <= 0 || port > 65535)) {
      return NextResponse.json({ error: "Invalid SMTP port" }, { status: 400 });
    }

    const saved = await saveEmailSettings({
      emailEnabled: body.emailEnabled,
      emailSenderName: body.emailSenderName,
      emailFromAddress: body.emailFromAddress,
      emailReplyTo: body.emailReplyTo,
      emailUser: body.emailUser,
      smtpHost: body.smtpHost,
      smtpPort: port ?? null,
      smtpSecure: body.smtpSecure,
      appPassword: body.appPassword,
    });
    return NextResponse.json({ ...saved, encryptionConfigured: isEncryptionConfigured() });
  } catch (err) {
    console.error("[email-settings PUT]", (err as Error)?.name);
    return NextResponse.json({ error: "Failed to save email settings" }, { status: 500 });
  }
}
