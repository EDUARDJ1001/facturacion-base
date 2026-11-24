import { printAgent } from "@/lib/print-agent";
import { printService } from "@/services/print-service";

/** Dónde imprime este equipo un tipo de documento. */
export type PrintTarget = { kind: "agent"; printer: string } | { kind: "server" };

/**
 * Ticket 80 mm según la configuración de este equipo:
 *   - agent: impresora de Windows de esta PC asignada a tickets (sin diálogo).
 *   - server: impresora ESC/POS del backend (solo la PC donde corre el backend).
 */
export async function printTicket(target: PrintTarget, invoiceId: number, getPdf: () => Promise<Blob>) {
  if (target.kind === "server") {
    await printService.invoiceTicket(invoiceId);
    return;
  }

  await printAgent.print("ticket", await getPdf());
}

/** Documento carta (factura, proforma, cotización, cierre) en la impresora de carta de esta PC. */
export async function printLetter(getPdf: () => Promise<Blob>) {
  await printAgent.print("letter", await getPdf());
}
