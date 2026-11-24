"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PrintSetupNotice } from "@/components/forms/print-setup-notice";
import { PrintButton } from "@/components/ui/print-button";
import { Spinner } from "@/components/ui/spinner";
import { PAGE_SIZE_DEFAULT, Pagination } from "@/components/ui/pagination";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { usePrintSetup } from "@/hooks/use-print-setup";
import { printLetter } from "@/lib/ticket-print";
import { filenameFromResponse, formatCurrency, formatDate } from "@/lib/utils";
import { proformasService } from "@/services/proformas-service";

const statuses = ["", "BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA", "FACTURADA"];

/** Imprime en la impresora de carta de este equipo (programa de impresión). */
async function printLetterDocument(proformaId: number, toast: ReturnType<typeof useToast>) {
  try {
    await printLetter(async () => (await proformasService.pdf(proformaId)).blob());
    toast.success("Documento enviado a la impresora.");
  } catch (error) {
    toast.error((error as Error).message);
  }
}

async function downloadPdf(proformaId: number) {
  const response = await proformasService.pdf(proformaId);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromResponse(response, `proforma-${proformaId}.pdf`);
  link.click();
  URL.revokeObjectURL(url);
}

function statusClass(status: string) {
  if (status === "FACTURADA") return "bg-emerald-100 text-emerald-700";
  if (status === "APROBADA") return "bg-sky-100 text-sky-700";
  if (status === "RECHAZADA" || status === "VENCIDA") return "bg-rose-100 text-rose-700";
  if (status === "ENVIADA") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export default function ProformasPage() {
  const printSetup = usePrintSetup();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Páginas de 50 como máximo; al cambiar un filtro se vuelve a la primera.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  useEffect(() => setPage(1), [customer, dateFrom, dateTo, search, status]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });

    if (search) value.set("search", search);
    if (customer) value.set("customer", customer);
    if (status) value.set("status", status);
    if (dateFrom) value.set("dateFrom", dateFrom);
    if (dateTo) value.set("dateTo", dateTo);

    return value;
  }, [customer, dateFrom, dateTo, search, status, page, pageSize]);

  const proformasQuery = useQuery({
    queryKey: ["proformas", params.toString()],
    placeholderData: keepPreviousData,
    // Siempre se pide de nuevo al entrar: puede haber documentos nuevos de esta u otra caja.
    refetchOnMount: "always",
    queryFn: () => proformasService.list(params)
  });

  if (proformasQuery.isLoading) {
    return <Spinner label="Cargando proformas..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Proformas</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Historial de proformas</h1>
            <p className="mt-3 text-slate-600">Crea, envía, aprueba y convierte proformas a facturas con correlativo propio.</p>
          </div>
          <Link href="/proformas/new">
            <Button>Nueva proforma</Button>
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input placeholder="Número de proforma" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Input placeholder="Cliente" value={customer} onChange={(event) => setCustomer(event.target.value)} />
          <select
            className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {statuses.map((item) => (
              <option key={item || "all"} value={item}>
                {item || "Todos los estados"}
              </option>
            ))}
          </select>
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
              <th className="px-4 py-3">Validez</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {proformasQuery.data?.items.map((proforma) => (
              <tr key={proforma.id}>
                <td data-label="Número" className="px-4 py-4 font-medium text-slate-900">
                  {proforma.proformaNumber}
                </td>
                <td data-label="Cliente" className="px-4 py-4 text-slate-600">
                  {proforma.customerName}
                </td>
                <td data-label="Fecha" className="px-4 py-4 text-slate-600">
                  {formatDate(proforma.proformaDate)}
                </td>
                <td data-label="Validez" className="px-4 py-4 text-slate-600">
                  {proforma.validUntil ? formatDate(proforma.validUntil) : "Sin fecha"}
                </td>
                <td data-label="Estado" className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(proforma.status)}`}>{proforma.status}</span>
                </td>
                <td data-label="Total" className="px-4 py-4 text-right font-semibold text-slate-900">
                  {formatCurrency(proforma.grandTotal)}
                </td>
                <td data-label="Acciones" className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <Link href={`/proformas/detail?id=${proforma.id}`}>
                      <Button size="sm" variant="secondary">Ver</Button>
                    </Link>
                    {printSetup.letter ? (
                      <PrintButton size="sm" variant="ghost" onPrint={() => printLetterDocument(proforma.id, toast)}>
                        Imprimir
                      </PrintButton>
                    ) : (
                      <PrintSetupNotice kinds={["letter"]} compact />
                    )}
                    <Button size="sm" variant="ghost" type="button" onClick={() => void downloadPdf(proforma.id)}>
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
        pagination={proformasQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </section>
  );
}
