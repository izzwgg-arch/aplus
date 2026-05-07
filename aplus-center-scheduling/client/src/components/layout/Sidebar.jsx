import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const SMART_STEPS_DASHBOARD_URL = "https://app.smartstepsabapc.org/dashboard";

const prefetchers = {
  "/aplus": () => import("../../pages/aplus/OverviewPage"),
  "/aplus/clients": () => import("../../pages/aplus/ClientsPage"),
  "/aplus/services": () => import("../../pages/aplus/ServicesPage"),
  "/aplus/providers": () => import("../../pages/aplus/ProvidersPage"),
  "/aplus/appointments": () => import("../../pages/aplus/AppointmentsPage"),
  "/aplus/reminders": () => import("../../pages/aplus/RemindersPage"),
  "/aplus/data-tracking": () => import("../../pages/aplus/DataTrackingPage"),
  "/aplus/assessments": () => import("../../pages/aplus/AssessmentsPage"),
  "/aplus/waitlist": () => import("../../pages/aplus/WaitlistPage"),
  "/aplus/invoices": () => import("../../pages/aplus/InvoicesPage"),
  "/aplus/payments": () => import("../../pages/aplus/PaymentsPage"),
  "/aplus/intake": () => import("../../pages/aplus/IntakeFormPage"),
  "/aplus/settings": () => import("../../pages/aplus/SettingsPage"),
  "/aplus/users": () => import("../../pages/aplus/UsersPage"),
  "/aplus/audit-logs": () => import("../../pages/aplus/AuditLogsPage")
};

const prefetchedRoutes = new Set();

function prefetchRoute(route) {
  if (prefetchedRoutes.has(route)) return;
  const prefetch = prefetchers[route];
  if (!prefetch) return;
  prefetchedRoutes.add(route);
  prefetch().catch(() => {
    prefetchedRoutes.delete(route);
  });
}

function MenuIcon({ path }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const links = [
  { to: "/aplus", label: "Overview", icon: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-10h8V3h-8z" },
  {
    external: true,
    href: SMART_STEPS_DASHBOARD_URL,
    label: "Smart Steps",
    icon: "M14 3h7v7m0 0L10 14M21 3v7h-7M10 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7"
  },
  { to: "/aplus/clients", label: "Clients", icon: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11A4 4 0 1 0 8.5 3a4 4 0 0 0 0 8m8 1a3 3 0 1 0 0-6m4 15v-2a4 4 0 0 0-3-3.87" },
  { to: "/aplus/services", label: "Services", icon: "M4 6h16M4 12h16M4 18h16M7 6v12M17 6v12" },
  { to: "/aplus/providers", label: "Providers", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11A4 4 0 1 0 9 3a4 4 0 0 0 0 8m12 10v-2a4 4 0 0 0-3-3.87m-2-8.13a4 4 0 1 1 0-8" },
  { to: "/aplus/appointments", label: "Appointments", icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" },
  { to: "/aplus/reminders", label: "Reminders", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { to: "/aplus/assessments", label: "Assessments", icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2M12 12h4M12 16h4M8 12h.01M8 16h.01" },
  { to: "/aplus/waitlist", label: "Waitlist", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { to: "/aplus/invoices", label: "Invoicing", icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h2" },
  { to: "/aplus/payments", label: "Payments", icon: "M2 7h20M2 12h20M2 17h20M6 4v16M18 4v16" },
  { to: "/aplus/intake", label: "Intake Form", icon: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" },
  { to: "/aplus/settings", label: "Settings", icon: "M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 3.64 1.7 1.7 0 0 0 10.03 2.1V2a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.06 3.64a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 1.55 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" },
  { to: "/aplus/users", label: "Users", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11A4 4 0 1 0 9 3a4 4 0 0 0 0 8m12 10v-2a4 4 0 0 0-3-3.87m-2-8.13a4 4 0 1 1 0-8" },
  { to: "/aplus/audit-logs", label: "Audit Logs", icon: "M9 17v-6M13 17V7M17 17v-3M4 19h16M6 19V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14" }
];

export default function Sidebar({ open, setOpen }) {
  const { logout } = useAuth();

  return (
    /*
     * Desktop: always fixed (position:fixed, inset-y-0 left-0).
     *          md:translate-x-0 keeps it visible.
     * Mobile:  slides off-screen via -translate-x-full, slides in when open=true.
     * REMOVED md:static — that was the bug (static = scrolls with body).
     */
    <aside
      style={{ background: "#F8FAFC", borderRight: "1px solid #EEF1F4" }}
      className={`fixed inset-y-0 left-0 z-20 flex h-screen w-56 flex-col p-3 transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
    >
      {/* Logo / branding */}
      <div className="mb-5 flex items-center justify-between px-2 pt-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold shadow-sm">A+</div>
            <div>
              <p className="text-xs font-bold tracking-wide text-blue-600 uppercase">A+ Center</p>
              <p className="text-[11px] text-slate-400 leading-none mt-0.5">Admin Panel</p>
            </div>
          </div>
        </div>
        <button
          style={{ borderRadius: 8, padding: "4px 10px", fontSize: 12 }}
          className="btn-secondary md:hidden"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>

      {/* Nav links */}
      <nav className="min-h-0 flex-1 overflow-y-auto pr-0.5" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {links.map((item) =>
          item.external ? (
            <a
              key={item.href}
              href={item.href}
              className="group flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-500 transition-all duration-150 hover:text-slate-800"
              style={{ borderRadius: 10 }}
              onClick={() => setOpen(false)}
            >
              <MenuIcon path={item.icon} />
              <span className="flex-1">{item.label}</span>
            </a>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "text-blue-700"
                    : "text-slate-500 hover:text-slate-800"
                }`
              }
              style={({ isActive }) => isActive
                ? { background: "#EEF6FF", borderRadius: 10, fontWeight: 600 }
                : { borderRadius: 10 }
              }
              onClick={() => setOpen(false)}
              onMouseEnter={() => prefetchRoute(item.to)}
              onFocus={() => prefetchRoute(item.to)}
            >
              <MenuIcon path={item.icon} />
              {item.label}
            </NavLink>
          )
        )}
      </nav>

      {/* Sign out */}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid #EEF1F4" }}>
        <button
          type="button"
          className="btn-secondary w-full justify-center"
          style={{ borderRadius: 10, fontSize: 13 }}
          onClick={logout}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
