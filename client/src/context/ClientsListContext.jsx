import { createContext, useCallback, useContext, useState } from "react";

/**
 * In-memory cache for the Clients directory list and scroll position.
 * Survives navigation (Clients → Client Profile → back to Clients) so we can
 * render the previous list at the previous scroll position immediately,
 * avoiding load-then-restore race and scroll jump.
 */
const ClientsListContext = createContext(null);

export function ClientsListProvider({ children }) {
  const [cache, setCache] = useState(null);

  const updateCache = useCallback((updates) => {
    setCache((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <ClientsListContext.Provider value={{ cache, updateCache }}>
      {children}
    </ClientsListContext.Provider>
  );
}

export function useClientsListCache() {
  const ctx = useContext(ClientsListContext);
  if (!ctx) return null;
  return ctx;
}
