// Middleware uses edge-safe auth (no Node.js crypto)
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

// manifest.json and sw.js must be publicly fetchable: both are requested on the
// login page, before any session exists, and auth-gating them answered the
// browser with a 302 to /login instead of the file.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|api/auth|api/sso|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
