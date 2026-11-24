"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { clearStoredActiveCompanyId, getStoredActiveCompanyId, storeActiveCompanyId } from "@/lib/storage";
import { companiesService } from "@/services/companies-service";
import type { Company } from "@/types/api";
import { useAuth } from "@/hooks/use-auth";

interface CompanyContextValue {
  activeCompany: Company | null;
  isHydrating: boolean;
  selectCompany: (companyId: number) => Promise<void>;
  clearCompany: () => void;
}

export const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

function hexToRgbTriplet(hex: string | null | undefined, fallback: string) {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) {
    return fallback;
  }

  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `${red} ${green} ${blue}`;
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { companies, isLoading, reloadProfile, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      setActiveCompany(null);
      setIsHydrating(false);
      clearStoredActiveCompanyId();
      return;
    }

    const storedId = getStoredActiveCompanyId();
    const nextCompany = companies.find((company) => company.id === storedId) ?? null;
    if (storedId && !nextCompany) {
      // Ya no existe o se perdió el acceso (p. ej. se cambió de base de datos).
      clearStoredActiveCompanyId();
    }
    setActiveCompany(nextCompany);
    setIsHydrating(false);
  }, [companies, isLoading, user]);

  useEffect(() => {
    const root = document.documentElement;
    const company = activeCompany;

    if (!company) {
      root.style.setProperty("--brand", "15 23 42");
      root.style.setProperty("--brand-alt", "51 65 85");
      root.dataset.layout = "default";
      return;
    }

    root.style.setProperty("--brand", hexToRgbTriplet(company.primaryColor, "15 23 42"));
    root.style.setProperty("--brand-alt", hexToRgbTriplet(company.secondaryColor, "51 65 85"));
    root.dataset.layout = company.layoutKey ?? "default";
  }, [activeCompany]);

  const selectCompany = useCallback(
    async (companyId: number) => {
      const response = await companiesService.selectCompany(companyId);
      // Otra empresa: se descarta lo cargado de la anterior (las listas no se mezclan).
      if (getStoredActiveCompanyId() !== companyId) {
        queryClient.removeQueries();
      }
      storeActiveCompanyId(companyId);
      setActiveCompany(response.item);
      await reloadProfile(companyId);
    },
    [queryClient, reloadProfile]
  );

  const clearCompany = useCallback(() => {
    clearStoredActiveCompanyId();
    setActiveCompany(null);
    queryClient.removeQueries();
  }, [queryClient]);

  const value = useMemo(
    () => ({
      activeCompany,
      isHydrating,
      selectCompany,
      clearCompany
    }),
    [activeCompany, clearCompany, isHydrating, selectCompany]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
