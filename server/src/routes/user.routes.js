import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { addHours } from "date-fns";
import { prisma } from "../config/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.js";
import { invalidateUserCache } from "../services/permissionsService.js";
import { writeAuditLog } from "../services/auditLogService.js";
import { createRandomToken, hashToken } from "../utils/token.js";
import { sendEmail } from "../utils/mailer.js";
import { buildAccountReadyEmail, buildInviteEmail } from "../utils/emailTemplates.js";
import { env } from "../config/env.js";

const router = express.Router();
router.use(requireAuth);

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  roleId: true,
  customRole: { select: { id: true, key: true, name: true } },
  status: true,
  invitedAt: true,
  activatedAt: true,
  lastLoginAt: true,
  createdAt: true
};

// ---------------------------------------------------------------------------
// LIST USERS
// ---------------------------------------------------------------------------
router.get("/", requirePermission("aplus.users.view"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "desc" }
  });
  return res.json(users);
});

// ---------------------------------------------------------------------------
// BCBA LIST (for appointment forms)
// ---------------------------------------------------------------------------
router.get("/bcbas", requirePermission("aplus.appointments.view"), async (_req, res) => {
  const bcbas = await prisma.user.findMany({
    where: { role: "BCBA", status: "ACTIVE" },
    select: { id: true, fullName: true, email: true }
  });
  return res.json(bcbas);
});

const MIN_PW = 8;

/** Spends every outstanding invite token so an old set-password link cannot overwrite an admin-set password. */
async function revokeInviteTokens(userId) {
  await prisma.passwordResetToken.updateMany({
    where: { userId, purpose: "INVITE", usedAt: null },
    data: { usedAt: new Date() }
  });
}

/** Invitation for an account whose password the admin set: sign-in link + login email, never the password. */
async function sendAccountReadyEmail(user) {
  await sendEmail({
    to: user.email,
    subject: `You've been invited to A+ Center`,
    html: buildAccountReadyEmail({
      fullName: user.fullName,
      email: user.email,
      loginUrl: `${env.appBaseUrl}/login`
    })
  });
}

// ---------------------------------------------------------------------------
// INVITE USER — or, when `password` is supplied, create an ACTIVE user with
// that password (no set-password link). `sendNotice: true` then also emails
// them an invitation carrying the sign-in link, never the password.
// ---------------------------------------------------------------------------
router.post("/", requirePermission("aplus.users.create"), async (req, res) => {
  const { email, fullName, role, password, sendNotice } = req.body;
  if (!email || !fullName) return res.status(400).json({ error: "Email and full name are required." });

  const adminSetPassword = typeof password === "string" && password !== "";
  if (adminSetPassword && password.length < MIN_PW) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PW} characters.` });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const safeRole = ["ADMIN", "BCBA", "STAFF"].includes(role) ? role : "STAFF";

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: "A user with that email already exists." });

  // Assign a matching system Role by default so the new granular-permission
  // system is effective immediately (admin can change it afterwards from the
  // Permissions page).
  const defaultSystemRole = await prisma.role.findUnique({ where: { key: safeRole } });

  if (adminSetPassword) {
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        fullName,
        role: safeRole,
        roleId: defaultSystemRole?.id || null,
        passwordHash: await bcrypt.hash(password, 10),
        status: "ACTIVE",
        activatedAt: new Date(),
        invitedById: req.user?.sub || null
      },
      select: USER_SELECT
    });

    let emailSent = false;
    let emailError = null;
    if (sendNotice === true) {
      try {
        await sendAccountReadyEmail(created);
        emailSent = true;
      } catch (err) {
        console.error("[users] Failed to send account-ready email:", err?.message);
        emailError = err?.message || "unknown error";
      }
    }

    await writeAuditLog(req, {
      action: "USER_CREATED_WITH_PASSWORD",
      targetType: "User",
      targetId: created.id,
      metadata: {
        email: created.email,
        role: created.role,
        emailRequested: sendNotice === true,
        emailSent,
        ...(emailError ? { emailError } : {})
      }
    });

    if (emailError) {
      return res.status(201).json({
        ...created,
        _warning: "User created with your password, but the invitation email could not be sent. They can still sign in with the password you set."
      });
    }
    return res.status(201).json({ ...created, _emailSent: emailSent });
  }

  // Create user with random unusable placeholder hash — they must set a real password via invite
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 4);

  const created = await prisma.user.create({
    data: {
      email: normalizedEmail,
      fullName,
      role: safeRole,
      roleId: defaultSystemRole?.id || null,
      passwordHash: placeholderHash,
      status: "INVITED",
      invitedAt: new Date(),
      invitedById: req.user?.sub || null
    },
    select: USER_SELECT
  });

  // Generate invite token
  const raw = createRandomToken();
  const tokenHash = hashToken(raw);
  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: created.id,
      purpose: "INVITE",
      expiresAt: addHours(new Date(), env.inviteTokenExpiresHours)
    }
  });

  const url = `${env.appBaseUrl}/accept-invite?token=${raw}`;

  try {
    await sendEmail({
      to: created.email,
      subject: `You've been invited to A+ Center`,
      html: buildInviteEmail({ fullName: created.fullName, url, expiresHours: env.inviteTokenExpiresHours })
    });
  } catch (err) {
    console.error("[users] Failed to send invite email:", err?.message);
    // Still return success — admin can resend manually; don't roll back the user
    await writeAuditLog(req, {
      action: "USER_INVITED",
      targetType: "User",
      targetId: created.id,
      metadata: { email: created.email, role: created.role, emailSent: false, emailError: err?.message }
    });
    return res.status(201).json({ ...created, _warning: "User created but invitation email could not be sent. Use Resend Invite to try again." });
  }

  await writeAuditLog(req, {
    action: "USER_INVITED",
    targetType: "User",
    targetId: created.id,
    metadata: { email: created.email, role: created.role, emailSent: true }
  });

  return res.status(201).json(created);
});

