"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { integerInput, moneyInput, quantityInput } from "@/lib/number-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, todayInputValue } from "@/lib/utils";
import { receivablesService } from "@/services/receivables-service";
import type { InvoicePaymentStatus, Receivable } from "@/types/api";

const paymentSchema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor que cero."),
  paymentDate: z.string().min(1, "La fecha es obligatoria."),
  method: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA", "OTRO"]),
  reference: z.string().optional(),
  receiptNumber: z.string().optional(),
  notes: z.string().optional()
});

type PaymentValues = z.infer<typeof paymentSchema>;

const statusStyles: Record<InvoicePaymentStatus, string> = {
  PENDIENTE: "bg-amber-100 text-amber-800",
  PARCIAL: "bg-sky-100 text-sky-700",
  PAGADA: "bg-emerald-100 text-emerald-700",
  ANULADA: "bg-slate-200 text-slate-600"
};

async function downloadPdf(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] ?? fallback;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ReceivablesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [paying, setPaying] = useState<Receivable | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) value.set("search", search);
    if (overdue) value.set("overdue", "true");
    return value;
  }, [overdue, page, pageSize, search]);

  const receivablesQuery = useQuery({
    queryKey: ["receivables", params.toString()],
    queryFn: () => receivablesService.list(params)
  });

  const form = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: 0, paymentDate: todayInputValue(), method: "EFECTIVO", reference: "", receiptNumber: "", notes: "" }
  });

  useEffect(() => {
    if (paying) {
      form.reset({
        amount: Number(paying.balance),
        paymentDate: todayInputValue(),
        method: "EFECTIVO",
        reference: "",
        receiptNumber: "",
        notes: ""
      });
    }
  }, [paying, form]);

  const payMutation = useMutation({
    mutationFn: (values: PaymentValues) => receivablesService.registerPayment(paying!.id, values),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["receivables"] });
      setPaying(null);
      setFeedback(`Abono ${response.receiptNumber} registrado. Saldo: ${formatCurrency(response.item.balance)}.`);
    }
  });

  const statementMutation = useMutation({
    mutationFn: (clientId: number) => receivablesService.clientStatementPdf(clientId),
    onSuccess: (response) => downloadPdf(response, "estado-cuenta.pdf")
  });

  if (receivablesQuery.isLoading) {
    return <Spinner label="Cargando cuentas por cobrar..." />;
  }

  const summary = receivablesQuery.data?.summary;

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Cuentas por cobrar</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Facturas a crédito con saldo</h1>
            <p className="mt-3 text-slate-600">Registra abonos y consulta el estado de cuenta de cada cliente.</p>
          </div>
          <div className="rounded-[24px] bg-slate-50 px-5 py-4 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Saldo por cobrar</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(summary?.totalDue ?? 0)}</p>
            <p className="text-xs text-slate-500">{summary?.documents ?? 0} documentos</p>
          </div>
        </div>

        {feedback ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{feedback}</div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <Input
            placeholder="Buscar por número de factura o cliente"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(event) => {
                setOverdue(event.target.checked);
                setPage(1);
              }}
            />
            Solo vencidas
          </label>
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">Factura</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {receivablesQuery.data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Sin cuentas por cobrar pendientes.</td>
              </tr>
            ) : null}
            {receivablesQuery.data?.items.map((item) => (
              <tr key={item.id}>
                <td data-label="Factura" className="px-4 py-4">
                  <p className="font-mono text-sm font-semibold text-slate-900">{item.invoiceNumber}</p>
                  <p className="text-xs text-slate-500">{item.invoiceDate ? formatDate(item.invoiceDate) : ""}</p>
                </td>
                <td data-label="Cliente" className="px-4 py-4 text-slate-700">{item.customerName}</td>
                <td data-label="Vencimiento" className="px-4 py-4 text-slate-600">{item.dueDate ? formatDate(item.dueDate) : "Sin vencimiento"}</td>
                <td data-label="Total" className="px-4 py-4 text-right tabular-nums text-slate-700">{formatCurrency(item.grandTotal)}</td>
                <td data-label="Saldo" className="px-4 py-4 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(item.balance)}</td>
                <td data-label="Estado" className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.paymentStatus]}`}>
                    {item.paymentStatus}
                  </span>
                </td>
                <td data-label="Acciones" className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" type="button" onClick={() => setPaying(item)}>
                      Abonar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={!item.customerId || statementMutation.isPending}
                      onClick={() => item.customerId && statementMutation.mutate(item.customerId)}
                    >
                      <Download className="mr-1 h-4 w-4" />
                      Estado
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      </TableWrapper>

      <Pagination
        pagination={receivablesQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />

      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title={paying ? `Abono a ${paying.invoiceNumber}` : "Abono"}>
        {paying ? (
          <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => payMutation.mutateAsync(values))}>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Cliente: <strong>{paying.customerName}</strong> · Saldo pendiente:{" "}
              <strong className="tabular-nums">{formatCurrency(paying.balance)}</strong>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label required htmlFor="amount">Monto del abono</Label>
                <Input id="amount" {...moneyInput} className="tabular-nums" {...form.register("amount")} />
                {form.formState.errors.amount ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.amount.message}</p> : null}
              </div>
              <div>
                <Label required htmlFor="paymentDate">Fecha</Label>
                <Input id="paymentDate" type="date" max={todayInputValue()} {...form.register("paymentDate")} />
              </div>
              <div>
                <Label required htmlFor="method">Método</Label>
                <select id="method" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...form.register("method")}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div>
                <Label htmlFor="receiptNumber">N.º de recibo</Label>
                <Input id="receiptNumber" placeholder="Automático si se deja vacío" {...form.register("receiptNumber")} />
              </div>
            </div>
            <div>
              <Label htmlFor="reference">Referencia</Label>
              <Input id="reference" placeholder="N.º de transferencia, cheque, etc." {...form.register("reference")} />
            </div>
            <div>
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" {...form.register("notes")} />
            </div>

            {payMutation.error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{(payMutation.error as Error).message}</p>
            ) : null}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={() => setPaying(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={payMutation.isPending}>
                {payMutation.isPending ? "Registrando..." : "Registrar abono"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
