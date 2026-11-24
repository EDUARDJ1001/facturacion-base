import { apiRequest } from "@/lib/api-client";
import type { Company } from "@/types/api";

export interface UpdateCompanyPayload {
  commercialName: string;
  legalName: string;
  rtn: string;
  email?: string;
  phone?: string;
  address?: string;
  logo?: string;
  favicon?: string;
  documentColor?: string;
  footerBrands?: string[];
  themeMode: "light" | "dark";
}

export interface CreateCompanyPayload {
  commercialName: string;
  legalName: string;
  rtn: string;
  phone?: string;
  email?: string;
  address?: string;
  primaryColor?: string;
}

export const companiesService = {
  createCompany: (payload: CreateCompanyPayload) =>
    apiRequest<{ message: string; item: Company }>("/api/companies", { method: "POST", body: JSON.stringify(payload) }),
  myCompanies: () => apiRequest<{ items: Company[] }>("/api/companies/my"),
  selectCompany: (companyId: number) =>
    apiRequest<{ message: string; item: Company }>("/api/companies/select", {
      method: "POST",
      body: JSON.stringify({ companyId })
    }),
  activeFooterBrands: () => apiRequest<{ items: string[] }>("/api/companies/active/footer-brands"),
  updateActiveCompany: (payload: UpdateCompanyPayload) =>
    apiRequest<{ message: string; item: Company }>("/api/companies/active", {
      method: "PUT",
      body: JSON.stringify(payload)
    })
};
