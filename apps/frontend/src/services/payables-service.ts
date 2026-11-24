import { apiRequest } from "@/lib/api-client";
import type { FinanceSummary, Pagination, PayableDocument, PayablePayment, SupplierStatement } from "@/types/api";

export const payablesService = {
  list: (params: URLSearchParams) =>
    apiRequest<{ items: PayableDocument[]; summary: FinanceSummary; pagination: Pagination }>(`/api/payables?${params.toString()}`),
  create: (payload: unknown) =>
    apiRequest<{ message: string; item: PayableDocument }>("/api/payables", { method: "POST", body: JSON.stringify(payload) }),
  detail: (id: number) =>
    apiRequest<{ document: PayableDocument; payments: PayablePayment[] }>(`/api/payables/${id}`),
  void: (id: number) =>
    apiRequest<{ message: string; item: PayableDocument }>(`/api/payables/${id}/void`, { method: "PATCH" }),
  registerPayment: (id: number, payload: unknown) =>
    apiRequest<{ message: string; item: PayableDocument; receiptNumber: string }>(`/api/payables/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  supplierStatement: (supplierId: number) => apiRequest<SupplierStatement>(`/api/payables/suppliers/${supplierId}/statement`),
  supplierStatementPdf: (supplierId: number) =>
    apiRequest<Response>(`/api/payables/suppliers/${supplierId}/statement/pdf`, { raw: true })
};
