// Smart Steps ABA — next-auth v5 config
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHmac } from "crypto";

const APLUS_TOKEN_EMAIL = "__aplus_token__";

function verifyAPlusJwt(token: string, secret: string): { sub: string; email?: string; role?: string; fullName?: string } | null {
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

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || typeof credentials.email !== "string") return null;
        const password = typeof credentials.password === "string" ? credentials.password : "";

        // A+ Center SSO: accept main app JWT so user doesn't need a separate Smart Steps password
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

        // Demo / standalone login
        const ok = password === "demo" || password === "password";
        if (!ok) return null;
        const role = credentials.email.toLowerCase().endsWith("@bcba.com") ? "BCBA" : credentials.email.toLowerCase().endsWith("@admin.com") ? "ADMIN" : "RBT";
        return {
          id: `user-${credentials.email}`,
          email: credentials.email,
          name: credentials.email.split("@")[0],
          role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isLogin = path === "/login";
      const isSplash = path === "/";
      if (isSplash) return true;
      if (isLogin) return !!auth?.user ? Response.redirect(new URL("/dashboard", request.url)) : true;
      if (path.startsWith("/dashboard") || path.startsWith("/clients") || path.startsWith("/reports") || path.startsWith("/settings")) {
        return !!auth?.user ? true : Response.redirect(new URL("/login", request.url));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
};
