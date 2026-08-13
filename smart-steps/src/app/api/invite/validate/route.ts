import { NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { prisma } from "@/lib/db";

/**
 * GET /smart-steps/api/invite/validate?token=...
 * Public — checks whether an invite token is live (unused + unexpired).
 * Returns the target email/name so the accept page can greet the user.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false }, { status: 200 });

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      usedAt: true,
      expiresAt: true,
      purpose: true,
      user: { select: { email: true, name: true } },
    },
  });

  const valid =
    !!record &&
    record.purpose === "INVITE" &&
    record.usedAt === null &&
    record.expiresAt.getTime() > Date.now();

  if (!valid) return NextResponse.json({ valid: false }, { status: 200 });

  return NextResponse.json({
    valid: true,
    email: record!.user.email,
    name: record!.user.name,
  });
}
