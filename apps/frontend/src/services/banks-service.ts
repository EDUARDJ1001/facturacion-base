import { apiRequest } from "@/lib/api-client";
import type { Pagination } from "@/types/api";

export type BankMovementType =
  | "DEPOSITO"
  | "RETIRO"
  | "TRANSFERENCIA_ENTRADA"
  | "TRANSFERENCIA_SALIDA"
  | "COMISION"
  | "INTERES"
  | "NOTA_CREDITO"
  | "NOTA_DEBITO"
  | "CHEQUE";

export interface BankAccount {
  id: number;
  bankName: string;
  accountType: "CORRIENTE" | "AHORRO";
  currency: "HNL" | "USD";
  accountNumber: string;
  alias: string | null;
  openingBalance: number;
  openingDate: string;
  isActive: boolean;
  movementsIn: number;
  movementsOut: number;
  balance: number;
  pendingChecks: number;
  pendingChecksTotal: number;
  hasMovements: boolean;
}

export interface BankMovement {
  id: number;
  bankAccountId: number;
  movementDate: string;
  movementType: BankMovementType;
  direction: "IN" | "OUT";
  amount: number;
  reference: string | null;
  description: string | null;
  checkNumber: string | null;
  beneficiary: string | null;
  checkStatus: "EMITIDO" | "COBRADO" | null;
  relatedMovementId: number | null;
  relatedAccountName: string | null;
  status: "ACTIVO" | "ANULADO";
  voidReason: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface BankAccountPayload {
  bankName: string;
  accountType: "CORRIENTE" | "AHORRO";
  currency: "HNL" | "USD";
  accountNumber: string;
  alias?: string;
  openingBalance: number;
  openingDate: string;
}

type Saved<T> = { message: string; item: T; warning?: string | null };

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export const banksService = {
  accounts: (status: "active" | "all" = "active") => apiRequest<{ items: BankAccount[] }>(`/api/banks/accounts?status=${status}`),
  createAccount: (payload: BankAccountPayload) => apiRequest<Saved<BankAccount>>("/api/banks/accounts", json("POST", payload)),
  updateAccount: (id: number, payload: BankAccountPayload) => apiRequest<Saved<BankAccount>>(`/api/banks/accounts/${id}`, json("PUT", payload)),
  setAccountStatus: (id: number, isActive: boolean) => apiRequest<Saved<BankAccount>>(`/api/banks/accounts/${id}/status`, json("PATCH", { isActive })),
  movements: (accountId: number, params: URLSearchParams) =>
    apiRequest<{ items: BankMovement[]; pagination: Pagination }>(`/api/banks/accounts/${accountId}/movements?${params.toString()}`),
  createMovement: (payload: unknown) => apiRequest<Saved<BankMovement>>("/api/banks/movements", json("POST", payload)),
  createCheck: (payload: unknown) => apiRequest<Saved<BankMovement>>("/api/banks/checks", json("POST", payload)),
  createTransfer: (payload: unknown) => apiRequest<Saved<BankMovement>>("/api/banks/transfers", json("POST", payload)),
  voidMovement: (id: number, reason: string) => apiRequest<Saved<BankMovement>>(`/api/banks/movements/${id}/void`, json("POST", { reason })),
  setCheckStatus: (id: number, checkStatus: "EMITIDO" | "COBRADO") =>
    apiRequest<Saved<BankMovement>>(`/api/banks/movements/${id}/check-status`, json("PATCH", { checkStatus }))
};
