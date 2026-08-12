import { Link } from "react-router-dom";

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="card max-w-xl w-full text-center">
        <h1 className="text-2xl font-semibold mb-3 text-slate-900">Smart Steps ABA Tracker</h1>
        <p className="text-slate-600 mb-6">Coming soon - ABA data tracking under construction.</p>
        <Link to="/dashboard" className="btn-primary">Back to dashboard</Link>
      </div>
    </div>
  );
}
