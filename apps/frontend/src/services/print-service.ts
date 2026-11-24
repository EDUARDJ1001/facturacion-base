import { apiRequest } from "@/lib/api-client";

export interface PrinterStatus {
  configured: boolean;
  connected: boolean;
  /** Impresora de tickets del sistema: \\.\COM1, windows-raw:Nombre, tcp://IP:9100... */
  interface: string;
  type: string;
  error?: string;
  /** La petición viene de la PC donde corre el sistema (única que puede usar su impresora). */
  isServerPc: boolean;
}

/** Puerto COM o impresora de Windows de esta PC que puede imprimir el ticket térmico. */
export interface LocalTicketTarget {
  interface: string;
  label: string;
  kind: "com" | "windows";
  detail: string | null;
  /** Parece impresora de tickets (térmica). */
  thermal: boolean;
}

export const printService = {
  status: () => apiRequest<PrinterStatus>("/api/print/status"),
  /** Página de prueba (ticket 80 mm o carta) para verificar una impresora por PDF. */
  testPdf: (format: "ticket" | "carta") => apiRequest<Response>(`/api/print/test-pdf?format=${format}`, { raw: true }),
  invoiceTicket: (id: number) => apiRequest<{ ok: boolean; invoiceNumber: string }>(`/api/print/invoices/${id}/ticket`, { method: "POST" }),
  /** Solo en la PC del sistema: dónde puede salir el ticket térmico. */
  localTargets: () => apiRequest<{ items: LocalTicketTarget[] }>("/api/print/local-targets"),
  /** Solo en la PC del sistema: impresora del ticket térmico (vacío = ninguna). */
  setTicketPrinter: (iface: string) =>
    apiRequest<PrinterStatus>("/api/print/ticket-printer", { method: "PUT", body: JSON.stringify({ interface: iface }) }),
  testTicket: () => apiRequest<{ ok: boolean }>("/api/print/test-ticket", { method: "POST" })
};
