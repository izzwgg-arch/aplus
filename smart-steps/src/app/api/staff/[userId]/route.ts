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
        invitedAt:   true,
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
 *
 * Sending an empty `email` turns the account into a record-only provider: the
 * address is cleared and every login is revoked with it (password + pending
 * invite), because every sign-in path here identifies the person BY email.
 * Clearing your own email is refused — it would lock you out.
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

    let clearingEmail = false;
    if (email !== undefined) {
      const normalized = email?.trim().toLowerCase();
      if (!normalized) {
        if (userId === user.id) {
          return NextResponse.json(
            { error: "You cannot remove the email address from your own account" },
            { status: 400 }
          );
        }
        clearingEmail = true;
        data.email = null;
      } else {
        const conflict = await prisma.user.findFirst({
          where: { email: normalized, NOT: { id: userId } },
          select: {
            id: true,
            name: true,
            _count: { select: { assignedClients: true, sessions: true, notes: true } },
          },
        });
        // Name the record that holds the address. A bare "Email already in use"
        // is unactionable: the holder is usually a second, empty record for the
        // SAME person (someone adds the staff member again under their work
        // email, then tries to move the original record onto it), and the admin
        // has no way to tell which record to deal with. Say whether the blocking
        // record has any history, since an empty one is safe to delete.
        if (conflict) {
          const c = conflict._count;
          const isEmpty = c.assignedClients === 0 && c.sessions === 0 && c.notes === 0;
          return NextResponse.json(
            {
              error:
                `That email is already on another staff record — ${conflict.name ?? "unnamed"}` +
                (isEmpty
                  ? ", which has no clients, sessions or notes. If it is a duplicate of this person, delete it and then set this email again."
                  : ` (${c.assignedClients} client(s), ${c.sessions} session(s), ${c.notes} note(s)). Change or clear the email on that record first.`),
              conflictUserId: conflict.id,
              conflictIsEmpty: isEmpty,
            },
            { status: 409 }
          );
        }
        data.email = normalized;
      }
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

    // No email means no way to sign in — drop the password and any pending
    // invite rather than leaving credentials nothing can authenticate against.
    if (clearingEmail) {
      data.passwordHash = null;
      data.invitedAt = null;
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
        loginMethod: updated.passwordHash ? "local" : updated.email ? "sso" : "none",
      });
    }

    return NextResponse.json(serialize(updated));
  } catch (err) {
    console.error("[staff/[userId] PATCH]", err);
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}
