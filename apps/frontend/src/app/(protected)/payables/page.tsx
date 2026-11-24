"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
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
import { payablesService } from "@/services/payables-service";
import { suppliersService } from "@/services/suppliers-service";
import type { PayableDocument } from "@/types/api";

const documentSchema = z.object({
  supplierId: z.string().min(1, "Selecciona un proveedor."),
  documentNumber: z.string().min(1, "El número es obligatorio."),
  documentDate: z.string().min(1, "La fecha es obligatoria."),
  dueDate: z.string().optional(),
  description: z.string().optional(),
  total: z.coerce.number().positive("El total debe ser mayor que cero."),
  notes: z.string().optional()
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor que cero."),
  paymentDate: z.string().min(1, "La fecha es obligatoria."),
  method: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA", "OTRO"]),
  reference: z.string().optional(),
  receiptNumber: z.string().optional(),
  notes: z.string().optional()
});

type DocumentValues = z.infer<typeof documentSchema>;
type PaymentValues = z.infer<typeof paymentSchema>;

const statusStyles: Record<PayableDocument["status"], string> = {
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

export default function PayablesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [paying, setPaying] = useState<PayableDocument | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) value.set("search", search);
    if (overdue) value.set("overdue", "true");
    return value;
  }, [overdue, page, pageSize, search]);

  const payablesQuery = useQuery({
    queryKey: ["payables", params.toString()],
    queryFn: () => payablesService.list(params)
  });
  const suppliersQuery = useQuery({
    queryKey: ["payables", "suppliers"],
    queryFn: () => suppliersService.list(new URLSearchParams({ page: "1", pageSize: "100", status: "active" }))
  });

  const documentForm = useForm<DocumentValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: { supplierId: "", documentNumber: "", documentDate: todayInputValue(), dueDate: "", description: "", total: 0, notes: "" }
  });
  const paymentForm = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: 0, paymentDate: todayInputValue(), method: "EFECTIVO", reference: "", receiptNumber: "", notes: "" }
  });

  useEffect(() => {
    if (paying) {
      paymentForm.reset({
        amount: Number(paying.balance),
        paymentDate: todayInputValue(),
        method: "EFECTIVO",
        reference: "",
        receiptNumber: "",
        notes: ""
      });
    }
  }, [paying, paymentForm]);

  const createMutation = useMutation({
    mutationFn: (values: DocumentValues) => payablesService.create({ ...values, supplierId: Number(values.supplierId) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payables"] });
      setDocumentModalOpen(false);
      documentForm.reset();
      setFeedback("Documento por pagar registrado.");
    }
  });

  const payMutation = useMutation({
    mutationFn: (values: PaymentValues) => payablesService.registerPayment(paying!.id, values),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["payables"] });
      setPaying(null);
      setFeedback(`Pago ${response.receiptNumber} registrado. Saldo: ${formatCurrency(response.item.balance)}.`);
    }
  });

  const voidMutation = useMutation({
    mutationFn: (id: number) => payablesService.void(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payables"] });
      setFeedback("Documento anulado.");
    }
  });

  const statementMutation = useMutation({
    mutationFn: (supplierId: number) => payablesService.supplierStatementPdf(supplierId),
    onSuccess: (response) => downloadPdf(response, "estado-cuenta.pdf")
  });

  if (payablesQuery.isLoading || suppliersQuery.isLoading) {
    return <Spinner label="Cargando cuentas por pagar..." />;
  }

  const summary = payablesQuery.data?.summary;

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Cuentas por pagar</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Documentos por pagar a proveedores</h1>
            <p className="mt-3 text-slate-600">Registra facturas de proveedor, abona y consulta el estado de cuenta.</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="rounded-[24px] bg-slate-50 px-5 py-4 text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Saldo por pagar</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatCurrency(summary?.totalDue ?? 0)}</p>
              <p className="text-xs text-slate-500">{summary?.documents ?? 0} documentos</p>
            </div>
            <Button
              type="button"
              onClick={() => {
                documentForm.reset({ supplierId: "", documentNumber: "", documentDate: todayInputValue(), dueDate: "", description: "", total: 0, notes: "" });
                setDocumentModalOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo documento
            </Button>
          </div>
        </div>

        {feedback ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{feedback}</div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <Input
            placeholder="Buscar por número de documento o proveedor"
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
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {payablesQuery.data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Sin cuentas por pagar pendientes.</td>
              </tr>
            ) : null}
            {payablesQuery.data?.items.map((item) => (
              <tr key={item.id}>
                <td data-label="Documento" className="px-4 py-4">
                  <p className="font-semibold text-slate-900">{item.documentNumber}</p>
                  <p className="text-xs text-slate-500">{item.documentDate ? formatDate(item.documentDate) : ""}</p>
                </td>
                <td data-label="Proveedor" className="px-4 py-4 text-slate-700">{item.supplierName}</td>
                <td data-label="Vencimiento" className="px-4 py-4 text-slate-600">{item.dueDate ? formatDate(item.dueDate) : "Sin vencimiento"}</td>
                <td data-label="Total" className="px-4 py-4 text-right tabular-nums text-slate-700">{formatCurrency(item.total)}</td>
                <td data-label="Saldo" className="px-4 py-4 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(item.balance)}</td>
                <td data-label="Estado" className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{item.status}</span>
                </td>
                <td data-label="Acciones" className="px-4 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" size="sm" type="button" disabled={item.balance <= 0} onClick={() => setPaying(item)}>
                      Pagar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={statementMutation.isPending}
                      onClick={() => statementMutation.mutate(item.supplierId)}
                    >
                      <Download className="mr-1 h-4 w-4" />
                      Estado
                    </Button>
                    {Number(item.paidAmount) === 0 ? (
                      <Button variant="ghost" size="sm" type="button" disabled={voidMutation.isPending} onClick={() => voidMutation.mutate(item.id)}>
                        Anular
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      </TableWrapper>

      <Pagination
        pagination={payablesQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />

      <Modal open={documentModalOpen} onClose={() => setDocumentModalOpen(false)} title="Nuevo documento por pagar">
        <form className="grid gap-4" onSubmit={documentForm.handleSubmit(async (values) => createMutation.mutateAsync(values))}>
          <div>
            <Label required htmlFor="supplierId">Proveedor</Label>
            <select id="supplierId" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...documentForm.register("supplierId")}>
              <option value="">Selecciona un proveedor</option>
              {suppliersQuery.data?.items.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} {supplier.rtn ? `- ${supplier.rtn}` : ""}
                </option>
              ))}
            </select>
            {documentForm.formState.errors.supplierId ? <p className="mt-2 text-sm text-rose-600">{documentForm.formState.errors.supplierId.message}</p> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label required htmlFor="documentNumber">N.º de documento</Label>
              <Input id="documentNumber" {...documentForm.register("documentNumber")} />
              {documentForm.formState.errors.documentNumber ? <p className="mt-2 text-sm text-rose-600">{documentForm.formState.errors.documentNumber.message}</p> : null}
            </div>
            <div>
              <Label required htmlFor="documentDate">Fecha</Label>
              <Input id="documentDate" type="date" max={todayInputValue()} {...documentForm.register("documentDate")} />
            </div>
            <div>
              <Label htmlFor="dueDate">Vencimiento</Label>
              <Input id="dueDate" type="date" {...documentForm.register("dueDate")} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div>
              <Label htmlFor="description">Descripción</Label>
              <Input id="description" {...documentForm.register("description")} />
            </div>
            <div>
              <Label required htmlFor="total">Total</Label>
              <Input id="total" {...moneyInput} className="tabular-nums" {...documentForm.register("total")} />
              {documentForm.formState.errors.total ? <p className="mt-2 text-sm text-rose-600">{documentForm.formState.errors.total.message}</p> : null}
            </div>
          </div>
          <div>
            <Label htmlFor="docNotes">Notas</Label>
            <Textarea id="docNotes" {...documentForm.register("notes")} />
          </div>

          {createMutation.error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{(createMutation.error as Error).message}</p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setDocumentModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Guardando..." : "Registrar documento"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title={paying ? `Pago de ${paying.documentNumber}` : "Pago"}>
        {paying ? (
          <form className="grid gap-4" onSubmit={paymentForm.handleSubmit(async (values) => payMutation.mutateAsync(values))}>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Proveedor: <strong>{paying.supplierName}</strong> · Saldo pendiente:{" "}
              <strong className="tabular-nums">{formatCurrency(paying.balance)}</strong>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label required htmlFor="payAmount">Monto del pago</Label>
                <Input id="payAmount" {...moneyInput} className="tabular-nums" {...paymentForm.register("amount")} />
                {paymentForm.formState.errors.amount ? <p className="mt-2 text-sm text-rose-600">{paymentForm.formState.errors.amount.message}</p> : null}
              </div>
              <div>
                <Label required htmlFor="payDate">Fecha</Label>
                <Input id="payDate" type="date" max={todayInputValue()} {...paymentForm.register("paymentDate")} />
              </div>
              <div>
                <Label required htmlFor="payMethod">Método</Label>
                <select id="payMethod" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...paymentForm.register("method")}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="TARJETA">Tarjeta</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div>
                <Label htmlFor="payReceipt">N.º de recibo</Label>
                <Input id="payReceipt" placeholder="Automático si se deja vacío" {...paymentForm.register("receiptNumber")} />
              </div>
            </div>
            <div>
              <Label htmlFor="payReference">Referencia</Label>
              <Input id="payReference" placeholder="N.º de transferencia, cheque, etc." {...paymentForm.register("reference")} />
            </div>
            <div>
              <Label htmlFor="payNotes">Notas</Label>
              <Textarea id="payNotes" {...paymentForm.register("notes")} />
            </div>

            {payMutation.error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{(payMutation.error as Error).message}</p>
            ) : null}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" type="button" onClick={() => setPaying(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={payMutation.isPending}>
                {payMutation.isPending ? "Registrando..." : "Registrar pago"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
