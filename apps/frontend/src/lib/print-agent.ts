/**
 * Cliente del agente local de impresión (apps/print-agent), que corre en cada PC
 * en 127.0.0.1. El navegador le envía el PDF y el agente lo imprime sin diálogo
 * en la impresora de Windows asignada a tickets o carta en ESE equipo.
 */
const AGENT_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? "http://127.0.0.1:17777";

export type PrintKind = "ticket" | "letter";

export interface AgentStatus {
  ok: boolean;
  version: string;
  hostname: string;
  ticketPrinter: string | null;
  letterPrinter: string | null;
}

export interface AgentPrinter {
  name: string;
  isDefault: boolean;
  offline: boolean;
  port: string | null;
  connection: "usb" | "red" | "serial" | "compartida" | "virtual" | "otra";
  driver: string | null;
}

async function agentRequest<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${AGENT_URL}${path}`, { ...init, signal: controller.signal });
    const data = (await response.json().catch(() => ({}))) as T & { message?: string };

    if (!response.ok) {
      throw new Error(data.message ?? "El agente de impresión respondió con un error.");
    }

    return data;
  } catch (error) {
    if ((error as Error).name === "AbortError" || error instanceof TypeError) {
      throw new Error("El agente de impresión no está activo en este equipo.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const printAgent = {
  status: () => agentRequest<AgentStatus>("/status", {}, 2500),
  printers: () => agentRequest<{ items: AgentPrinter[] }>("/printers", {}, 20000),
  saveConfig: (payload: { ticketPrinter?: string | null; letterPrinter?: string | null }) =>
    agentRequest<{ ok: boolean; ticketPrinter: string | null; letterPrinter: string | null }>(
      "/config",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      20000
    ),
  /** Imprime el PDF en la impresora asignada al tipo (o en `printer`, para pruebas). */
  print: (kind: PrintKind, pdf: Blob, printer?: string) => {
    const params = new URLSearchParams({ kind });
    if (printer) {
      params.set("printer", printer);
    }
    return agentRequest<{ ok: boolean; printer: string }>(
      `/print?${params.toString()}`,
      { method: "POST", headers: { "Content-Type": "application/pdf" }, body: pdf },
      60000
    );
  }
};
