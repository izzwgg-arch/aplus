import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Topbar({ onMenuClick }) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 md:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="md:hidden btn-secondary px-3 py-2" onClick={onMenuClick}>
            Menu
          </button>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">A+ Center</p>
            <p className="text-sm text-slate-600">Welcome, {user?.fullName || "User"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dashboard" className="btn-secondary">
            Back to dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
