import { apiRequest } from "@/lib/api-client";
import type { InvoiceCorrection, InvoiceDetail, InvoiceListItem, Pagination } from "@/types/api";

export const invoicesService = {
  list: (params: URLSearchParams) => apiRequest<{ items: InvoiceListItem[]; pagination: Pagination }>(`/api/invoices?${params.toString()}`),
  activeSeries: () =>
    apiRequest<{
      item: {
        id: number;
        prefix: string;
        cai: string;
        nextNumber: string;
        exhausted: boolean;
        issueDeadline: string;
        expired: boolean;
        isActive: boolean;
        documentType: "FACTURA";
        daysToDeadline: number;
        /** CAI vencido o por vencer, rango agotado o por agotarse. */
        warnings: string[];
      } | null;
    }>("/api/invoices/series/active"),
  create: (payload: unknown) => apiRequest<{ message: string; item: InvoiceDetail }>("/api/invoices", { method: "POST", body: JSON.stringify(payload) }),
  getById: (id: number) => apiRequest<{ item: InvoiceDetail }>(`/api/invoices/${id}`),
  printHtml: (id: number) => apiRequest<string>(`/api/invoices/${id}/print`),
  pdf: (id: number, format?: "carta" | "ticket") =>
    apiRequest<Response>(`/api/invoices/${id}/pdf${format === "ticket" ? "?format=ticket" : ""}`, { raw: true }),
  createCorrection: (id: number, payload: unknown) => apiRequest<{ message: string; item: InvoiceDetail; correction: InvoiceCorrection }>(`/api/invoices/${id}/corrections`, { method: "POST", body: JSON.stringify(payload) }),
  corrections: (id: number) => apiRequest<{ items: InvoiceCorrection[] }>(`/api/invoices/${id}/corrections`)
};
