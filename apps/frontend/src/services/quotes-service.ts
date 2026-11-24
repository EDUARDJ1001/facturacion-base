import { apiRequest } from "@/lib/api-client";
import type { InvoiceDetail, Pagination, QuoteDetail, QuoteListItem, QuoteStatus } from "@/types/api";

export const quotesService = {
  list: (params: URLSearchParams) =>
    apiRequest<{ items: QuoteListItem[]; pagination: Pagination }>(`/api/quotes?${params.toString()}`),
  create: (payload: unknown) =>
    apiRequest<{ message: string; item: QuoteDetail }>("/api/quotes", { method: "POST", body: JSON.stringify(payload) }),
  getById: (id: number) => apiRequest<{ item: QuoteDetail }>(`/api/quotes/${id}`),
  pdf: (id: number) => apiRequest<Response>(`/api/quotes/${id}/pdf`, { raw: true }),
  updateStatus: (id: number, status: Exclude<QuoteStatus, "FACTURADA">) =>
    apiRequest<{ message: string; item: QuoteDetail }>(`/api/quotes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  convertToInvoice: (id: number) =>
    apiRequest<{ message: string; item: QuoteDetail; invoice: InvoiceDetail }>(`/api/quotes/${id}/convert-to-invoice`, {
      method: "POST"
    })
};
