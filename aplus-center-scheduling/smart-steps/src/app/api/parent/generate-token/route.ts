import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { requirePermissionResponse } from "@/lib/permissions";
import { createHmac } from "crypto";

function getSecret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "fallback-secret";
}

export function signParentToken(clientId: string, expiresAt: number): string {
  const payload = `${clientId}:${expiresAt}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex").slice(0, 24);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyParentToken(token: string): { clientId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;
    const [clientId, expiresAt, sig] = parts;
    if (Date.now() > Number(expiresAt)) return null;
    const payload = `${clientId}:${expiresAt}`;
    const expected = createHmac("sha256", getSecret()).update(payload).digest("hex").slice(0, 24);
    if (sig !== expected) return null;
    return { clientId };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await requireSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requirePermissionResponse(user.id, "smartsteps.parent_portal.manage");
  if (denied) return denied;

  const { clientId, expiryDays = 30 } = await req.json();
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const token = signParentToken(clientId, expiresAt);

  const basePath = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
  const url = `${basePath}/smart-steps/parent/${clientId}?token=${token}`;

  return NextResponse.json({ token, url, expiresAt: new Date(expiresAt).toISOString() });
}
