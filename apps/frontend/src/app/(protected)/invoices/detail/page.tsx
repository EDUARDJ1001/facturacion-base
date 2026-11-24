"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Download, PencilLine, Printer, ReceiptText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PrintSetupNotice } from "@/components/forms/print-setup-notice";
import { PrintButton } from "@/components/ui/print-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { invoicesService } from "@/services/invoices-service";
import { useToast } from "@/components/ui/toast";
import { usePrintSetup } from "@/hooks/use-print-setup";
import { printLetter, printTicket } from "@/lib/ticket-print";
import { filenameFromResponse, formatCurrency, formatDate } from "@/lib/utils";

const paymentStatusStyles: Record<string, string> = {
  PAGADA: "bg-emerald-100 text-emerald-700",
  PARCIAL: "bg-sky-100 text-sky-700",
  PENDIENTE: "bg-amber-100 text-amber-800",
  ANULADA: "bg-slate-200 text-slate-600"
};

const paymentTextStyles: Record<string, string> = {
  PAGADA: "text-emerald-600",
  PARCIAL: "text-sky-600",
  PENDIENTE: "text-amber-600",
  ANULADA: "text-slate-500"
};

const correctionSchema = z.object({
  newCustomerName: z.string().optional(),
  newInvoiceDate: z.string().optional(),
  reason: z.string().min(5, "El motivo es obligatorio.")
});

type CorrectionValues = z.infer<typeof correctionSchema>;

async function downloadPdf(invoiceId: number, invoiceNumber: string) {
  const response = await invoicesService.pdf(invoiceId);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromResponse(response, `factura-${invoiceNumber}.pdf`);
  link.click();
  URL.revokeObjectURL(url);
}

