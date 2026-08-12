import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RemindersSettingsTab } from "./RemindersSettingsTab";

export default function RemindersPage() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reminders</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set when reminders go out, edit the messages clients and staff receive, and manage VoIP.ms. The same options appear under{" "}
          <Link to="/aplus/settings" className="text-indigo-600 hover:underline font-medium">Settings → Reminders</Link>.
        </p>
      </div>
      <div className="card">
        <RemindersSettingsTab isAdmin={isAdmin} toast={toast} />
      </div>
    </div>
  );
}
