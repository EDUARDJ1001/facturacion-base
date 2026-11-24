import { clearStoredActiveCompanyId, getStoredActiveCompanyId, getStoredCashTerminal, getStoredSession, storeSession } from "@/lib/storage";
import type { SessionTokens } from "@/types/api";

/**
 * Servidor del sistema. Instalado: el mismo de las pantallas (""). En desarrollo,
 * NEXT_PUBLIC_API_URL si se fija; si no, el mismo equipo desde donde se abrieron las
 * pantallas, en el puerto 4000 (sirve con localhost y con la IP de la red aunque cambie).
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window === "undefined" ? "http://localhost:4000" : `${window.location.protocol}//${window.location.hostname}:4000`);

/** Sin conexión: "server" = no responde el programa del servidor; "database" = no responde la base. */
export type ConnectionProblem = "server" | "database";
export const CONNECTION_EVENT = "app:connection-problem";

const SERVER_UNREACHABLE_MESSAGE = "No hay conexión con el servidor del sistema. Revisa que esté encendido y en la red.";

/** Error de una petición con su código HTTP (0 = el servidor no respondió). */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** La sesión no es válida (vencida, revocada o usuario inactivo): hay que volver a iniciar sesión. */
export function isAuthError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

/** Pantalla que pide los datos de la base cuando el sistema aún no tiene una configurada. */
const SETUP_PATH = "/configuracion-inicial";

/** Lleva a "Conectar base de datos" (si no está ya ahí). */
export function goToSetup() {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith(SETUP_PATH)) {
    window.location.replace(SETUP_PATH);
  }
}

function reportConnectionProblem(problem: ConnectionProblem) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ConnectionProblem>(CONNECTION_EVENT, { detail: problem }));
  }
}

/** fetch que avisa (y da un mensaje claro) si el servidor no responde. */
async function fetchApi(path: string, init: RequestInit) {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw error;
    }
    reportConnectionProblem("server");
    throw new ApiError(SERVER_UNREACHABLE_MESSAGE, 0);
  }
}

let tokenRefreshHandler: null | (() => Promise<SessionTokens | null>) = null;

export function setTokenRefreshHandler(handler: typeof tokenRefreshHandler) {
  tokenRefreshHandler = handler;
}

interface RequestOptions extends RequestInit {
  companyId?: number | null;
  raw?: boolean;
  retried?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = getStoredSession();
  const headers = new Headers(options.headers ?? {});

  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  // Empresa tomada de lo guardado en el navegador (no indicada por quien llama).
  const usesStoredCompany = options.companyId === undefined;
  const companyId = options.companyId ?? getStoredActiveCompanyId();
  if (companyId) {
    headers.set("x-company-id", String(companyId));

    // Equipo registrado como caja: el backend decide la caja con este token.
    const cashTerminal = getStoredCashTerminal(companyId);
    if (cashTerminal) {
      headers.set("x-cash-terminal", cashTerminal);
    }
  }

  const response = await fetchApi(path, {
    ...options,
    headers
  });

  if (response.status === 401 && !options.retried && tokenRefreshHandler) {
    const refreshed = await tokenRefreshHandler();

    if (refreshed?.accessToken) {
      storeSession(refreshed);
      return apiRequest<T>(path, { ...options, retried: true });
    }
  }

  if (!response.ok) {
    let message = "Error inesperado en la solicitud.";

    try {
      const data = (await response.json()) as {
        message?: string;
        details?: { code?: string; formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      };
      message = data.message ?? message;

      if (data.details?.code === "DB_UNAVAILABLE") {
        reportConnectionProblem("database");
      }

      // Sin base configurada: a la configuración inicial, sin mostrar el error.
      if (data.details?.code === "DB_NOT_CONFIGURED") {
        goToSetup();
        return new Promise<T>(() => undefined);
      }

      // La empresa guardada ya no existe o no es accesible (p. ej. se cambió de base de
      // datos): se olvida y se lleva a elegir empresa, sin mostrar el error.
      if (
        usesStoredCompany &&
        path !== "/api/companies/select" &&
        (data.details?.code === "COMPANY_ACCESS" || data.details?.code === "COMPANY_REQUIRED")
      ) {
        clearStoredActiveCompanyId();
        if (typeof window !== "undefined" && !/^\/(select-company|login)/.test(window.location.pathname)) {
          window.location.replace("/select-company");
        }
        // Queda pendiente: la pantalla se va a "elegir empresa".
        return new Promise<T>(() => undefined);
      }

      // Si el backend devolvió errores de validación (zod flatten), muestra el primero
      // para que el usuario sepa QUÉ campo corregir en vez de un mensaje genérico.
      const fieldError =
        data.details?.formErrors?.find(Boolean) ??
        Object.values(data.details?.fieldErrors ?? {})
          .flat()
          .find(Boolean);
      if (fieldError) {
        message = `${message} ${fieldError}`;
      }
    } catch {
      // noop
    }

    throw new ApiError(message, response.status);
  }

  if (options.raw) {
    return response as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export async function publicJsonRequest<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetchApi(path, {
    ...init,
    headers
  });

  if (!response.ok) {
    let message = "Error inesperado en la solicitud.";
    try {
      const data = (await response.json()) as { message?: string; details?: { code?: string } };
      message = data.message ?? message;
      if (data.details?.code === "DB_UNAVAILABLE") {
        reportConnectionProblem("database");
      }
      if (data.details?.code === "DB_NOT_CONFIGURED") {
        goToSetup();
      }
    } catch {
      // noop
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}
