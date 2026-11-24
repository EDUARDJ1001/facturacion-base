import { apiRequest } from "@/lib/api-client";
import type {
  CajaOverview,
  CashBreakdown,
  CashRegister,
  CashSession,
  CashSessionDetail,
  CashNetworks,
  CashTerminal,
  CashTerminalItem,
  Pagination
} from "@/types/api";

export const cajaService = {
  overview: () => apiRequest<CajaOverview>("/api/caja/overview"),
  registers: () => apiRequest<{ items: CashRegister[] }>("/api/caja/registers"),
  createRegister: (name: string) =>
    apiRequest<{ item: CashRegister }>("/api/caja/registers", { method: "POST", body: JSON.stringify({ name }) }),
  updateRegister: (id: number, payload: { name?: string; isActive?: boolean }) =>
    apiRequest<{ items: CashRegister[] }>(`/api/caja/registers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  open: (payload: { cashRegisterId: number; openingAmount?: number; openingBreakdown?: CashBreakdown; notes?: string }) =>
    apiRequest<CashSessionDetail>("/api/caja/open", { method: "POST", body: JSON.stringify(payload) }),
  close: (payload: { cashSessionId: number; countedAmount?: number; countedBreakdown?: CashBreakdown; notes?: string }) =>
    apiRequest<CashSessionDetail>("/api/caja/close", { method: "POST", body: JSON.stringify(payload) }),
  move: (payload: { cashSessionId: number; type: "INGRESO" | "EGRESO" | "RETIRO"; method: string; amount: number; description?: string }) =>
    apiRequest<CashSessionDetail>("/api/caja/movements", { method: "POST", body: JSON.stringify(payload) }),
  sessions: (params: URLSearchParams) =>
    apiRequest<{ items: CashSession[]; pagination: Pagination }>(`/api/caja/sessions?${params.toString()}`),
  session: (id: number) => apiRequest<CashSessionDetail>(`/api/caja/sessions/${id}`),
  terminals: () => apiRequest<{ items: CashTerminalItem[] }>("/api/caja/terminals"),
  registerTerminal: (payload: { cashRegisterId: number; name: string }) =>
    apiRequest<{ token: string; terminal: CashTerminal }>("/api/caja/terminals", { method: "POST", body: JSON.stringify(payload) }),
  networks: () => apiRequest<CashNetworks>("/api/caja/networks"),
  addNetwork: (payload: { cidr: string; label?: string; cashRegisterId?: number | null }) =>
    apiRequest<CashNetworks>("/api/caja/networks", { method: "POST", body: JSON.stringify(payload) }),
  removeNetwork: (id: number) => apiRequest<CashNetworks>(`/api/caja/networks/${id}`, { method: "DELETE" }),
  createPairing: (cashRegisterId: number, name?: string) =>
    apiRequest<{ code: string; expiresAt: string; registerName: string }>(`/api/caja/registers/${cashRegisterId}/pairing`, {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  redeemPairing: (payload: { code: string; name?: string }) =>
    apiRequest<{ token: string; terminal: CashTerminal }>("/api/caja/terminals/pair", { method: "POST", body: JSON.stringify(payload) }),
  deleteTerminal: (id: number) => apiRequest<{ items: CashTerminalItem[] }>(`/api/caja/terminals/${id}`, { method: "DELETE" }),
  registerTerminalByIp: (payload: { cashRegisterId: number; name: string; ip: string }) =>
    apiRequest<{ terminal: CashTerminal & { boundIp: string } }>("/api/caja/terminals/by-ip", { method: "POST", body: JSON.stringify(payload) }),
  updateTerminal: (id: number, payload: { cashRegisterId?: number; name?: string; isActive?: boolean; boundIp?: string }) =>
    apiRequest<{ items: CashTerminalItem[] }>(`/api/caja/terminals/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  closePdf: (id: number) => apiRequest<Response>(`/api/caja/sessions/${id}/pdf`, { raw: true })
};
