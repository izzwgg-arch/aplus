import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";
import { useAuth } from "./AuthContext";

const PermissionsContext = createContext(null);

// Short stale time so a role/permission edit made by an admin takes effect
// for an already-logged-in user within ~30s, without hammering the API.
const REFRESH_MS = 30000;

export function PermissionsProvider({ children }) {
  const { isAuthed } = useAuth();
  const [permissions, setPermissions] = useState(null); // null = not loaded yet
  const [roleKey, setRoleKey] = useState(null);
  const [isLoading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!isAuthed) {
      setPermissions(new Set());
      setRoleKey(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/permissions");
      setPermissions(new Set(data.permissions || []));
      setRoleKey(data.roleKey || null);
    } catch {
      setPermissions(new Set());
      setRoleKey(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthed]);

  useEffect(() => {
    load();
    timerRef.current = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timerRef.current);
  }, [load]);

  const can = useCallback((key) => {
    if (!key) return true;
    if (!permissions) return false; // fail closed while loading
    return permissions.has(key);
  }, [permissions]);

  const canAny = useCallback((keys) => {
    if (!keys || keys.length === 0) return true;
    if (!permissions) return false;
    return keys.some((k) => permissions.has(k));
  }, [permissions]);

  const canAll = useCallback((keys) => {
    if (!keys || keys.length === 0) return true;
    if (!permissions) return false;
    return keys.every((k) => permissions.has(k));
  }, [permissions]);

  const value = useMemo(() => ({
    permissions: permissions ? [...permissions] : [],
    roleKey,
    isLoading,
    can,
    canAny,
    canAll,
    refresh: load
  }), [permissions, roleKey, isLoading, can, canAny, canAll, load]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    // Fail closed if used outside the provider rather than throwing, so a
    // missing provider never accidentally grants access.
    return { permissions: [], roleKey: null, isLoading: true, can: () => false, canAny: () => false, canAll: () => false, refresh: () => {} };
  }
  return ctx;
}
