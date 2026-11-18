// Edge-safe auth config — no Node.js-only imports (used by middleware + auth.ts)
import type { NextAuthConfig } from "next-auth";

const APP_BASEPATH = "/smart-steps";

// Explicit allow-list of paths reachable WITHOUT an authenticated session.
// Everything else is denied by default (server-side redirect to /login), a
// deliberate change from the previous substring-based gate
// (`path.includes("/dashboard"|"/clients"|"/reports"|"/settings")`), which left
// every other page (e.g. /assessments, /goal-library, /staff,
// /goals-and-targets) rendering client-side with no server-side auth check.
const PUBLIC_EXACT_PATHS = [
  "/",
  "/login",
  APP_BASEPATH,
  `${APP_BASEPATH}/login`,
  "/accept-invite",
  `${APP_BASEPATH}/accept-invite`,
];
const PUBLIC_PREFIXES = [
  "/parent/",
  `${APP_BASEPATH}/parent/`, // parent portal: token-gated separately, not a staff session
  "/api/invite/",
  `${APP_BASEPATH}/api/invite/`, // invite token validate/accept: gated by the one-time token itself
];

function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export const authConfig: NextAuthConfig = {
  // NO basePath here. It is derived from AUTH_URL's pathname (/api/auth), which
  // matches what Next.js hands the route handler after stripping its own
  // basePath (/smart-steps). Setting basePath: "/smart-steps" (2026-11-17) made
  // every /smart-steps/api/auth/* request answer 400 "Bad request", so the
  // browser never got a session: no Sign out button, no permissions.
  providers: [], // Credentials provider added in auth.ts (server-only)
  pages: {
    signIn: "/smart-steps/login",
    error: "/smart-steps/login",  // send auth errors to login page (within smart-steps)
  },
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isLogin = path === "/login" || path === `${APP_BASEPATH}/login`;
      if (isLogin) return !!auth?.user ? Response.redirect(new URL(`${APP_BASEPATH}/dashboard`, request.url)) : true;
      if (isPublicPath(path)) return true;
      return !!auth?.user ? true : Response.redirect(new URL(`${APP_BASEPATH}/login`, request.url));
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
