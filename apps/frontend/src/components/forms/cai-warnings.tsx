"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { invoicesService } from "@/services/invoices-service";

/**
 * Avisos de la serie de facturación activa: CAI vencido o por vencer (30 días o
 * menos) y rango autorizado agotado o por agotarse. Sin avisos no muestra nada.
 */
export function CaiWarnings() {
  const seriesQuery = useQuery({ queryKey: ["invoice-form", "series"], queryFn: () => invoicesService.activeSeries() });
  const series = seriesQuery.data?.item;

  if (seriesQuery.isLoading || seriesQuery.isError) {
    return null;
  }

  const messages = series ? series.warnings : ["No hay una serie de facturación (CAI) activa. Regístrala en Facturación SAR para poder facturar."];
  if (messages.length === 0) {
    return null;
  }

  const blocking = !series || series.expired || series.exhausted;

  return (
    <div
      role="alert"
      className={
        blocking
          ? "flex items-start gap-3 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          : "flex items-start gap-3 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      }
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="grid gap-1">
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    </div>
  );
}
