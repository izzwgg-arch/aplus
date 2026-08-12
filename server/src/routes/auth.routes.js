import express from "express";
import bcrypt from "bcryptjs";
import { addMinutes, addHours } from "date-fns";
import { prisma } from "../config/prisma.js";
import { signAuthToken, verifyToken } from "../utils/jwt.js";
import { createRandomToken, hashToken } from "../utils/token.js";
import { env } from "../config/env.js";
import { sendEmail } from "../utils/mailer.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { buildInviteEmail, buildResetEmail } from "../utils/emailTemplates.js";
import { getUserPermissions, getUserRoleKey } from "../services/permissionsService.js";

const router = express.Router();

const MIN_PW = 8;

function validatePassword(password) {
  if (!password || typeof password !== "string") return "Password is required.";
  if (password.length < MIN_PW) return `Password must be at least ${MIN_PW} characters.`;
  return null;
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return res.status(401).json({ error: "Invalid email or password." });

  if (user.status === "INVITED") {
    return res.status(403).json({
      error: "Your account has not been activated yet. Check your email for an invitation link to set your password."
    });
  }
  if (user.status === "DISABLED") {
    return res.status(403).json({ error: "This account has been disabled. Please contact your administrator." });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password." });

  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

  return res.json({
    token: signAuthToken(user),
    user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, status: user.status }
  });
});

// ---------------------------------------------------------------------------
// VALIDATE INVITE TOKEN (GET — used by frontend to pre-fill name/email)
// ---------------------------------------------------------------------------
router.get("/invite/validate", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Invitation token is required." });

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { email: true, fullName: true, status: true } } }
  });

  if (!record || record.purpose !== "INVITE") {
    return res.status(400).json({ error: "This invitation link is invalid." });
  }
  if (record.usedAt) {
    return res.status(400).json({
      error: "This invitation link has already been used. If you need access, please contact your administrator.",
      code: "ALREADY_USED"
    });
  }
  if (record.expiresAt < new Date()) {
    return res.status(400).json({
      error: "This invitation link has expired. Please ask your administrator to resend the invitation.",
      code: "EXPIRED"
    });
  }

  return res.json({ email: record.user.email, fullName: record.user.fullName });
});

// ---------------------------------------------------------------------------
// ACCEPT INVITE (POST — set first password, activate account)
// ---------------------------------------------------------------------------
router.post("/invite/accept", async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token) return res.status(400).json({ error: "Invitation token is required." });

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, fullName: true, status: true } } }
  });

  if (!record || record.purpose !== "INVITE") {
    return res.status(400).json({ error: "This invitation link is invalid." });
  }
  if (record.usedAt) {
    return res.status(400).json({
      error: "This invitation link has already been used.",
      code: "ALREADY_USED"
    });
  }
  if (record.expiresAt < new Date()) {
    return res.status(400).json({
      error: "This invitation link has expired. Please ask your administrator to resend the invitation.",
      code: "EXPIRED"
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, status: "ACTIVE", activatedAt: new Date() }
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    })
  ]);

  await writeAuditLog(req, {
    action: "USER_ACTIVATED_VIA_INVITE",
    targetType: "User",
    targetId: record.userId,
    metadata: { email: record.user.email }
  });

  return res.json({ message: "Account activated successfully.", email: record.user.email });
});

// ---------------------------------------------------------------------------
// FORGOT PASSWORD
// ---------------------------------------------------------------------------
router.post("/forgot-password", async (req, res) => {
  const neutral = { message: "If an account exists for that email, we've sent password reset instructions." };

  const { email } = req.body;
  if (!email) return res.json(neutral);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || user.status === "DISABLED") return res.json(neutral);

  // Invalidate all pending reset tokens for this user to prevent token accumulation
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
    data: { usedAt: new Date() }
  });

  const raw = createRandomToken();
  const tokenHash = hashToken(raw);
  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: user.id,
      purpose: "PASSWORD_RESET",
      expiresAt: addMinutes(new Date(), env.resetTokenExpiresMin)
    }
  });

  const url = `${env.appBaseUrl}/reset-password?token=${raw}`;

  try {
    await sendEmail({
      to: user.email,
      subject: "Reset your A+ Center password",
      html: buildResetEmail({ fullName: user.fullName, url, expiresMin: env.resetTokenExpiresMin })
    });
  } catch (err) {
    console.error("[auth] Failed to send reset email:", err?.message);
  }

  return res.json(neutral);
});

// ---------------------------------------------------------------------------
// RESET PASSWORD
// ---------------------------------------------------------------------------
router.post("/reset-password", async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token) return res.status(400).json({ error: "Reset token is missing." });

  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true } } }
  });

  if (!record || record.purpose !== "PASSWORD_RESET") {
    return res.status(400).json({ error: "This reset link is invalid." });
  }
  if (record.usedAt) {
    return res.status(400).json({
      error: "This reset link has already been used. Please request a new one.",
      code: "ALREADY_USED"
    });
  }
  if (record.expiresAt < new Date()) {
    return res.status(400).json({
      error: "This reset link has expired. Please request a new one.",
      code: "EXPIRED"
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, status: "ACTIVE" }
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() }
    })
  ]);

  await writeAuditLog(req, {
    action: "PASSWORD_RESET_COMPLETED",
    targetType: "User",
    targetId: record.userId
  });

  return res.json({ message: "Password reset successful.", email: record.user.email });
});

// ---------------------------------------------------------------------------
// ME (verify JWT)
// ---------------------------------------------------------------------------
router.get("/me", async (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const decoded = verifyToken(token);
    return res.json(decoded);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

// ---------------------------------------------------------------------------
// MY EFFECTIVE PERMISSIONS (used by usePermissions hook on the client)
// ---------------------------------------------------------------------------
router.get("/permissions", requireAuth, async (req, res) => {
  const [keys, roleKey] = await Promise.all([
    getUserPermissions(req.user.sub),
    getUserRoleKey(req.user.sub)
  ]);
  return res.json({ permissions: [...keys], roleKey });
});

// ---------------------------------------------------------------------------
// CHANGE PASSWORD (authenticated)
// ---------------------------------------------------------------------------
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });

  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) return res.status(404).json({ error: "User not found." });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect." });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  await writeAuditLog(req, {
    action: "PASSWORD_CHANGED",
    targetType: "User",
    targetId: user.id
  });
  return res.json({ message: "Password changed successfully." });
});

export default router;
