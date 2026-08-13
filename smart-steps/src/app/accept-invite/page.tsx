"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

const MIN_PASSWORD_LENGTH = 8;

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [checking, setChecking] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setChecking(false);
        setValidToken(false);
        return;
      }
      try {
        const r = await fetch(`/smart-steps/api/invite/validate?token=${encodeURIComponent(token)}`);
        const data = (await r.json()) as { valid: boolean; email?: string; name?: string };
        if (cancelled) return;
        setValidToken(!!data.valid);
        setEmail(data.email ?? null);
        setName(data.name ?? null);
      } catch {
        if (!cancelled) setValidToken(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/smart-steps/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not set your password.");
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card w-full max-w-sm p-8"
      >
        <h1 className="mb-2 text-center text-xl font-bold text-[var(--foreground)]">
          Smart Steps ABA Tracker
        </h1>

        {checking ? (
          <p className="mt-4 text-center text-sm text-zinc-500">Checking your invitation…</p>
        ) : !validToken ? (
          <>
            <p className="mb-6 text-center text-sm text-zinc-500">Invitation link</p>
            <p className="rounded-lg bg-[var(--accent-pink)]/20 px-3 py-3 text-center text-sm text-[var(--accent-pink)]">
              This invitation link is invalid or has expired. Please ask an administrator to send a new invite.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="btn-primary tap-target mt-6 w-full rounded-xl py-3"
            >
              Go to sign in
            </button>
          </>
        ) : done ? (
          <>
            <p className="mb-2 text-center text-sm text-zinc-500">Password set</p>
            <p className="rounded-lg bg-emerald-500/15 px-3 py-3 text-center text-sm text-emerald-400">
              Your account is ready. Redirecting you to sign in…
            </p>
          </>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-zinc-500">
              {name ? `Welcome, ${name}. ` : ""}Set a password to activate your account
              {email ? <span className="block text-zinc-600">{email}</span> : null}
            </p>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-400">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]"
                  required
                />
              </div>
              <div>
                <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-zinc-400">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]"
                  required
                />
              </div>
              {error && (
                <p className="rounded-lg bg-[var(--accent-pink)]/20 px-3 py-2 text-sm text-[var(--accent-pink)]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={saving}
                className="btn-primary tap-target w-full rounded-xl py-3 disabled:opacity-60"
              >
                {saving ? "Setting password…" : "Set password & activate"}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
          <div className="glass-card h-32 w-64 animate-pulse rounded-2xl" />
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}
