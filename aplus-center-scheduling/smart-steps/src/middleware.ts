// Middleware uses edge-safe auth (no Node.js crypto)
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|api/sso|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
