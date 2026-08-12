import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";

const MIN_PW = 8;

function PasswordStrengthBar({ password }) {
  const len = password.length;
  const strength = len === 0 ? 0 : len < MIN_PW ? 1 : len < 12 ? 2 : 3;
  const labels = ["", "Too short", "Fair", "Strong"];
  const colors = ["bg-slate-200", "bg-red-400", "bg-yellow-400", "bg-emerald-500"];
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((n) => (
          <div key={n} className={`h-1.5 flex-1 rounded-full transition-colors ${strength >= n ? colors[strength] : "bg-slate-200"}`} />
        ))}
      </div>
      {password.length > 0 && (
        <p className={`mt-1 text-xs ${strength === 1 ? "text-red-500" : strength === 2 ? "text-yellow-600" : "text-emerald-600"}`}>
          {labels[strength]}
        </p>
      )}
    </div>
  );
}

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");

  const [phase, setPhase] = useState("loading"); // loading | form | error | success
  const [userData, setUserData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Validate the token on load
  useEffect(() => {
    if (!token) {
      setErrorMsg("No invitation token was found in the link. Please check your email and try again.");
      setPhase("error");
      return;
    }
    api
      .get(`/auth/invite/validate?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setUserData(data);
        setPhase("form");
      })
      .catch((err) => {
        setErrorMsg(err?.response?.data?.error || "This invitation link is invalid or has expired.");
        setErrorCode(err?.response?.data?.code || "");
        setPhase("error");
      });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (password.length < MIN_PW) {
      setFormError(`Password must be at least ${MIN_PW} characters.`);
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/invite/accept", { token, password, confirmPassword: confirm });
      setPhase("success");
      // Redirect to login after 2.5 s, pre-filling email
      setTimeout(() => {
        navigate(`/login?email=${encodeURIComponent(data.email)}&success=invite`);
      }, 2500);
    } catch (err) {
      setFormError(err?.response?.data?.error || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  // ── LOADING ──────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <AuthShell>
        <div className="py-8 text-center text-slate-500 text-sm">Verifying invitation link…</div>
      </AuthShell>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900">Invalid invitation link</h2>
            <p className="mt-1 text-sm text-slate-600">{errorMsg}</p>
          </div>
          {errorCode === "EXPIRED" && (
            <p className="text-xs text-slate-500 text-center">
              Contact your administrator and ask them to resend your invitation.
            </p>
          )}
          <Link to="/login" className="text-sm text-slate-700 underline underline-offset-2 hover:text-slate-900">
            Back to login
          </Link>
        </div>
      </AuthShell>
    );
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (phase === "success") {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900">Account activated!</h2>
            <p className="mt-1 text-sm text-slate-600">Your password has been set. Redirecting you to the login page…</p>
          </div>
        </div>
      </AuthShell>
    );
  }

  // ── FORM ──────────────────────────────────────────────────────────────────
  return (
    <AuthShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Set your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Welcome{userData?.fullName ? `, ${userData.fullName}` : ""}! Create a password for{" "}
          <span className="font-medium text-slate-700">{userData?.email}</span> to activate your account.
        </p>
      </div>

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
          <PasswordStrengthBar password={password} />
        </div>

        {/* Confirm password */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
          <input
            className={`saas-input ${confirm && confirm !== password ? "border-red-400 focus:ring-red-400" : ""}`}
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

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <button
          className="btn-primary w-full"
          disabled={submitting || password.length < MIN_PW || password !== confirm}
        >
          {submitting ? "Activating account…" : "Set password & activate account"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-slate-400">
        Already have access?{" "}
        <Link to="/login" className="underline hover:text-slate-600">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="mb-6 text-center">
        <p className="text-2xl font-bold tracking-tight text-slate-900">A+ Center</p>
      </div>
      <div className="card w-full max-w-md">{children}</div>
    </div>
  );
}
