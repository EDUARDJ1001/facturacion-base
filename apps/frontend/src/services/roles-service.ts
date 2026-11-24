import { apiRequest } from "@/lib/api-client";
import type { PermissionCatalogGroup, RoleWithPermissions } from "@/types/api";

export const rolesService = {
  list: () => apiRequest<{ items: RoleWithPermissions[] }>("/api/roles"),
  catalog: () => apiRequest<{ groups: PermissionCatalogGroup[] }>("/api/roles/catalog"),
  setPermissions: (id: number, permissions: string[]) =>
    apiRequest<{ message: string; item: RoleWithPermissions }>(`/api/roles/${id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions })
    })
};
