"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CaiWarnings } from "@/components/forms/cai-warnings";
import { PrintSetupNotice } from "@/components/forms/print-setup-notice";
import { PrintButton } from "@/components/ui/print-button";
import { Spinner } from "@/components/ui/spinner";
import { PAGE_SIZE_DEFAULT, Pagination } from "@/components/ui/pagination";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { invoicesService } from "@/services/invoices-service";
import { useToast } from "@/components/ui/toast";
import { usePrintSetup } from "@/hooks/use-print-setup";
import { printLetter } from "@/lib/ticket-print";
import { filenameFromResponse, formatCurrency, formatDate } from "@/lib/utils";

/** Imprime en la impresora de carta de este equipo (programa de impresión). */
async function printLetterDocument(invoiceId: number, toast: ReturnType<typeof useToast>) {
  try {
    await printLetter(async () => (await invoicesService.pdf(invoiceId)).blob());
    toast.success("Documento enviado a la impresora.");
  } catch (error) {
    toast.error((error as Error).message);
  }
}

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

export default function InvoicesPage() {
  const printSetup = usePrintSetup();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Páginas de 50 como máximo; al cambiar un filtro se vuelve a la primera.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  useEffect(() => setPage(1), [customer, dateFrom, dateTo, search]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });

    if (search) value.set("search", search);
    if (customer) value.set("customer", customer);
    if (dateFrom) value.set("dateFrom", dateFrom);
    if (dateTo) value.set("dateTo", dateTo);

    return value;
  }, [customer, dateFrom, dateTo, search, page, pageSize]);

  const invoicesQuery = useQuery({
    queryKey: ["invoices", params.toString()],
    placeholderData: keepPreviousData,
    // Siempre se pide de nuevo al entrar: puede haber documentos nuevos de esta u otra caja.
    refetchOnMount: "always",
    queryFn: () => invoicesService.list(params)
  });

  if (invoicesQuery.isLoading) {
    return <Spinner label="Cargando historial de facturas..." />;
  }

  return (
    <section className="grid gap-6">
      <CaiWarnings />
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Facturas</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Historial de facturación</h1>
            <p className="mt-3 text-slate-600">Busca por número, cliente o rango de fechas. Desde aquí puedes consultar, imprimir y descargar PDF.</p>
          </div>
          <Link href="/invoices/new">
            <Button>Nueva factura</Button>
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input placeholder="Número de factura" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Input placeholder="Cliente" value={customer} onChange={(event) => setCustomer(event.target.value)} />
          <Input type="date" value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              // Un rango invertido no tiene resultados: "hasta" acompaña a "desde".
              const value = event.target.value;
              setDateFrom(value);
              if (value && dateTo && value > dateTo) setDateTo(value);
            }} />
          <Input type="date" value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              const value = event.target.value;
              setDateTo(value);
              if (value && dateFrom && value < dateFrom) setDateFrom(value);
            }} />
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {invoicesQuery.data?.items.map((invoice) => (
              <tr key={invoice.id}>
                <td data-label="Número" className="px-4 py-4 font-medium text-slate-900">{invoice.invoiceNumber}</td>
                <td data-label="Cliente" className="px-4 py-4 text-slate-600">{invoice.customerName}</td>
                <td data-label="Fecha" className="px-4 py-4 text-slate-600">{formatDate(invoice.invoiceDate)}</td>
                <td data-label="Estado" className="px-4 py-4">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">{invoice.status}</span>
                </td>
                <td data-label="Total" className="px-4 py-4 text-right font-semibold text-slate-900">{formatCurrency(invoice.grandTotal)}</td>
                <td data-label="Acciones" className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <Link href={`/invoices/detail?id=${invoice.id}`}>
                      <Button size="sm" variant="secondary">Ver</Button>
                    </Link>
                    {printSetup.letter ? (
                      <PrintButton size="sm" variant="ghost" onPrint={() => printLetterDocument(invoice.id, toast)}>
                        Imprimir
                      </PrintButton>
                    ) : (
                      <PrintSetupNotice kinds={["letter"]} compact />
                    )}
                    <Button size="sm" variant="ghost" type="button" onClick={() => void downloadPdf(invoice.id, invoice.invoiceNumber)}>
                      PDF
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      </TableWrapper>
      <Pagination
        pagination={invoicesQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </section>
  );
}
