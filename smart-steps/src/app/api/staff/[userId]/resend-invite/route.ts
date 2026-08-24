import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { auditLog } from "@/lib/auditLogger";
import { sendInvite } from "@/lib/invite";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ userId: string }> };

/**
 * POST /smart-steps/api/staff/[userId]/resend-invite
 * Re-issues an invite token and re-sends the set-password email.
 * ADMIN only (smartsteps.staff.create).
 */
export async function POST(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.staff.create");
  if (denied) return denied;

  const { userId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!target.email) {
    return NextResponse.json(
      { error: "This provider has no email address. Add one before sending an invitation." },
      { status: 400 }
    );
  }
  if (target.passwordHash) {
    return NextResponse.json(
      { error: "This user has already set a password and activated their account." },
      { status: 400 }
    );
  }

  // Ensure the user is flagged as invited (e.g. an older SSO stub being invited now)
  await prisma.user.update({ where: { id: userId }, data: { invitedAt: new Date() } });

  try {
    await sendInvite({ id: target.id, email: target.email, name: target.name }, { isResend: true });
  } catch (err) {
    console.error("[resend-invite]", err);
    return NextResponse.json(
      { error: "Invite regenerated, but the email could not be sent. Check email configuration." },
      { status: 500 }
    );
  }

  await auditLog(user.id, "USER_INVITE_RESENT", "User", userId, { email: target.email });
  return NextResponse.json({ ok: true });
}