function InvoiceDetailContent() {
  const searchParams = useSearchParams();
  const invoiceId = Number(searchParams.get("id"));
  const queryClient = useQueryClient();
  const [correctionMode, setCorrectionMode] = useState<"customer" | "date" | "both" | null>(null);
  const printSetup = usePrintSetup();
  const toast = useToast();

  // Imprime en la impresora de ticket o carta asignada a este equipo.
  const runPrint = async (action: () => Promise<void>, label: string) => {
    try {
      await action();
      toast.success(`${label} enviado a la impresora.`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const invoiceQuery = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => invoicesService.getById(invoiceId),
    enabled: Number.isInteger(invoiceId) && invoiceId > 0
  });

  const invoice = invoiceQuery.data?.item;
  const form = useForm<CorrectionValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: {
      newCustomerName: "",
      newInvoiceDate: "",
      reason: ""
    }
  });

  useEffect(() => {
    if (!invoice) {
      return;
    }

    form.reset({
      newCustomerName: invoice.printCustomerName,
      newInvoiceDate: invoice.printInvoiceDate,
      reason: ""
    });
  }, [form, invoice]);

  const correctionMutation = useMutation({
    mutationFn: async (values: CorrectionValues) => {
      const payload = {
        newCustomerName: correctionMode === "customer" || correctionMode === "both" ? values.newCustomerName : undefined,
        newInvoiceDate: correctionMode === "date" || correctionMode === "both" ? values.newInvoiceDate : undefined,
        reason: values.reason
      };

      return invoicesService.createCorrection(invoiceId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      setCorrectionMode(null);
    }
  });

  const correctionTitle = useMemo(() => {
    if (correctionMode === "customer") return "Corregir nombre del cliente";
    if (correctionMode === "date") return "Reexpedir con nueva fecha";
    if (correctionMode === "both") return "Corregir nombre y fecha";
    return "Corrección";
  }, [correctionMode]);

  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return <Card className="p-6 text-slate-600">No se recibió una factura válida.</Card>;
  }

  if (invoiceQuery.isLoading || !invoice) {
    return <Spinner label="Cargando factura..." />;
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-title">Factura</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h1 className="break-words text-2xl font-semibold text-slate-900 sm:text-3xl">{invoice.invoiceNumber}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${paymentStatusStyles[invoice.paymentStatus] ?? "bg-slate-200 text-slate-600"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {invoice.paymentStatus}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {invoice.saleType === "CREDITO" ? "Crédito" : "Contado"}
              </span>
              {invoice.status === "ANULADA" ? (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Anulada</span>
              ) : null}
            </div>
            <p className="mt-3 text-slate-600">
              Emitida para <span className="font-medium text-slate-800">{invoice.printCustomerName}</span> el {formatDate(invoice.printInvoiceDate)}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {printSetup.ticket ? (
              <PrintButton
                onPrint={() => {
                  const target = printSetup.ticket!;
                  return runPrint(
                    () => printTicket(target, invoice.id, async () => (await invoicesService.pdf(invoice.id, "ticket")).blob()),
                    "Ticket"
                  );
                }}
              >
                <ReceiptText className="mr-2 h-4 w-4" />
                Imprimir ticket
              </PrintButton>
            ) : (
              <PrintSetupNotice kinds={printSetup.letter ? ["ticket"] : ["ticket", "letter"]} />
            )}
            {printSetup.letter ? (
              <PrintButton
                variant="secondary"
                onPrint={() => runPrint(() => printLetter(async () => (await invoicesService.pdf(invoice.id)).blob()), "Factura")}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </PrintButton>
            ) : printSetup.ticket ? (
              <PrintSetupNotice kinds={["letter"]} />
            ) : null}
            <Button variant="secondary" type="button" onClick={() => void downloadPdf(invoice.id, invoice.invoiceNumber)}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <div className="mx-1 hidden h-8 w-px self-center bg-slate-200 sm:block" />
            <Button variant="ghost" size="sm" type="button" onClick={() => setCorrectionMode("customer")}>
              <PencilLine className="mr-1.5 h-4 w-4" />
              Corregir nombre
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => setCorrectionMode("date")}>
              <CalendarClock className="mr-1.5 h-4 w-4" />
              Reexpedir fecha
            </Button>
          </div>
        </div>
      </Card>

      <div className="mx-auto w-full max-w-6xl">
        {/* Hoja tipo factura (como el documento impreso) */}
        <Card className="p-8 sm:p-12">
          {/* Encabezado */}
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{invoice.companyCommercialNameSnapshot}</h2>
              <p className="mt-1 text-sm text-slate-500">{invoice.companyLegalNameSnapshot}</p>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                RTN {invoice.companyRtnSnapshot}
                {invoice.companyAddressSnapshot ? <><br />{invoice.companyAddressSnapshot}</> : null}
                {invoice.companyPhoneSnapshot || invoice.companyEmailSnapshot ? (
                  <><br />{[invoice.companyPhoneSnapshot, invoice.companyEmailSnapshot].filter(Boolean).join(" · ")}</>
                ) : null}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400">{invoice.settings.invoiceTitle}</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900">{invoice.invoiceNumber}</p>
              <span className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium ${invoice.status === "ANULADA" ? "text-rose-600" : paymentTextStyles[invoice.paymentStatus] ?? "text-slate-500"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {invoice.status === "ANULADA" ? "ANULADA" : invoice.paymentStatus}
              </span>
            </div>
          </div>

          {/* Meta fiscal en línea */}
          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-4">
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Fecha</p><p className="mt-0.5 text-slate-700">{formatDate(invoice.printInvoiceDate)}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Tipo</p><p className="mt-0.5 text-slate-700">{invoice.saleType === "CREDITO" ? "Crédito" : "Contado"}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Vence CAI</p><p className="mt-0.5 text-slate-700">{formatDate(invoice.issueDeadlineSnapshot)}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Bodega</p><p className="mt-0.5 text-slate-700">{invoice.warehouseName ?? "N/A"}</p></div>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            CAI <span className="font-mono text-slate-500">{invoice.caiSnapshot}</span>
            <span className="mx-2 text-slate-300">·</span>
            Rango <span className="tabular-nums text-slate-500">{invoice.rangeStartSnapshot}–{invoice.rangeEndSnapshot}</span>
          </p>

          {/* Cliente */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Facturar a</p>
            <p className="mt-1 text-base font-medium text-slate-900">{invoice.printCustomerName}</p>
            <p className="text-sm text-slate-500">
              RTN {invoice.customerRtnSnapshot?.trim() ? invoice.customerRtnSnapshot : "Consumidor final"}
              {invoice.customerPhoneSnapshot ? ` · ${invoice.customerPhoneSnapshot}` : ""}
              {invoice.customerAddressSnapshot ? ` · ${invoice.customerAddressSnapshot}` : ""}
            </p>
            {invoice.paymentStatus !== "PAGADA" || (invoice.saleType === "CREDITO" && invoice.dueDate) ? (
              <p className="mt-1 text-sm text-slate-500">
                {invoice.saleType === "CREDITO" && invoice.dueDate ? `Vence pago ${formatDate(invoice.dueDate)}` : ""}
                {invoice.paymentStatus !== "PAGADA" ? `${invoice.saleType === "CREDITO" && invoice.dueDate ? " · " : ""}Saldo ${formatCurrency(invoice.balance)}` : ""}
              </p>
            ) : null}
          </div>

          {/* Detalle: tabla minimalista */}
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
                {invoice.items.map((item) => (
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

          {/* Leyendas + Totales */}
          <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div className="max-w-xs space-y-1 text-xs text-slate-400">
              {invoice.totalInWords ? <p className="text-sm font-medium text-slate-600">{invoice.totalInWords}</p> : null}
              {invoice.settings.payableTo ? <p>Cheques a nombre de {invoice.settings.payableTo}</p> : null}
              <p>Fecha límite de emisión {formatDate(invoice.issueDeadlineSnapshot)}</p>
              {invoice.settings.footerText ? (
                <p
                  className={
                    invoice.settings.footerText.includes("\n")
                      ? "overflow-x-auto whitespace-pre pt-2 font-mono text-xs leading-none text-slate-500"
                      : "pt-2 text-slate-500"
                  }
                >
                  {invoice.settings.footerText}
                </p>
              ) : null}
            </div>
            <div className="w-full space-y-2.5 text-sm sm:max-w-[240px]">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="tabular-nums text-slate-700">{formatCurrency(invoice.subtotal)}</span></div>
              {invoice.discountTotal > 0 ? (
                <div className="flex justify-between text-slate-500"><span>Descuentos</span><span className="tabular-nums text-slate-700">{formatCurrency(invoice.discountTotal)}</span></div>
              ) : null}
              <div className="flex justify-between text-slate-500"><span>Gravado 15%</span><span className="tabular-nums text-slate-700">{formatCurrency(invoice.taxableAmount15)}</span></div>
              {invoice.taxableAmount18 > 0 ? (
                <div className="flex justify-between text-slate-500"><span>Gravado 18%</span><span className="tabular-nums text-slate-700">{formatCurrency(invoice.taxableAmount18)}</span></div>
              ) : null}
              {invoice.exemptAmount > 0 ? (
                <div className="flex justify-between text-slate-500"><span>Exento</span><span className="tabular-nums text-slate-700">{formatCurrency(invoice.exemptAmount)}</span></div>
              ) : null}
              <div className="flex justify-between text-slate-500"><span>ISV 15%</span><span className="tabular-nums text-slate-700">{formatCurrency(invoice.isv15)}</span></div>
              {invoice.isv18 > 0 ? (
                <div className="flex justify-between text-slate-500"><span>ISV 18%</span><span className="tabular-nums text-slate-700">{formatCurrency(invoice.isv18)}</span></div>
              ) : null}
              <div className="flex items-baseline justify-between border-t border-slate-900/10 pt-3">
                <span className="text-sm font-medium text-slate-500">Total</span>
                <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Historial de correcciones (secundario) */}
        {invoice.corrections.length > 0 ? (
          <Card className="mt-6 p-4 sm:p-6">
            <p className="section-title">Historial de correcciones</p>
            <div className="mt-5 grid gap-3">
              {invoice.corrections.map((correction) => (
                <div key={correction.id} className="rounded-[24px] bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{correction.correctionType}</p>
                  <p className="mt-2">{correction.reason}</p>
                  <p className="mt-2 text-slate-500">{correction.performedByName} · {new Date(correction.createdAt).toLocaleString("es-HN")}</p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <Modal open={Boolean(correctionMode)} onClose={() => setCorrectionMode(null)} title={correctionTitle}>
        <form className="grid gap-4" onSubmit={form.handleSubmit((values) => correctionMutation.mutate(values))}>
          {correctionMode === "customer" || correctionMode === "both" ? (
            <div>
              <Label required htmlFor="newCustomerName">Nuevo nombre del cliente</Label>
              <Input id="newCustomerName" {...form.register("newCustomerName")} />
            </div>
          ) : null}

          {correctionMode === "date" || correctionMode === "both" ? (
            <div>
              <Label required htmlFor="newInvoiceDate">Nueva fecha</Label>
              <Input id="newInvoiceDate" type="date" {...form.register("newInvoiceDate")} />
            </div>
          ) : null}

          <div>
            <Label required htmlFor="reason">Motivo</Label>
            <Textarea id="reason" {...form.register("reason")} />
            {form.formState.errors.reason ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.reason.message}</p> : null}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setCorrectionMode(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={correctionMutation.isPending}>
              {correctionMutation.isPending ? "Aplicando..." : "Aplicar corrección"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

/** useSearchParams exige un Suspense para poder exportar la app como archivos estáticos (escritorio). */
export default function InvoiceDetailPage() {
  return (
    <Suspense fallback={<Spinner label="Cargando factura..." />}>
      <InvoiceDetailContent />
    </Suspense>
  );
}
