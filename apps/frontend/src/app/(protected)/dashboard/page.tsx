"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { clientsService } from "@/services/clients-service";
import { invoicesService } from "@/services/invoices-service";
import { settingsService } from "@/services/settings-service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useCompany } from "@/hooks/use-company";

export default function DashboardPage() {
  const { activeCompany } = useCompany();
  const clientsQuery = useQuery({
    queryKey: ["dashboard", "clients"],
    queryFn: () => clientsService.list(new URLSearchParams({ page: "1", pageSize: "5", status: "active" }))
  });
  const invoicesQuery = useQuery({
    queryKey: ["dashboard", "invoices"],
    // Siempre se pide de nuevo al entrar: puede haber documentos nuevos de esta u otra caja.
    refetchOnMount: "always",
    queryFn: () => invoicesService.list(new URLSearchParams({ page: "1", pageSize: "5" }))
  });
  const settingsQuery = useQuery({
    queryKey: ["dashboard", "settings"],
    queryFn: () => settingsService.getBilling()
  });

  if (clientsQuery.isLoading || invoicesQuery.isLoading || settingsQuery.isLoading) {
    return <Spinner label="Cargando resumen operativo..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="overflow-hidden p-4 sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="section-title">Resumen</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Panel de {activeCompany?.commercialName}</h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Visualiza el ritmo de facturación, la base de clientes y la configuración fiscal activa de la empresa seleccionada.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="section-title">Clientes</p>
              <p className="mt-4 text-3xl font-semibold">{clientsQuery.data?.pagination.total ?? 0}</p>
            </Card>
            <Card className="p-5">
              <p className="section-title">Facturas</p>
              <p className="mt-4 text-3xl font-semibold">{invoicesQuery.data?.pagination.total ?? 0}</p>
            </Card>
            <Card className="p-5">
              <p className="section-title">ISV</p>
              <p className="mt-4 text-3xl font-semibold">{settingsQuery.data?.item.defaultTaxRate ?? 0}%</p>
            </Card>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="section-title">Últimas facturas</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Actividad reciente</h2>
            </div>
            <Link className="text-sm font-semibold text-brand" href="/invoices">
              Ver historial completo
            </Link>
          </div>

          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </THead>
              <TBody>
                {invoicesQuery.data?.items.map((invoice) => (
                  <tr key={invoice.id}>
                    <td data-label="Número" className="px-4 py-3 font-medium text-slate-900">{invoice.invoiceNumber}</td>
                    <td data-label="Cliente" className="px-4 py-3 text-slate-600">{invoice.customerName}</td>
                    <td data-label="Fecha" className="px-4 py-3 text-slate-600">{formatDate(invoice.invoiceDate)}</td>
                    <td data-label="Total" className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(invoice.grandTotal)}</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </Card>

        <Card className="p-4 sm:p-6">
          <p className="section-title">Configuración fiscal</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Parámetros activos</h2>
          <div className="mt-6 grid gap-4">
            <div className="rounded-[24px] bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Título</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{settingsQuery.data?.item.invoiceTitle}</p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Pagadero a</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{settingsQuery.data?.item.payableTo ?? activeCompany?.legalName}</p>
            </div>
            <div className="rounded-[24px] bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Pie de factura</p>
              <p
                className={
                  settingsQuery.data?.item.footerText?.includes("\n")
                    ? "mt-2 overflow-x-auto whitespace-pre font-mono text-xs leading-none text-slate-700"
                    : "mt-2 text-slate-700"
                }
              >
                {settingsQuery.data?.item.footerText ?? "Sin texto configurado"}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
