"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useCallback, useMemo } from "react";

type PermissionsResponse = { permissions: string[]; roleKey: string | null };

async function fetchPermissions(): Promise<PermissionsResponse> {
  const res = await fetch("/smart-steps/api/permissions/me");
  if (!res.ok) throw new Error("Failed to load permissions");
  return res.json();
}

/**
 * Fetches the current user's effective permission keys and exposes
 * can()/canAny()/canAll() helpers. Short stale time (matches the global
 * QueryClient default of 30s) so a role/permission edit made elsewhere takes
 * effect for an already-logged-in user promptly.
 */
export function usePermissions() {
  const { status } = useSession();
  const enabled = status === "authenticated";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["permissions", "me"],
    queryFn: fetchPermissions,
    enabled,
    staleTime: 30 * 1000,
  });

  const set = useMemo(() => new Set(data?.permissions ?? []), [data]);

  const can = useCallback((key?: string | null) => {
    if (!key) return true;
    if (!data) return false; // fail closed while loading / unauthenticated
    return set.has(key);
  }, [data, set]);

  const canAny = useCallback((keys?: string[] | null) => {
    if (!keys || keys.length === 0) return true;
    if (!data) return false;
    return keys.some((k) => set.has(k));
  }, [data, set]);

  const canAll = useCallback((keys?: string[] | null) => {
    if (!keys || keys.length === 0) return true;
    if (!data) return false;
    return keys.every((k) => set.has(k));
  }, [data, set]);

  return {
    permissions: data?.permissions ?? [],
    roleKey: data?.roleKey ?? null,
    isLoading: enabled ? isLoading : false,
    can,
    canAny,
    canAll,
    refresh: refetch,
  };
}
