import { apiRequest } from "@/lib/api-client";
import type { Client, ClientSummary, Pagination } from "@/types/api";

export const clientsService = {
  list: (params: URLSearchParams) => apiRequest<{ items: Client[]; pagination: Pagination }>(`/api/clients?${params.toString()}`),
  create: (payload: unknown) => apiRequest<{ message: string; item: Client }>("/api/clients", { method: "POST", body: JSON.stringify(payload) }),
  getById: (id: number) => apiRequest<{ item: Client }>(`/api/clients/${id}`),
  summary: (id: number) => apiRequest<ClientSummary>(`/api/clients/${id}/summary`),
  update: (id: number, payload: unknown) => apiRequest<{ message: string; item: Client }>(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateStatus: (id: number, isActive: boolean) => apiRequest<{ message: string; item: Client }>(`/api/clients/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) })
};
