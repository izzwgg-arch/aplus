// Edge-safe auth config — no Node.js-only imports (used by middleware + auth.ts)
import type { NextAuthConfig } from "next-auth";

const APP_BASEPATH = "/smart-steps";

export const authConfig: NextAuthConfig = {
  // basePath is derived from AUTH_URL env var pathname: /api/auth (matches what Next.js delivers to handlers after stripping basePath /smart-steps)
  providers: [], // Credentials provider added in auth.ts (server-only)
  pages: {
    signIn: "/smart-steps/login",
    error: "/smart-steps/login",  // send auth errors to login page (within smart-steps)
  },
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isLogin = path === "/login" || path === `${APP_BASEPATH}/login`;
      const isSplash = path === "/" || path === APP_BASEPATH;
      if (isSplash) return true;
      if (isLogin) return !!auth?.user ? Response.redirect(new URL(`${APP_BASEPATH}/dashboard`, request.url)) : true;
      if (
        path.includes("/dashboard") ||
        path.includes("/clients") ||
        path.includes("/reports") ||
        path.includes("/settings")
      ) {
        return !!auth?.user ? true : Response.redirect(new URL(`${APP_BASEPATH}/login`, request.url));
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
