import { apiRequest } from "@/lib/api-client";
import type { ManagedUser, Pagination, Role } from "@/types/api";

export const usersService = {
  list: (params: URLSearchParams) =>
    apiRequest<{ items: ManagedUser[]; pagination: Pagination; inactiveCount: number }>(`/api/users?${params.toString()}`),
  roles: () => apiRequest<{ items: Role[] }>("/api/users/roles"),
  create: (payload: unknown) =>
    apiRequest<{ message: string; item: ManagedUser }>("/api/users", { method: "POST", body: JSON.stringify(payload) }),
  getById: (id: number) => apiRequest<{ item: ManagedUser }>(`/api/users/${id}`),
  update: (id: number, payload: unknown) =>
    apiRequest<{ message: string; item: ManagedUser }>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updatePassword: (id: number, password: string) =>
    apiRequest<{ message: string; item: ManagedUser }>(`/api/users/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password })
    }),
  updateStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; item: ManagedUser }>(`/api/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive })
    })
};
