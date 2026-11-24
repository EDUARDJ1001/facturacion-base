import { apiRequest } from "@/lib/api-client";
import type { InventoryEntry, InventoryEntryDetail, InventoryMovement, InventoryStockSummary, Pagination, ProductStock } from "@/types/api";

export const inventoryService = {
  stocks: (params: URLSearchParams) =>
    apiRequest<{ items: ProductStock[]; summary: InventoryStockSummary; pagination: Pagination }>(`/api/inventory/stocks?${params.toString()}`),
  movements: (params: URLSearchParams) =>
    apiRequest<{ items: InventoryMovement[]; pagination: Pagination }>(`/api/inventory/movements?${params.toString()}`),
  /** Existencia de un producto en cada bodega activa. */
  productWarehouses: (productId: number) =>
    apiRequest<{ items: Array<{ warehouseId: number; warehouseCode: string; warehouseName: string; isDefault: boolean; stockQuantity: number }> }>(
      `/api/inventory/stocks/${productId}/warehouses`
    ),
  /** Proveedores activos para el selector de entradas. */
  supplierOptions: () => apiRequest<{ items: Array<{ id: number; name: string; rtn: string | null }> }>("/api/inventory/suppliers"),
  entries: (params: URLSearchParams) =>
    apiRequest<{ items: InventoryEntry[]; pagination: Pagination }>(`/api/inventory/entries?${params.toString()}`),
  entryDetail: (id: number) => apiRequest<{ item: InventoryEntryDetail }>(`/api/inventory/entries/${id}`),
  createEntry: (payload: unknown) =>
    apiRequest<{ message: string; item: InventoryEntryDetail }>("/api/inventory/entries", { method: "POST", body: JSON.stringify(payload) }),
  createAdjustment: (payload: unknown) =>
    apiRequest<{ message: string; item: InventoryMovement }>("/api/inventory/adjustments", { method: "POST", body: JSON.stringify(payload) })
};
