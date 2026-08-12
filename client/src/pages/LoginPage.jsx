import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";

const SUCCESS_MESSAGES = {
  invite: "Your account is ready! Sign in with your new password.",
  reset: "Your password has been reset. Please sign in with your new password."
};

// Dev-only quick login — stripped out of production builds entirely (import.meta.env.DEV
// is statically replaced by Vite, so this whole block is tree-shaken away when built for prod).
const DEV_ACCOUNTS = import.meta.env.DEV
  ? [
      { label: "Admin", email: "admin@apluscenter.local", password: "DevPass123!" },
      { label: "BCBA", email: "bcba@apluscenter.local", password: "DevPass123!" },
      { label: "Staff", email: "staff@apluscenter.local", password: "DevPass123!" }
    ]
  : [];

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const prefillEmail = searchParams.get("email") || "";
  const successKey = searchParams.get("success") || "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Update email field if query param changes (e.g. after redirect)
  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail);
  }, [prefillEmail]);

  const doLogin = async (loginEmail, loginPassword) => {
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/login", { email: loginEmail.trim(), password: loginPassword });
      login(data.token, data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.error || "Sign in failed. Please check your credentials.");
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    doLogin(email, password);
  };

  const handleDevLogin = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    doLogin(account.email, account.password);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-6 text-center">
        <p className="text-2xl font-bold tracking-tight text-slate-900">A+ Center</p>
      </div>

      <div className="card w-full max-w-md">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mb-5 text-sm text-slate-500">Enter your email and password to access your account.</p>

        {successKey && SUCCESS_MESSAGES[successKey] && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {SUCCESS_MESSAGES[successKey]}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

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

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <input
                className="saas-input pr-10"
                type={showPw ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                tabIndex={-1}
                className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700">
            Forgot password?
          </Link>
        </div>

        {DEV_ACCOUNTS.length > 0 && (
          <div className="mt-6 border-t border-dashed border-amber-300 pt-4">
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-600">
              Dev Login (local only)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DEV_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDevLogin(account)}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
