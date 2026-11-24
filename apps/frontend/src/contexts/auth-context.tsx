"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, isAuthError, setTokenRefreshHandler } from "@/lib/api-client";
import {
  clearStoredActiveCompanyId,
  clearStoredSession,
  getStoredActiveCompanyId,
  getStoredSession,
  storeSession
} from "@/lib/storage";
import { authService } from "@/services/auth-service";
import type { Company, SessionTokens, User } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  companies: Company[];
  permissions: string[];
  can: (key: string) => boolean;
  isLoading: boolean;
  login: (payload: { username: string; password: string }) => Promise<void>;
  logout: () => void;
  reloadProfile: (companyId?: number | null) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** Reintentos de recuperar la sesión mientras el sistema no responde. */
  const [hydrateAttempt, setHydrateAttempt] = useState(0);

  const resetSession = useCallback(() => {
    clearStoredSession();
    clearStoredActiveCompanyId();
    setUser(null);
    setCompanies([]);
    setPermissions([]);
  }, []);

  const refreshSession = useCallback(async (): Promise<SessionTokens | null> => {
    const session = getStoredSession();

    if (!session?.refreshToken) {
      resetSession();
      return null;
    }

    try {
      const refreshed = await authService.refresh(session.refreshToken);
      const nextSession = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken
      };
      storeSession(nextSession);
      return nextSession;
    } catch (error) {
      // Solo si la sesión ya no es válida se cierra; sin conexión se conserva.
      if (isAuthError(error)) {
        resetSession();
        return null;
      }
      throw error;
    }
  }, [resetSession]);

  const reloadProfile = useCallback(async (companyId?: number | null) => {
    const me = await authService.me(companyId ?? getStoredActiveCompanyId());
    setUser(me.user);
    setCompanies(me.companies);
    setPermissions(me.permissions ?? []);
  }, []);

  const hydrate = useCallback(async () => {
    const session = getStoredSession();

    if (!session?.accessToken && !session?.refreshToken) {
      setIsLoading(false);
      return;
    }

    try {
      if (!session?.accessToken && session?.refreshToken) {
        const refreshed = await refreshSession();
        if (!refreshed) {
          setIsLoading(false);
          return;
        }
      }

      await reloadProfile();
      setIsLoading(false);
    } catch (error) {
      // Sesión vencida o usuario que ya no existe: a iniciar sesión.
      if (isAuthError(error) || (error instanceof ApiError && error.status === 404)) {
        resetSession();
        setIsLoading(false);
        return;
      }
      // El sistema está arrancando (p. ej. recién actualizado) o no hay conexión: la sesión
      // se conserva y se vuelve a intentar en unos segundos.
      window.setTimeout(() => setHydrateAttempt((attempt) => attempt + 1), 3000);
    }
  }, [refreshSession, reloadProfile, resetSession]);

  useEffect(() => {
    void hydrate();
  }, [hydrate, hydrateAttempt]);

  useEffect(() => {
    setTokenRefreshHandler(refreshSession);
    return () => setTokenRefreshHandler(null);
  }, [refreshSession]);

  const login = useCallback(async (payload: { username: string; password: string }) => {
    const response = await authService.login(payload);
    storeSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken
    });
    setUser(response.user);
    setCompanies(response.companies);
    setPermissions(response.permissions ?? []);
  }, []);

  const logout = useCallback(() => {
    resetSession();
  }, [resetSession]);

  const can = useCallback((key: string) => permissions.includes(key), [permissions]);

  const value = useMemo(
    () => ({
      user,
      companies,
      permissions,
      can,
      isLoading,
      login,
      logout,
      reloadProfile
    }),
    [can, companies, isLoading, login, logout, permissions, reloadProfile, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
