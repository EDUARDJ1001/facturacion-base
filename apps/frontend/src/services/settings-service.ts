import { apiRequest } from "@/lib/api-client";
import type { BillingSeries, BillingSettings } from "@/types/api";

export const settingsService = {
  getBilling: () => apiRequest<{ item: BillingSettings }>("/api/settings/billing"),
  updateBilling: (payload: unknown) =>
    apiRequest<{ message: string; item: BillingSettings }>("/api/settings/billing", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  listSeries: () => apiRequest<{ items: BillingSeries[] }>("/api/settings/billing/series"),
  getSeries: (id: number) => apiRequest<{ item: BillingSeries }>(`/api/settings/billing/series/${id}`),
  createSeries: (payload: unknown) =>
    apiRequest<{ message: string; item: BillingSeries }>("/api/settings/billing/series", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateSeries: (id: number, payload: unknown) =>
    apiRequest<{ message: string; item: BillingSeries }>(`/api/settings/billing/series/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  updateSeriesStatus: (id: number, isActive: boolean) =>
    apiRequest<{ message: string; item: BillingSeries }>(`/api/settings/billing/series/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive })
    })
};
