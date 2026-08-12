import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse, invalidateUserCache } from "@/lib/permissions";
import { auditLog } from "@/lib/auditLogger";
import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ userId: string }> };

const VALID_ROLES = ["RBT", "BCBA", "ADMIN"] as const;

type StaffRecord = { passwordHash?: string | null; [key: string]: unknown };

/** Strips the password hash and replaces it with a boolean before sending to the client. */
function serialize<T extends StaffRecord>(user: T) {
  const { passwordHash, ...rest } = user;
  return { ...rest, hasLocalLogin: passwordHash != null };
}

/**
 * GET /smart-steps/api/staff/[userId]
 * Returns a single staff member's full profile.
 * ADMIN / BCBA only.
 */
export async function GET(_req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.staff.view");
  if (denied) return denied;

  const { userId } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:          true,
        name:        true,
        email:       true,
        role:        true,
        displayRole: true,
        phone:       true,
        credentials: true,
        isActive:    true,
        createdAt:   true,
        passwordHash: true,
        assignedClients: {
          select: {
            role: true,
            client: { select: { id: true, name: true, isArchived: true } },
          },
        },
      },
    });

    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(serialize(user));
  } catch (err) {
    console.error("[staff/[userId] GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * PATCH /smart-steps/api/staff/[userId]
 * Updates a staff member's profile fields.
 * ADMIN only. Supports partial updates.
 * Allowed fields: name, email, role, displayRole, phone, credentials, isActive
 */
export async function PATCH(req: Request, { params }: Params) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.staff.edit");
  if (denied) return denied;

  const { userId } = await params;

  try {
    const body = await req.json();
    const { name, email, role, displayRole, phone, credentials, isActive, appRoleId, password, removeLocalLogin } = body;

    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name?.trim() || null;

    if (email !== undefined) {
      const normalized = email?.trim().toLowerCase();
      if (!normalized) return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 });
      const conflict = await prisma.user.findFirst({
        where: { email: normalized, NOT: { id: userId } },
      });
      if (conflict) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      data.email = normalized;
    }

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: "Invalid role. Must be RBT, BCBA, or ADMIN" }, { status: 400 });
      }
      const roleDenied = await requirePermissionResponse(user.id, "smartsteps.staff.manage_roles");
      if (roleDenied) return roleDenied;
      data.role = role;
    }

    if (displayRole !== undefined) data.displayRole = displayRole?.trim() || null;
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (credentials !== undefined) data.credentials = credentials?.trim() || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    let passwordChanged = false;
    if (password !== undefined && password !== "") {
      if (!isValidPassword(password)) {
        return NextResponse.json(
          { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
          { status: 400 }
        );
      }
      data.passwordHash = await hashPassword(password);
      passwordChanged = true;
    } else if (removeLocalLogin === true) {
      data.passwordHash = null;
      passwordChanged = true;
    }

    if (appRoleId !== undefined) {
      const roleDenied = await requirePermissionResponse(user.id, "smartsteps.staff.manage_roles");
      if (roleDenied) return roleDenied;
      const appRole = await prisma.appRole.findUnique({ where: { id: appRoleId } });
      if (!appRole || !appRole.isActive) {
        return NextResponse.json({ error: "Invalid or inactive role" }, { status: 400 });
      }
      data.appRoleId = appRole.id;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, name: true, email: true, role: true, displayRole: true,
        phone: true, credentials: true, isActive: true, createdAt: true,
        appRoleId: true, appRole: { select: { id: true, key: true, name: true } },
        passwordHash: true,
      },
    });

    if (appRoleId !== undefined) {
      invalidateUserCache(userId);
      await auditLog(user.id, "USER_ROLE_ASSIGNED", "User", userId, {
        appRoleId: updated.appRoleId,
        appRoleKey: updated.appRole?.key,
        appRoleName: updated.appRole?.name,
      });
    }

    if (passwordChanged) {
      await auditLog(user.id, "USER_PASSWORD_SET", "User", userId, {
        loginMethod: updated.passwordHash ? "local" : "sso",
      });
    }

    return NextResponse.json(serialize(updated));
  } catch (err) {
    console.error("[staff/[userId] PATCH]", err);
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}
