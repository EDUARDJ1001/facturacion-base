"use client";

import { useContext } from "react";

import { CompanyContext } from "@/contexts/company-context";

export function useCompany() {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error("useCompany debe usarse dentro de CompanyProvider.");
  }

  return context;
}
