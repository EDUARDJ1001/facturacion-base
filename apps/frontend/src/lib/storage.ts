import type { SessionTokens } from "@/types/api";

const SESSION_KEY = "facturacion.session";
const COMPANY_KEY = "facturacion.active-company";

export function getStoredSession(): SessionTokens | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionTokens;
  } catch {
    return null;
  }
}

export function storeSession(tokens: SessionTokens) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(tokens));
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
}

export function getStoredActiveCompanyId() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(COMPANY_KEY);
  const companyId = Number(raw);

  return Number.isInteger(companyId) && companyId > 0 ? companyId : null;
}

export function storeActiveCompanyId(companyId: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(COMPANY_KEY, String(companyId));
}

export function clearStoredActiveCompanyId() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(COMPANY_KEY);
}

// Token del equipo registrado como caja, por empresa. No se borra al cerrar
// sesión: identifica a la PC, no al usuario.
const CASH_TERMINAL_PREFIX = "facturacion.cash-terminal.";

export function getStoredCashTerminal(companyId: number) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(`${CASH_TERMINAL_PREFIX}${companyId}`);
}

export function storeCashTerminal(companyId: number, token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${CASH_TERMINAL_PREFIX}${companyId}`, token);
}

export function clearStoredCashTerminal(companyId: number) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(`${CASH_TERMINAL_PREFIX}${companyId}`);
}
