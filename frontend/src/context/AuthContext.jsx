import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { authLogin, authRegister, fetchAuthMe, setAuthToken } from "../services/api";

const AUTH_TOKEN_KEY = "auth-token";
const AUTH_USER_KEY = "auth-user";

const AuthContext = createContext(null);

function readStoredUser() {
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => window.localStorage.getItem(AUTH_TOKEN_KEY) || "");
  const [user, setUser] = useState(readStoredUser);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      if (!token) {
        if (mounted) {
          setIsChecking(false);
        }
        return;
      }

      try {
        const profile = await fetchAuthMe();
        if (!mounted) {
          return;
        }
        setUser(profile);
        window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
      } catch {
        if (!mounted) {
          return;
        }
        setToken("");
        setUser(null);
        setAuthToken("");
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        window.localStorage.removeItem(AUTH_USER_KEY);
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [token]);

  const applyAuthResponse = (response) => {
    const nextToken = response?.access_token || "";
    const nextUser = response?.user || null;

    if (!nextToken || !nextUser) {
      throw new Error("Authentication response is incomplete.");
    }

    setToken(nextToken);
    setUser(nextUser);
    setAuthToken(nextToken);
    window.localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
    return nextUser;
  };

  const registerWithPassword = async ({ name, email, password, role, department }) => {
    const response = await authRegister({ name, email, password, role, department });
    return applyAuthResponse(response);
  };

  const loginWithPassword = async ({ email, password }) => {
    const response = await authLogin({ email, password });
    return applyAuthResponse(response);
  };

  const logout = () => {
    setToken("");
    setUser(null);
    setAuthToken("");
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_USER_KEY);
  };

  const value = useMemo(
    () => ({
      token,
      user,
      isChecking,
      isAuthenticated: Boolean(token && user),
      registerWithPassword,
      loginWithPassword,
      logout,
    }),
    [token, user, isChecking],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
