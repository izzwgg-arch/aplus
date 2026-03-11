// Smart Steps ABA — next-auth v5 config
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || typeof credentials.email !== "string") return null;
        // Demo: accept any email + password "demo" or "password"; in prod use Prisma + hash
        const password = typeof credentials.password === "string" ? credentials.password : "";
        const ok = password === "demo" || password === "password";
        if (!ok) return null;
        // Optional: lookup user in DB by email and attach role
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
