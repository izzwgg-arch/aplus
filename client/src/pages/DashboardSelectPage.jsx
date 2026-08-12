import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function DashboardSelectPage() {
  useEffect(() => {
    const prefetchLikelyRoutes = () => {
      import("./aplus/ClientsPage");
      import("./aplus/AppointmentsPage");
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => prefetchLikelyRoutes(), { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }

    const timeoutId = window.setTimeout(prefetchLikelyRoutes, 500);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mb-8 text-sm text-slate-500">Select a workspace to continue.</p>
        <div className="grid md:grid-cols-2 gap-6">
          <Link to="/aplus" className="card text-slate-900 hover:shadow-lg transition">
            <h2 className="text-2xl font-semibold mb-2">A+ Center</h2>
            <p>Scheduling and clinic operations</p>
          </Link>
          <Link to="/smart-steps" className="card text-slate-900 hover:shadow-lg transition">
            <h2 className="text-2xl font-semibold mb-2">Smart Steps ABA Tracker</h2>
            <p>ABA data tracking workspace</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
