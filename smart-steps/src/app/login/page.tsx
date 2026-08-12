"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

// Dev-only quick login — process.env.NODE_ENV is statically replaced at build time,
// so this is compiled out entirely in production builds regardless of server config.
const DEV_ACCOUNTS =
  process.env.NODE_ENV !== "production"
    ? [
        { label: "Admin", email: "admin@admin.com", password: "demo" },
        { label: "BCBA", email: "bcba@bcba.com", password: "demo" },
        { label: "RBT", email: "rbt@example.org", password: "demo" },
      ]
    : [];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doLogin(email, password);
  }

  function onDevLogin(account: { email: string; password: string }) {
    setEmail(account.email);
    setPassword(account.password);
    doLogin(account.email, account.password);
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
        <p className="mb-6 text-center text-sm text-zinc-500">Sign in to continue</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-[var(--foreground)] placeholder:text-zinc-500 focus:border-[var(--accent-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
            disabled={loading}
            className="btn-primary tap-target w-full rounded-xl py-3 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {DEV_ACCOUNTS.length > 0 && (
          <div className="mt-6 border-t border-dashed border-amber-500/30 pt-4">
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-500">
              Dev Login (local only)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEV_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={loading}
                  onClick={() => onDevLogin(account)}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-xs font-semibold text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[var(--background)]"><div className="glass-card h-32 w-64 animate-pulse rounded-2xl" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
