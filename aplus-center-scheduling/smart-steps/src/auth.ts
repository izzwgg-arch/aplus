// Server-only auth — imports Node.js crypto for JWT verification (NOT used in Edge/middleware)
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHmac } from "crypto";
import { authConfig } from "./auth.config";
import { mapAplusRoleToSmartStepsRole } from "./lib/roleMapping";
import { ensureUser } from "./lib/ensureUser";
import { verifyPassword } from "./lib/password";
import { auditLog } from "./lib/auditLogger";
import { prisma } from "./lib/db";

const APLUS_TOKEN_EMAIL = "__aplus_token__";

function verifyAPlusJwt(
  token: string,
  secret: string
): { sub: string; email?: string; role?: string; fullName?: string } | null {
  try {
    const [headerB64, payloadB64, sigB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    const toSign = `${headerB64}.${payloadB64}`;
    const sig = createHmac("sha256", secret).update(toSign).digest("base64url");
    if (sig !== sigB64) return null;
    return payload;
  } catch {
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || typeof credentials.email !== "string") return null;
        const password = typeof credentials.password === "string" ? credentials.password : "";

        // A+ Center SSO: accept main app JWT — no separate Smart Steps password needed
        if (credentials.email === APLUS_TOKEN_EMAIL && password) {
          const secret = process.env.APLUS_JWT_SECRET || process.env.JWT_SECRET;
          if (!secret) return null;
          const payload = verifyAPlusJwt(password, secret);
          if (!payload?.sub) return null;
          const role = mapAplusRoleToSmartStepsRole(payload.role);
          const email = payload.email || payload.sub;
          const name = payload.fullName || payload.email?.split("@")[0] || "User";
          await ensureUser({ id: payload.sub, email, name, role });
          return { id: payload.sub, email, name, role };
        }

        // Standalone SmartSteps-only login: for accounts created directly in
        // SmartSteps (Settings → Staff → Add Staff → Local password), independent
        // of any A+ Center account. Always enabled — gated purely by whether the
        // account has a passwordHash set (Admin opt-in per user).
        const normalizedEmail = credentials.email.trim().toLowerCase();
        const localUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true },
        });
        if (localUser?.passwordHash) {
          if (!localUser.isActive) return null;
          const valid = await verifyPassword(password, localUser.passwordHash);
          if (!valid) return null;
          // Backfill appRoleId the same way SSO/demo logins do — otherwise a
          // brand-new local-password account has appRoleId=null and the
          // fail-closed permission resolver gives it zero access.
          await ensureUser({
            id: localUser.id,
            email: localUser.email,
            name: localUser.name,
            role: localUser.role,
          });
          await auditLog(localUser.id, "MANUAL_LOGIN", "User", localUser.id, { method: "local_password" });
          return {
            id: localUser.id,
            email: localUser.email,
            name: localUser.name ?? localUser.email.split("@")[0],
            role: localUser.role,
          };
        }

        // Standalone/demo login — disabled by default. Only intended for local
        // development; NEVER enable in production. Real users must go through
        // SSO from A+ Center Scheduling or a Local password account above.
        if (process.env.ALLOW_DEMO_LOGIN !== "true") return null;
        const ok = password === "demo" || password === "password";
        if (!ok) return null;
        const role = credentials.email.toLowerCase().endsWith("@bcba.com")
          ? "BCBA"
          : credentials.email.toLowerCase().endsWith("@admin.com")
          ? "ADMIN"
          : "RBT";
        const id = `user-${credentials.email}`;
        await ensureUser({ id, email: credentials.email, name: credentials.email.split("@")[0], role });
        return {
          id,
          email: credentials.email,
          name: credentials.email.split("@")[0],
          role,
        };
      },
    }),
  ],
});
