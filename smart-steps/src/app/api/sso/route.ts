// Server-side SSO endpoint: verify A+ Center JWT and create a next-auth session directly.
// This avoids ALL client-side CSRF/fetch complexity.
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { encode } from "next-auth/jwt";
import { mapAplusRoleToSmartStepsRole } from "@/lib/roleMapping";
import { ensureUser } from "@/lib/ensureUser";

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

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  // Build the correct public origin using nginx-forwarded headers
  // (req.url is the internal localhost URL; use forwarded headers for the public URL)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "app.apluscenterinc.org";
  // Behind nginx in production, x-forwarded-proto is always set to "https". Only fall back to
  // the request's own protocol (e.g. "http" for direct local dev) when that header is absent —
  // previously this defaulted to a hardcoded "https", which caused the session cookie below to
  // be marked Secure/__Secure- on a plain http:// connection, silently dropped by the browser.
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const useSecureCookies = proto === "https";

  const failRedirect = new URL("/smart-steps/login?error=sso", origin);

  if (!token) return NextResponse.redirect(failRedirect);

  // Verify the JWT from the A+ Center main app
  const aplusSecret = process.env.APLUS_JWT_SECRET || process.env.JWT_SECRET || "dev-secret";
  const payload = verifyAPlusJwt(token, aplusSecret);
  if (!payload?.sub) return NextResponse.redirect(failRedirect);

  // Create a next-auth v5 session token directly (bypasses credentials flow entirely)
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) return NextResponse.redirect(failRedirect);

  // next-auth v5 only uses the __Secure- prefix when cookies are marked Secure (HTTPS)
  const cookieName = useSecureCookies ? "__Secure-authjs.session-token" : "authjs.session-token";

  const mappedRole = mapAplusRoleToSmartStepsRole(payload.role);
  const email = payload.email || payload.sub;
  const name = payload.fullName || (payload.email ? payload.email.split("@")[0] : "User");

  // Centralize DB sync here so every SSO login guarantees a matching SmartSteps
  // User row (with the correctly-mapped role) exists before any permission
  // check downstream can run against it.
  await ensureUser({ id: payload.sub, email, name, role: mappedRole });

  const sessionToken = await encode({
    token: {
      sub: payload.sub,
      email,
      name,
      role: mappedRole,
      id: payload.sub,
    },
    secret: authSecret,
    salt: cookieName,
    maxAge: 30 * 24 * 60 * 60,
  });

  const resp = NextResponse.redirect(new URL("/smart-steps/dashboard", origin));
  resp.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return resp;
}
