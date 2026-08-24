import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { auditLog } from "@/lib/auditLogger";
import { sendInvite } from "@/lib/invite";
import { prisma } from "@/lib/db";

const VALID_ROLES = ["RBT", "BCBA", "ADMIN"] as const;

const STAFF_SELECT = {
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
  appRoleId:   true,
  appRole:     { select: { id: true, key: true, name: true } },
  passwordHash: true,
  assignedClients: {
    select: {
      role: true,
      client: { select: { id: true, name: true, isArchived: true } },
    },
  },
} as const;

type StaffRecord = { passwordHash: string | null; [key: string]: unknown };

/** Strips the password hash and replaces it with a boolean before sending to the client. */
function serialize<T extends StaffRecord>(user: T) {
  const { passwordHash, ...rest } = user;
  return { ...rest, hasLocalLogin: passwordHash !== null };
}

/**
 * GET /smart-steps/api/staff
 * Returns staff list with their client assignments.
 * Query: ?includeInactive=1 to include inactive users (default: active only).
 * ADMIN / BCBA only.
 */
export async function GET(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.staff.view");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "1";

  try {
    const users = await prisma.user.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: STAFF_SELECT,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(users.map(serialize));
  } catch (err) {
    console.error("[staff GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * POST /smart-steps/api/staff
 * Creates a new SmartSteps user profile by email.
 * ADMIN only.
 *
 * Login method is chosen by the caller (`loginMethod`):
 * - "sso" (or omit password): SSO-linked profile — the user logs in via A+
 *   Center SSO with a matching email.
 * - "local" (with `password`): standalone account with an admin-set password.
 * - "invite": creates the account with no password, emails the user a
 *   one-time link to set their own password and activate the account.
 * - "none": record-only provider — no email, no password, no way to sign in.
 *   Exists so the person's name can be picked as the provider on a session or
 *   note; an email can be added later to turn it into a real login.
 */
export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.staff.create");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { name, email, role, displayRole, phone, credentials, password, loginMethod } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role. Must be RBT, BCBA, or ADMIN" }, { status: 400 });
    }

    // Record-only provider: a name to pick as the provider on a session or
    // note, with no login. Every other method signs the person in BY email, so
    // the address stays mandatory for those.
    const isRecordOnly = loginMethod === "none";
    if (!isRecordOnly && !email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const isInvite = !isRecordOnly && loginMethod === "invite";

    let passwordHash: string | null = null;
    if (!isRecordOnly && !isInvite && password !== undefined && password !== "") {
      if (!isValidPassword(password)) {
        return NextResponse.json(
          { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
          { status: 400 }
        );
      }
      passwordHash = await hashPassword(password);
    }

    const normalized: string | null = isRecordOnly ? null : email.trim().toLowerCase();
    if (normalized) {
      const existing = await prisma.user.findUnique({ where: { email: normalized } });
      if (existing) {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
    }

    // Assign the default AppRole matching the legacy role (keys align: RBT/BCBA/
    // ADMIN) so the new account has working permissions immediately — otherwise
    // the fail-closed resolver grants zero access until manually role-assigned.
    const defaultAppRole = await prisma.appRole.findUnique({
      where: { key: role },
      select: { id: true, isActive: true },
    });

    const created = await prisma.user.create({
      data: {
        email:       normalized,
        name:        name.trim(),
        role,
        displayRole: displayRole?.trim() || null,
        phone:       phone?.trim() || null,
        credentials: credentials?.trim() || null,
        isActive:    true,
        passwordHash,
        invitedAt:   isInvite ? new Date() : null,
        appRoleId:   defaultAppRole?.isActive ? defaultAppRole.id : null,
      },
      select: STAFF_SELECT,
    });

    await auditLog(user.id, isInvite ? "USER_INVITED" : "USER_CREATED", "User", created.id, {
      email: normalized,
      role,
      loginMethod: isRecordOnly ? "none" : isInvite ? "invite" : passwordHash ? "local" : "sso",
    });

    if (isInvite && created.email) {
      try {
        await sendInvite({ id: created.id, email: created.email, name: created.name });
      } catch (err) {
        console.error("[staff POST] invite email failed:", err);
        return NextResponse.json(
          {
            ...serialize(created),
            _warning:
              "Account created, but the invitation email could not be sent. Use \u201cResend invite\u201d once email is configured.",
          },
          { status: 201 }
        );
      }
    }

    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    console.error("[staff POST]", err);
    return NextResponse.json({ error: "Failed to create staff member" }, { status: 500 });
  }
}
