import { NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { auditLog } from "@/lib/auditLogger";
import { invalidateUserCache } from "@/lib/permissions";
import { prisma } from "@/lib/db";

/**
 * POST /smart-steps/api/invite/accept
 * Public — consumes an invite token and sets the user's password, activating
 * a standalone (local) login. Body: { token, password }.
 */
export async function POST(req: Request) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { token, password } = body;
  if (!token) return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, usedAt: true, expiresAt: true, purpose: true, userId: true },
  });

  const valid =
    !!record &&
    record.purpose === "INVITE" &&
    record.usedAt === null &&
    record.expiresAt.getTime() > Date.now();

  if (!valid) {
    return NextResponse.json(
      { error: "This invitation link is invalid or has expired. Ask an administrator to resend it." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password as string);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record!.userId },
      data: { passwordHash, invitedAt: null, isActive: true },
    }),
    // Spend this token and any other outstanding invite tokens for the user.
    prisma.passwordResetToken.updateMany({
      where: { userId: record!.userId, purpose: "INVITE", usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  invalidateUserCache(record!.userId);
  await auditLog(record!.userId, "INVITE_ACCEPTED", "User", record!.userId, {});

  return NextResponse.json({ ok: true });
}
