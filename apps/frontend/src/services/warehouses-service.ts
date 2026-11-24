import { apiRequest } from "@/lib/api-client";
import type { Pagination, Warehouse } from "@/types/api";

export const warehousesService = {
  list: (params: URLSearchParams) => apiRequest<{ items: Warehouse[]; pagination: Pagination }>(`/api/warehouses?${params.toString()}`),
  create: (payload: unknown) => apiRequest<{ message: string; item: Warehouse }>("/api/warehouses", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: number, payload: unknown) =>
    apiRequest<{ message: string; item: Warehouse }>(`/api/warehouses/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; item: Warehouse }>(`/api/warehouses/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) })
};
