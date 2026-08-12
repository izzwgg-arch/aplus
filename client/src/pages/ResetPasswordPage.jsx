import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";

const MIN_PW = 8;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell title="Reset password">
        <TokenErrorState message="No reset token was found in the link. Please use the link from your password reset email." />
      </AuthShell>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PW) {
      setError(`Password must be at least ${MIN_PW} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/reset-password", { token, password, confirmPassword: confirm });
      setDone(true);
      setTimeout(() => {
        navigate(`/login?email=${encodeURIComponent(data.email || "")}&success=reset`);
      }, 2500);
    } catch (err) {
      setError(err?.response?.data?.error || "Something went wrong. Please try again.");
      setErrorCode(err?.response?.data?.code || "");
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Reset password">
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900">Password updated!</h2>
            <p className="mt-1 text-sm text-slate-600">Your password has been reset. Redirecting you to login…</p>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset password">
      <p className="mb-5 text-sm text-slate-500">Enter a new password for your account.</p>

      {(errorCode === "EXPIRED" || errorCode === "ALREADY_USED") ? (
        <div className="space-y-4">
          <TokenErrorState message={error} />
          <Link
            to="/forgot-password"
            className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* New password */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
            <div className="relative">
              <input
                className="saas-input pr-10"
                type={showPw ? "text" : "password"}
                placeholder={`At least ${MIN_PW} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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

          {/* Confirm */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm new password</label>
            <input
              className={`saas-input ${confirm && confirm !== password ? "border-red-400" : ""}`}
              type={showPw ? "text" : "password"}
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirm && confirm !== password && (
              <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button
            className="btn-primary w-full"
            disabled={submitting || password.length < MIN_PW || password !== confirm}
          >
            {submitting ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-xs text-slate-400">
        <Link to="/login" className="underline hover:text-slate-600">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}

function TokenErrorState({ message }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
        <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <p className="text-center text-sm text-slate-600">{message}</p>
    </div>
  );
}

function AuthShell({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-6 text-center">
        <p className="text-2xl font-bold tracking-tight text-slate-900">A+ Center</p>
      </div>
      <div className="card w-full max-w-md">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  );
}
