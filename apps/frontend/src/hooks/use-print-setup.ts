"use client";

import { useQuery } from "@tanstack/react-query";

import { printAgent } from "@/lib/print-agent";
import type { PrintTarget } from "@/lib/ticket-print";
import { printService } from "@/services/print-service";

/**
 * Impresoras configuradas en ESTE equipo. Si un tipo (ticket/carta) no tiene
 * impresora, la pantalla no debe ofrecer "Imprimir" para ese tipo.
 *
 * Ticket: en la PC donde corre el sistema (cada caja), si tiene impresora de ticket
 * térmico configurada, se usa esa (mismo formato con cualquier conexión o driver).
 * Si no, la impresora del programa de impresión (PDF).
 */
export function usePrintSetup() {
  const statusQuery = useQuery({
    queryKey: ["print-agent", "status"],
    queryFn: () => printAgent.status(),
    retry: false,
    staleTime: 30_000
  });
  // El backend dice si esta PC es la suya y qué impresora de ticket térmico tiene.
  const serverQuery = useQuery({ queryKey: ["print", "status"], queryFn: () => printService.status(), staleTime: 60_000 });

  const agent = statusQuery.data ?? null;
  const isServerPc = serverQuery.data?.isServerPc ?? false;
  const serverTicket = isServerPc && Boolean(serverQuery.data?.configured);

  const ticket: PrintTarget | null = serverTicket
    ? { kind: "server" }
    : agent?.ticketPrinter
      ? { kind: "agent", printer: agent.ticketPrinter }
      : null;
  const letter: PrintTarget | null = agent?.letterPrinter ? { kind: "agent", printer: agent.letterPrinter } : null;

  return {
    isLoading: statusQuery.isLoading || serverQuery.isLoading,
    agentOnline: Boolean(agent),
    agent,
    isServerPc,
    serverPrinter: serverQuery.data ?? null,
    ticket,
    letter
  };
}
