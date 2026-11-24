"use client";

import { Printer } from "lucide-react";
import Link from "next/link";

import { usePrintSetup } from "@/hooks/use-print-setup";

/**
 * Aviso junto a los botones de impresión cuando este equipo no tiene impresora
 * para lo que se quiere imprimir. Lleva a la vista de Impresoras.
 */
export function PrintSetupNotice({ kinds, compact = false }: { kinds: Array<"ticket" | "letter">; compact?: boolean }) {
  const setup = usePrintSetup();

  if (setup.isLoading) {
    return null;
  }

  const missing = kinds.filter((kind) => (kind === "ticket" ? !setup.ticket : !setup.letter));

  if (missing.length === 0) {
    return null;
  }

  const label =
    missing.length > 1
      ? "No hay impresoras configuradas en este equipo"
      : missing[0] === "ticket"
        ? "No hay una impresora de tickets configurada en este equipo"
        : "No hay una impresora de carta configurada en este equipo";

  // Compacto (en lugar del botón de una fila): texto corto y el mensaje completo al pasar el mouse.
  if (compact) {
    const short = missing.length > 1 ? "Sin impresoras" : missing[0] === "ticket" ? "Sin impresora de tickets" : "Sin impresora de carta";
    return (
      <Link
        href="/impresoras"
        className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-2xl px-3 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
        title={`${label}. Toca para configurarla.`}
      >
        <Printer className="h-3.5 w-3.5" />
        {short}
      </Link>
    );
  }

  return (
    <Link
      href="/impresoras"
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
      title="Configurar las impresoras de este equipo"
    >
      <Printer className="h-3.5 w-3.5" />
      <span>{label}.</span>
      <span className="font-semibold underline underline-offset-2">Configurar</span>
    </Link>
  );
}