// ---------------------------------------------------------------------------
// RESEND INVITE
// ---------------------------------------------------------------------------
router.post("/:id/resend-invite", requirePermission("aplus.users.create"), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: USER_SELECT });
  if (!user) return res.status(404).json({ error: "User not found." });

  if (user.status !== "INVITED") {
    return res.status(400).json({ error: "This user has already activated their account." });
  }

  // Invalidate old invite tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, purpose: "INVITE", usedAt: null },
    data: { usedAt: new Date() }
  });

  // Issue fresh token
  const raw = createRandomToken();
  const tokenHash = hashToken(raw);
  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: user.id,
      purpose: "INVITE",
      expiresAt: addHours(new Date(), env.inviteTokenExpiresHours)
    }
  });

  const url = `${env.appBaseUrl}/accept-invite?token=${raw}`;

  try {
    await sendEmail({
      to: user.email,
      subject: `Invitation reminder — A+ Center`,
      html: buildInviteEmail({ fullName: user.fullName, url, expiresHours: env.inviteTokenExpiresHours })
    });
  } catch (err) {
    console.error("[users] Failed to resend invite email:", err?.message);
    return res.status(500).json({ error: "Invite token regenerated but email could not be sent. Check your email settings." });
  }

  await writeAuditLog(req, {
    action: "USER_INVITE_RESENT",
    targetType: "User",
    targetId: user.id,
    metadata: { email: user.email }
  });

  return res.json({ message: "Invitation resent successfully." });
});

// ---------------------------------------------------------------------------
// CHANGE ROLE (legacy enum — kept for backward compatibility/display)
// ---------------------------------------------------------------------------
router.patch("/:id/role", requirePermission("aplus.users.manage_roles"), async (req, res) => {
  const { role } = req.body;
  if (!["ADMIN", "BCBA", "STAFF"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
    select: USER_SELECT
  });
  await writeAuditLog(req, {
    action: "USER_ROLE_UPDATED",
    targetType: "User",
    targetId: updated.id,
    metadata: { role: updated.role }
  });
  return res.json(updated);
});

// ---------------------------------------------------------------------------
// ASSIGN GRANULAR PERMISSION ROLE (new Role table — Phase 1 permission system)
// ---------------------------------------------------------------------------
router.patch("/:id/role-id", requirePermission("aplus.users.manage_roles"), async (req, res) => {
  const { roleId } = req.body;
  if (!roleId) return res.status(400).json({ error: "roleId is required." });
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || !role.isActive) return res.status(400).json({ error: "Invalid or inactive role." });

  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!target) return res.status(404).json({ error: "User not found." });

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { roleId: role.id },
    select: USER_SELECT
  });
  invalidateUserCache(req.params.id);
  await writeAuditLog(req, {
    action: "USER_ROLE_ASSIGNED",
    targetType: "User",
    targetId: updated.id,
    metadata: { roleId: role.id, roleKey: role.key, roleName: role.name }
  });
  return res.json(updated);
});

// ---------------------------------------------------------------------------
// ENABLE / DISABLE USER
// ---------------------------------------------------------------------------
router.patch("/:id/status", requirePermission("aplus.users.edit"), async (req, res) => {
  const { status } = req.body;
  if (!["ACTIVE", "DISABLED"].includes(status)) {
    return res.status(400).json({ error: "Status must be ACTIVE or DISABLED." });
  }
  if (req.params.id === req.user?.sub) {
    return res.status(400).json({ error: "You cannot change your own account status." });
  }
  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { status },
    select: USER_SELECT
  });
  await writeAuditLog(req, {
    action: status === "DISABLED" ? "USER_DISABLED" : "USER_ENABLED",
    targetType: "User",
    targetId: updated.id
  });
  return res.json(updated);
});

// ---------------------------------------------------------------------------
// ADMIN PASSWORD SET / RESET
// Works for an INVITED user too: the account becomes ACTIVE with the admin's
// password and the set-password link from the invite email stops working.
// A DISABLED user stays disabled — setting a password must not re-enable them.
// ---------------------------------------------------------------------------
router.patch("/:id/password", requirePermission("aplus.users.edit"), async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < MIN_PW) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PW} characters.` });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found." });

  const wasInvited = user.status === "INVITED";
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: req.params.id },
    data: {
      passwordHash,
      ...(wasInvited ? { status: "ACTIVE", activatedAt: new Date() } : {})
    }
  });
  await revokeInviteTokens(req.params.id);
  await writeAuditLog(req, {
    action: "USER_PASSWORD_RESET_BY_ADMIN",
    targetType: "User",
    targetId: req.params.id,
    metadata: { replacedPendingInvite: wasInvited }
  });
  return res.json({ message: "User password reset successfully." });
});

// ---------------------------------------------------------------------------
// DELETE USER
// ---------------------------------------------------------------------------
router.delete("/:id", requirePermission("aplus.users.delete"), async (req, res) => {
  if (req.params.id === req.user?.sub) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: USER_SELECT });
  if (!user) return res.status(404).json({ error: "User not found." });

  // Delete related tokens first, then the user
  await prisma.passwordResetToken.deleteMany({ where: { userId: req.params.id } });
  await prisma.user.delete({ where: { id: req.params.id } });

  await writeAuditLog(req, {
    action: "USER_DELETED",
    targetType: "User",
    targetId: req.params.id,
    metadata: { email: user.email, fullName: user.fullName }
  });
  return res.json({ success: true });
});

export default router;
