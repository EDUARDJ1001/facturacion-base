"use client";

import { Suspense } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { filenameFromResponse, formatCurrency, formatDate } from "@/lib/utils";
import { quotesService } from "@/services/quotes-service";
import type { QuoteStatus } from "@/types/api";

const editableStatuses: Array<Exclude<QuoteStatus, "FACTURADA">> = ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA"];

async function downloadPdf(quoteId: number) {
  const response = await quotesService.pdf(quoteId);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromResponse(response, `cotizacion-${quoteId}.pdf`);
  link.click();
  URL.revokeObjectURL(url);
}

function statusClass(status: QuoteStatus) {
  if (status === "FACTURADA") return "bg-emerald-100 text-emerald-700";
  if (status === "APROBADA") return "bg-sky-100 text-sky-700";
  if (status === "RECHAZADA" || status === "VENCIDA") return "bg-rose-100 text-rose-700";
  if (status === "ENVIADA") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function statusText(status: QuoteStatus) {
  if (status === "FACTURADA") return "text-emerald-600";
  if (status === "APROBADA") return "text-sky-600";
  if (status === "RECHAZADA" || status === "VENCIDA") return "text-rose-600";
  if (status === "ENVIADA") return "text-amber-600";
  return "text-slate-500";
}

function QuoteDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const quoteId = Number(searchParams.get("id"));

  const quoteQuery = useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => quotesService.getById(quoteId),
    enabled: Number.isInteger(quoteId) && quoteId > 0
  });

  const quote = quoteQuery.data?.item;

  const statusMutation = useMutation({
    mutationFn: (status: Exclude<QuoteStatus, "FACTURADA">) => quotesService.updateStatus(quoteId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["quote", quoteId] });
      void queryClient.invalidateQueries({ queryKey: ["quotes"] });
    }
  });

  const convertMutation = useMutation({
    mutationFn: () => quotesService.convertToInvoice(quoteId),
    onSuccess: (response) => {
      router.push(`/invoices/detail?id=${response.invoice.id}`);
    }
  });

  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return <Card className="p-6 text-slate-600">No se recibió una cotización válida.</Card>;
  }

  if (quoteQuery.isLoading || !quote) {
    return <Spinner label="Cargando cotización..." />;
  }

  const canConvert = !["FACTURADA", "RECHAZADA", "VENCIDA"].includes(quote.status);

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-title">Cotización</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h1 className="break-words text-2xl font-semibold text-slate-900 sm:text-3xl">{quote.quoteNumber}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(quote.status)}`}>{quote.status}</span>
            </div>
            <p className="mt-3 text-slate-600">
              Creada para <span className="font-medium text-slate-800">{quote.customerNameSnapshot}</span> el {formatDate(quote.quoteDate)}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={!canConvert || convertMutation.isPending} onClick={() => convertMutation.mutate()}>
              <FileCheck2 className="mr-2 h-4 w-4" />
              {convertMutation.isPending ? "Facturando..." : "Convertir a factura"}
            </Button>
            <Button variant="secondary" type="button" onClick={() => void downloadPdf(quote.id)}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
            {quote.convertedToInvoiceId ? (
              <Link href={`/invoices/detail?id=${quote.convertedToInvoiceId}`}>
                <Button variant="ghost" type="button">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Ver factura
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="mx-auto w-full max-w-6xl">
        {/* Hoja tipo documento, minimalista */}
        <Card className="p-8 sm:p-12">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{quote.company.commercialName}</h2>
              <p className="mt-1 text-sm text-slate-500">{quote.company.legalName}</p>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                RTN {quote.company.rtn}
                {quote.company.address ? <><br />{quote.company.address}</> : null}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400">Cotización</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900">{quote.quoteNumber}</p>
              <span className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium ${statusText(quote.status)}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {quote.status}
              </span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-4">
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Fecha</p><p className="mt-0.5 text-slate-700">{formatDate(quote.quoteDate)}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Válida hasta</p><p className="mt-0.5 text-slate-700">{quote.validUntil ? formatDate(quote.validUntil) : "N/A"}</p></div>
            {quote.convertedToInvoiceNumber ? (
              <div><p className="text-xs uppercase tracking-wide text-slate-400">Factura</p><p className="mt-0.5 font-mono text-slate-700">{quote.convertedToInvoiceNumber}</p></div>
            ) : null}
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cliente</p>
            <p className="mt-1 text-base font-medium text-slate-900">{quote.customerNameSnapshot}</p>
            <p className="text-sm text-slate-500">
              RTN {quote.customerRtnSnapshot?.trim() ? quote.customerRtnSnapshot : "Consumidor final"}
              {quote.customerEmailSnapshot ? ` · ${quote.customerEmailSnapshot}` : ""}
              {quote.customerPhoneSnapshot ? ` · ${quote.customerPhoneSnapshot}` : ""}
              {quote.customerAddressSnapshot ? ` · ${quote.customerAddressSnapshot}` : ""}
            </p>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-3 pr-3 text-left font-medium">Detalle</th>
                  <th className="py-3 px-3 text-right font-medium">Cant.</th>
                  <th className="py-3 px-3 text-right font-medium">Precio</th>
                  <th className="py-3 px-3 text-right font-medium">Desc.</th>
                  <th className="py-3 px-3 text-right font-medium">ISV</th>
                  <th className="py-3 pl-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-3 pr-3">
                      <p className="font-medium text-slate-800">{item.description}</p>
                      {item.productCode ? <p className="font-mono text-xs text-slate-400">{item.productCode}</p> : null}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-slate-600">{item.quantity.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-slate-600">{formatCurrency(item.unitPrice)}</td>
                    <td className={`py-3 px-3 text-right tabular-nums ${item.lineDiscount > 0 ? "text-slate-600" : "text-slate-400"}`}>{formatCurrency(item.lineDiscount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-slate-600">{formatCurrency(item.lineTax)}</td>
                    <td className="py-3 pl-3 text-right font-medium tabular-nums text-slate-900">{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div className="max-w-xs space-y-1 text-xs text-slate-400">
              {quote.totalInWords ? <p className="text-sm font-medium text-slate-600">{quote.totalInWords}</p> : null}
              {quote.validUntil ? <p>Válida hasta {formatDate(quote.validUntil)}</p> : null}
              {quote.notes ? <p className="pt-2 text-slate-500">{quote.notes}</p> : null}
            </div>
            <div className="w-full space-y-2.5 text-sm sm:max-w-[240px]">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="tabular-nums text-slate-700">{formatCurrency(quote.subtotal)}</span></div>
              {quote.discountTotal > 0 ? (
                <div className="flex justify-between text-slate-500"><span>Descuentos</span><span className="tabular-nums text-slate-700">{formatCurrency(quote.discountTotal)}</span></div>
              ) : null}
              <div className="flex justify-between text-slate-500"><span>Gravado 15%</span><span className="tabular-nums text-slate-700">{formatCurrency(quote.taxableAmount15)}</span></div>
              {quote.taxableAmount18 > 0 ? (
                <div className="flex justify-between text-slate-500"><span>Gravado 18%</span><span className="tabular-nums text-slate-700">{formatCurrency(quote.taxableAmount18)}</span></div>
              ) : null}
              {quote.exemptAmount > 0 ? (
                <div className="flex justify-between text-slate-500"><span>Exento</span><span className="tabular-nums text-slate-700">{formatCurrency(quote.exemptAmount)}</span></div>
              ) : null}
              <div className="flex justify-between text-slate-500"><span>ISV 15%</span><span className="tabular-nums text-slate-700">{formatCurrency(quote.isv15)}</span></div>
              {quote.isv18 > 0 ? (
                <div className="flex justify-between text-slate-500"><span>ISV 18%</span><span className="tabular-nums text-slate-700">{formatCurrency(quote.isv18)}</span></div>
              ) : null}
              <div className="flex items-baseline justify-between border-t border-slate-900/10 pt-3">
                <span className="text-sm font-medium text-slate-500">Total</span>
                <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(quote.grandTotal)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Control de estado (fuera del documento) */}
        <Card className="mt-6 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-title">Estado</p>
              {quote.approvedAt ? (
                <p className="mt-1 text-sm text-slate-500">Aprobada por {quote.approvedByName ?? "usuario"} el {new Date(quote.approvedAt).toLocaleString("es-HN")}.</p>
              ) : null}
            </div>
            <select
              className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10 sm:w-56"
              value={quote.status}
              disabled={quote.status === "FACTURADA" || statusMutation.isPending}
              onChange={(event) => statusMutation.mutate(event.target.value as Exclude<QuoteStatus, "FACTURADA">)}
            >
              {editableStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
              {quote.status === "FACTURADA" ? <option value="FACTURADA">FACTURADA</option> : null}
            </select>
          </div>
          {statusMutation.error ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{statusMutation.error.message}</p> : null}
          {convertMutation.error ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{convertMutation.error.message}</p> : null}
        </Card>
      </div>
    </section>
  );
}

/** useSearchParams exige un Suspense para poder exportar la app como archivos estáticos (escritorio). */
export default function QuoteDetailPage() {
  return (
    <Suspense fallback={<Spinner label="Cargando cotización..." />}>
      <QuoteDetailContent />
    </Suspense>
  );
}
