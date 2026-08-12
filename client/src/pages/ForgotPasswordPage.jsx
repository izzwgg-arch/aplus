import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch {
      // Show neutral message even on network error to avoid info leakage
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-6 text-center">
        <p className="text-2xl font-bold tracking-tight text-slate-900">A+ Center</p>
      </div>

      <div className="card w-full max-w-md">
        {sent ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Check your email</h2>
              <p className="mt-1 text-sm text-slate-600">
                If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent password reset instructions.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Didn&apos;t get it? Check your spam folder, or{" "}
                <button
                  className="underline hover:text-slate-600"
                  onClick={() => { setSent(false); setEmail(""); }}
                >
                  try again
                </button>
                .
              </p>
            </div>
            <Link to="/login" className="mt-1 text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900">
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-semibold text-slate-900">Forgot password?</h1>
            <p className="mb-5 text-sm text-slate-500">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email address</label>
                <input
                  className="saas-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <button className="btn-primary w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-500">
              <Link to="/login" className="underline hover:text-slate-700">
                Back to login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
