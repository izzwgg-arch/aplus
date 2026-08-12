"use client";

import { usePermissions } from "@/hooks/usePermissions";
import { ShieldAlert } from "lucide-react";

/**
 * Client-side permission gate for pages. Direct navigation to a page without
 * the required permission renders an Access Denied state instead of the
 * page content — never just hides a nav link. Final enforcement always
 * happens server-side in the API route handlers; this component provides
 * the matching UX so users aren't shown broken/empty pages.
 */
export function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  children: React.ReactNode;
}) {
  const { can, canAny, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center text-zinc-500 text-sm">
        Loading…
      </div>
    );
  }

  const allowed = anyOf ? canAny(anyOf) : can(permission);
  if (!allowed) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-zinc-700" />
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Access denied</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          You don&apos;t have permission to view this page. Contact an administrator if you believe this is a mistake.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
