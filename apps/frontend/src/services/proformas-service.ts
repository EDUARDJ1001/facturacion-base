import { apiRequest } from "@/lib/api-client";
import type { InvoiceDetail, Pagination, ProformaDetail, ProformaListItem, ProformaStatus } from "@/types/api";

export const proformasService = {
  list: (params: URLSearchParams) =>
    apiRequest<{ items: ProformaListItem[]; pagination: Pagination }>(`/api/proformas?${params.toString()}`),
  create: (payload: unknown) =>
    apiRequest<{ message: string; item: ProformaDetail }>("/api/proformas", { method: "POST", body: JSON.stringify(payload) }),
  getById: (id: number) => apiRequest<{ item: ProformaDetail }>(`/api/proformas/${id}`),
  printHtml: (id: number) => apiRequest<string>(`/api/proformas/${id}/print`),
  pdf: (id: number) => apiRequest<Response>(`/api/proformas/${id}/pdf`, { raw: true }),
  updateStatus: (id: number, status: Exclude<ProformaStatus, "FACTURADA">) =>
    apiRequest<{ message: string; item: ProformaDetail }>(`/api/proformas/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  convertToInvoice: (id: number) =>
    apiRequest<{ message: string; item: ProformaDetail; invoice: InvoiceDetail }>(`/api/proformas/${id}/convert-to-invoice`, {
      method: "POST"
    })
};
