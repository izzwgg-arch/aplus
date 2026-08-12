import { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures (private mode / storage disabled).
  }
}

function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage remove failures.
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => safeGetItem("token"));
  const [user, setUser] = useState(() => {
    const raw = safeGetItem("user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      safeRemoveItem("user");
      return null;
    }
  });

  const login = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    safeSetItem("token", nextToken);
    safeSetItem("user", JSON.stringify(nextUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    safeRemoveItem("token");
    safeRemoveItem("user");
  };

  const value = useMemo(() => ({ token, user, login, logout, isAuthed: !!token }), [token, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
