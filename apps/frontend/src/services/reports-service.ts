import { apiRequest } from "@/lib/api-client";
import type { SalesReport } from "@/types/api";

export const reportsService = {
  sales: (params: URLSearchParams) => apiRequest<SalesReport>(`/api/reports/sales?${params.toString()}`),
  salesCsv: (params: URLSearchParams) => apiRequest<Response>(`/api/reports/sales/csv?${params.toString()}`, { raw: true })
};
