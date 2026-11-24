import { apiRequest } from "@/lib/api-client";
import type { Pagination, Supplier } from "@/types/api";

export const suppliersService = {
  list: (params: URLSearchParams) =>
    apiRequest<{ items: Supplier[]; pagination: Pagination }>(`/api/suppliers?${params.toString()}`),
  create: (payload: unknown) =>
    apiRequest<{ message: string; item: Supplier }>("/api/suppliers", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: unknown) =>
    apiRequest<{ message: string; item: Supplier }>(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; item: Supplier }>(`/api/suppliers/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive })
    })
};
