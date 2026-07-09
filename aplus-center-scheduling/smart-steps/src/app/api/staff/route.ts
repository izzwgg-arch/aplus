import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { hashPassword, isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { auditLog } from "@/lib/auditLogger";
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
 * Login method is chosen by the caller:
 * - Omit `password` (or send loginMethod: "sso") to create an SSO-linked
 *   profile — the user must log in via A+ Center SSO with a matching email.
 * - Provide `password` (loginMethod: "local") to create a standalone
 *   SmartSteps-only account that logs in directly, independent of A+ Center.
 */
export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requirePermissionResponse(user.id, "smartsteps.staff.create");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { name, email, role, displayRole, phone, credentials, password } = body;

    if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role. Must be RBT, BCBA, or ADMIN" }, { status: 400 });
    }

    let passwordHash: string | null = null;
    if (password !== undefined && password !== "") {
      if (!isValidPassword(password)) {
        return NextResponse.json(
          { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
          { status: 400 }
        );
      }
      passwordHash = await hashPassword(password);
    }

    const normalized = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

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
      },
      select: STAFF_SELECT,
    });

    await auditLog(user.id, "USER_CREATED", "User", created.id, {
      email: normalized,
      role,
      loginMethod: passwordHash ? "local" : "sso",
    });

    return NextResponse.json(serialize(created), { status: 201 });
  } catch (err) {
    console.error("[staff POST]", err);
    return NextResponse.json({ error: "Failed to create staff member" }, { status: 500 });
  }
}
