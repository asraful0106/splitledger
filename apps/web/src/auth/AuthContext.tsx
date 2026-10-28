import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { refreshSession } from "../lib/api";
import * as session from "../lib/session";
import type { AuthUser } from "../lib/session";
import { setAccessToken, subscribeToToken } from "../lib/token-store";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { email: string; password: string }) => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const restored = await refreshSession();
      if (!active) {
        return;
      }
      if (!restored) {
        setStatus("anonymous");
        return;
      }
      try {
        const result = await session.me();
        if (active) {
          setUser(result.user);
          setStatus("authenticated");
        }
      } catch {
        if (active) {
          setStatus("anonymous");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribeToToken((token) => {
        if (!token) {
          setUser(null);
          setStatus("anonymous");
        }
      }),
    [],
  );

  const login = useCallback(async (input: { email: string; password: string }) => {
    const result = await session.login(input);
    setAccessToken(result.accessToken);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (input: { email: string; password: string }) => {
    await session.register(input);
  }, []);

  const logout = useCallback(async (all = false) => {
    try {
      await (all ? session.logoutAll() : session.logout());
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
