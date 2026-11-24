"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { useLocalPagination } from "@/hooks/use-local-pagination";
import { formatCurrency, formatDate, todayInputValue } from "@/lib/utils";
import { reportsService } from "@/services/reports-service";

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

async function downloadResponse(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = match?.[1] ?? fallback;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(todayInputValue());
  const [saleType, setSaleType] = useState<"all" | "CONTADO" | "CREDITO">("all");
  const [status, setStatus] = useState<"EMITIDA" | "ANULADA" | "all">("EMITIDA");
  const [downloading, setDownloading] = useState(false);

  const params = useMemo(() => {
    const search = new URLSearchParams({ dateFrom, dateTo, saleType, status });
    return search;
  }, [dateFrom, dateTo, saleType, status]);

  const reportQuery = useQuery({
    queryKey: ["reports", "sales", dateFrom, dateTo, saleType, status],
    queryFn: () => reportsService.sales(params),
    enabled: Boolean(dateFrom && dateTo)
  });

  const report = reportQuery.data;
  // Detalle de facturas de 50 en 50 (el reporte trae hasta 1000).
  const invoicesPage = useLocalPagination(report?.invoices ?? [], params.toString());

  const exportCsv = async () => {
    setDownloading(true);
    try {
      const response = await reportsService.salesCsv(params);
      await downloadResponse(response, `ventas_${dateFrom}_${dateTo}.csv`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Reportes</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Reporte de ventas</h1>
            <p className="mt-3 text-slate-600">Ventas por rango de fechas, con desglose por método, producto e ISV.</p>
          </div>
          <Button type="button" variant="secondary" disabled={downloading || !report} onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="dateFrom">Desde</Label>
            <Input id="dateFrom" type="date" value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              // Un rango invertido no tiene resultados: "hasta" acompaña a "desde".
              const value = event.target.value;
              setDateFrom(value);
              if (value && dateTo && value > dateTo) setDateTo(value);
            }} />
          </div>
          <div>
            <Label htmlFor="dateTo">Hasta</Label>
            <Input id="dateTo" type="date" value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              const value = event.target.value;
              setDateTo(value);
              if (value && dateFrom && value < dateFrom) setDateFrom(value);
            }} />
          </div>
          <div>
            <Label htmlFor="saleType">Tipo de venta</Label>
            <select
              id="saleType"
              className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={saleType}
              onChange={(event) => setSaleType(event.target.value as typeof saleType)}
            >
              <option value="all">Todas</option>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>
          <div>
            <Label htmlFor="status">Estado</Label>
            <select
              id="status"
              className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="EMITIDA">Emitidas</option>
              <option value="ANULADA">Anuladas</option>
              <option value="all">Todas</option>
            </select>
          </div>
        </div>
      </Card>

      {reportQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Documentos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{report.summary.documents}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total vendido</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(report.summary.grandTotal)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">ISV (15 + 18)</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(report.summary.taxTotal)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Contado / Crédito</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                {formatCurrency(report.summary.contadoTotal)} <span className="text-slate-400">/</span> {formatCurrency(report.summary.creditoTotal)}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Por método de pago</h2>
              <div className="mt-4">
                <TableWrapper>
                  <Table>
                    <THead>
                      <tr>
                        <th className="px-4 py-3">Método</th>
                        <th className="px-4 py-3 text-right">Docs</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </THead>
                    <TBody>
                      {report.byPaymentMethod.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-slate-500">Sin datos.</td>
                        </tr>
                      ) : null}
                      {report.byPaymentMethod.map((row) => (
                        <tr key={row.method}>
                          <td data-label="Método" className="px-4 py-3 text-slate-700">{row.method}</td>
                          <td data-label="Docs" className="px-4 py-3 text-right tabular-nums text-slate-600">{row.documents}</td>
                          <td data-label="Total" className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
              </div>
            </Card>

            <Card className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-900">Productos más vendidos</h2>
              <div className="mt-4">
                <TableWrapper>
                  <Table>
                    <THead>
                      <tr>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3 text-right">Cant.</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </THead>
                    <TBody>
                      {report.byProduct.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-slate-500">Sin datos.</td>
                        </tr>
                      ) : null}
                      {report.byProduct.map((row, index) => (
                        <tr key={`${row.productId ?? "x"}-${index}`}>
                          <td data-label="Producto" className="px-4 py-3 text-slate-700">{row.description}</td>
                          <td data-label="Cant." className="px-4 py-3 text-right tabular-nums text-slate-600">{row.quantity}</td>
                          <td data-label="Total" className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
              </div>
            </Card>
          </div>

          <Card className="p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Detalle de facturas</h2>
            <p className="text-sm text-slate-500">{report.invoices.length} documentos (máx. 1000).</p>
            <div className="mt-4">
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </THead>
                  <TBody>
                    {report.invoices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Sin ventas en el rango.</td>
                      </tr>
                    ) : null}
                    {invoicesPage.items.map((invoice) => (
                      <tr key={invoice.id}>
                        <td data-label="Número" className="px-4 py-3 font-semibold text-slate-900">{invoice.invoiceNumber}</td>
                        <td data-label="Fecha" className="px-4 py-3 text-slate-600">{invoice.invoiceDate ? formatDate(invoice.invoiceDate) : "N/D"}</td>
                        <td data-label="Cliente" className="px-4 py-3 text-slate-700">{invoice.customerName}</td>
                        <td data-label="Tipo" className="px-4 py-3 text-slate-600">{invoice.saleType}</td>
                        <td data-label="Método" className="px-4 py-3 text-slate-600">
                          {invoice.saleType === "CREDITO" ? "CRÉDITO" : invoice.tenderMethod ?? "EFECTIVO"}
                        </td>
                        <td data-label="Total" className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(invoice.grandTotal)}</td>
                      </tr>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
              <div className="mt-4">
                <Pagination {...invoicesPage} />
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </section>
  );
}
