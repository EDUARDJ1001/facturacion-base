import { apiRequest } from "@/lib/api-client";
import type { ClientStatement, FinanceSummary, InvoicePayment, Pagination, Receivable } from "@/types/api";

export const receivablesService = {
  list: (params: URLSearchParams) =>
    apiRequest<{ items: Receivable[]; summary: FinanceSummary; pagination: Pagination }>(`/api/receivables?${params.toString()}`),
  detail: (invoiceId: number) =>
    apiRequest<{ invoice: Receivable; payments: InvoicePayment[] }>(`/api/receivables/${invoiceId}`),
  registerPayment: (invoiceId: number, payload: unknown) =>
    apiRequest<{ message: string; item: Receivable; receiptNumber: string }>(`/api/receivables/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  clientStatement: (clientId: number) => apiRequest<ClientStatement>(`/api/receivables/clients/${clientId}/statement`),
  clientStatementPdf: (clientId: number) =>
    apiRequest<Response>(`/api/receivables/clients/${clientId}/statement/pdf`, { raw: true })
};
