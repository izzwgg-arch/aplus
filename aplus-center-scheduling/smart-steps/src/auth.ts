// Server-only auth — imports Node.js crypto for JWT verification (NOT used in Edge/middleware)
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHmac } from "crypto";
import { authConfig } from "./auth.config";

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
          return {
            id: payload.sub,
            email: payload.email || payload.sub,
            name: payload.fullName || payload.email?.split("@")[0] || "User",
            role: payload.role || "RBT",
          };
        }

        // Standalone login (demo)
        const ok = password === "demo" || password === "password";
        if (!ok) return null;
        const role = credentials.email.toLowerCase().endsWith("@bcba.com")
          ? "BCBA"
          : credentials.email.toLowerCase().endsWith("@admin.com")
          ? "ADMIN"
          : "RBT";
        return {
          id: `user-${credentials.email}`,
          email: credentials.email,
          name: credentials.email.split("@")[0],
          role,
        };
      },
    }),
  ],
});
