import { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

const SMART_STEPS_URL = import.meta.env.VITE_SMART_STEPS_URL;

export default function RedirectToSmartSteps() {
  const { token, isAuthed } = useAuth();

  useEffect(() => {
    if (!isAuthed || !token) return;
    const base = SMART_STEPS_URL || (window.location.origin + "/smart-steps");
    const url = new URL(base);
    url.hash = "token=" + encodeURIComponent(token);
    window.location.href = url.toString();
  }, [token, isAuthed]);

  if (!isAuthed) return null;
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-600">Taking you to Smart Steps ABA Tracker…</p>
    </div>
  );
}
