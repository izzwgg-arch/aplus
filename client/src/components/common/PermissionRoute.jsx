import { Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { usePermissions } from "../../context/PermissionsContext";

function AccessDenied() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-slate-900">Access denied</h1>
      <p className="max-w-sm text-sm text-slate-500">
        You don&apos;t have permission to view this page. Contact an administrator if you believe this is a mistake.
      </p>
    </div>
  );
}

/**
 * Checks a permission key before rendering `children`. Direct URL access
 * without the required permission renders an Access Denied state (or
 * redirects if `redirect` is set) — never just hides UI. Assumes the caller
 * is already inside an authenticated layout (see `PermissionRoute` below for
 * a variant that also enforces authentication).
 *
 * Usage: <RequirePermission permission="aplus.users.view"><UsersPage /></RequirePermission>
 * Or with any-of: <RequirePermission anyOf={["aplus.reports.view"]}>...
 */
export function RequirePermission({ permission, anyOf, redirect = false, children }) {
  const { can, canAny, isLoading } = usePermissions();

  if (isLoading) {
    return <div className="flex h-full min-h-[50vh] items-center justify-center text-slate-500">Loading…</div>;
  }

  const allowed = anyOf ? canAny(anyOf) : can(permission);
  if (!allowed) {
    return redirect ? <Navigate to="/aplus" replace /> : <AccessDenied />;
  }
  return children;
}

/**
 * Wraps ProtectedRoute (authentication) and additionally checks a permission
 * key before rendering `children`. Use for routes not already nested inside
 * an authenticated layout.
 */
export default function PermissionRoute({ permission, anyOf, redirect = false, children }) {
  return (
    <ProtectedRoute>
      <RequirePermission permission={permission} anyOf={anyOf} redirect={redirect}>
        {children}
      </RequirePermission>
    </ProtectedRoute>
  );
}
