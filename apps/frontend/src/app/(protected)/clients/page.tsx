"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileText, Mail, MapPin, Pencil, Phone, Plus, Search, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DeactivateButton, DeactivatedLink } from "@/components/ui/deactivation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Pagination as PaginationControls } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { formatPhone, formatRtn, rtnDigits, validPhone, validRtnPlace } from "@/lib/masks";
import { filenameFromResponse, formatCurrency, formatDate } from "@/lib/utils";
import { clientsService } from "@/services/clients-service";
import { receivablesService } from "@/services/receivables-service";
import type { Client } from "@/types/api";

const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Escribe el nombre del cliente (mínimo 2 letras).")
    .max(180, "Máximo 180 caracteres.")
    .regex(/\p{L}/u, "El nombre debe tener letras."),
  rtn: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{13,14}$/.test(rtnDigits(value)), "Debe tener 14 dígitos (o 13 si es un DNI).")
    .refine((value) => value === "" || rtnDigits(value).length < 13 || validRtnPlace(rtnDigits(value)), "Los 4 primeros dígitos deben ser un departamento (01 a 18) y municipio válidos."),
  email: z.string().trim().max(150, "Máximo 150 caracteres.").email("Escribe un correo válido, por ejemplo cliente@correo.com.").or(z.literal("")),
  phone: z.string().trim().refine(validPhone, "Escribe 8 dígitos, por ejemplo 9999-9999 (o empieza con + si es de otro país)."),
  address: z.string().trim().max(255, "Máximo 255 caracteres.")
});

type ClientFormValues = z.infer<typeof clientSchema>;

const emptyValues: ClientFormValues = { name: "", rtn: "", email: "", phone: "", address: "" };

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1.5 text-sm text-rose-600" role="alert">
      {message}
    </p>
  ) : null;
}

function GenericBadge() {
  return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">Genérico</span>;
}

async function downloadPdf(response: Response, fallback: string) {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromResponse(response, fallback);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);

  // Busca al dejar de escribir (no en cada tecla).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const params = useMemo(() => {
    // La vista principal solo muestra activos; los desactivados están en Administración → Desactivados.
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: "active" });
    if (search) {
      value.set("search", search);
    }
    return value;
  }, [page, pageSize, search]);

  const clientsQuery = useQuery({
    queryKey: ["clients", params.toString()],
    queryFn: () => clientsService.list(params),
    placeholderData: (previous) => previous
  });

  const summaryQuery = useQuery({
    queryKey: ["clients", "summary", viewingId],
    queryFn: () => clientsService.summary(viewingId!),
    enabled: viewingId !== null
  });

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: emptyValues
  });

  const openCreate = () => {
    setEditingClient(null);
    form.reset(emptyValues);
    saveMutation.reset();
    setFormOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    form.reset({
      name: client.name,
      rtn: formatRtn(client.rtn),
      email: client.email ?? "",
      phone: client.phone ?? "",
      address: client.address ?? ""
    });
    saveMutation.reset();
    setViewingId(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingClient(null);
  };

  const saveMutation = useMutation({
    mutationFn: (values: ClientFormValues) =>
      editingClient ? clientsService.update(editingClient.id, values) : clientsService.create({ ...values, isGeneric: false }),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(editingClient ? `Cliente ${response.item.name} actualizado.` : `Cliente ${response.item.name} creado.`);
      closeForm();
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ client, isActive }: { client: Client; isActive: boolean }) => clientsService.updateStatus(client.id, isActive),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      setViewingId(null);
      toast.success(`Cliente ${response.item.name} desactivado.`);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const statementMutation = useMutation({
    mutationFn: (clientId: number) => receivablesService.clientStatementPdf(clientId),
    onSuccess: (response) => downloadPdf(response, "estado-cuenta.pdf"),
    onError: (error: Error) => toast.error(error.message)
  });

  const onSubmit = form.handleSubmit((values) => saveMutation.mutate(values));

  if (clientsQuery.isLoading) {
    return <Spinner label="Cargando clientes..." />;
  }

  const items = clientsQuery.data?.items ?? [];
  const rtnValue = form.watch("rtn");
  const rtnField = form.register("rtn");
  const phoneField = form.register("phone");
  const summary = summaryQuery.data;

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Clientes</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Clientes</h1>
            <p className="mt-3 text-slate-600">Datos de facturación, saldo pendiente y compras de cada cliente.</p>
          </div>
          {can("clients.create") ? (
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo cliente
            </Button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              className="pl-11"
              placeholder="Buscar por nombre, RTN, código, teléfono o correo"
              aria-label="Buscar clientes"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <DeactivatedLink type="clientes" />
        </div>
      </Card>

      {items.length === 0 ? (
        <Card className="grid justify-items-center gap-3 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Users className="h-6 w-6" />
          </div>
          {search ? (
            <>
              <p className="font-semibold text-slate-900">No hay clientes que coincidan con “{search}”</p>
              <p className="text-sm text-slate-500">Revisa lo que escribiste o busca por otro dato.</p>
              <Button variant="secondary" type="button" onClick={() => setSearchInput("")}>
                Limpiar búsqueda
              </Button>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-900">Aún no hay clientes</p>
              <p className="text-sm text-slate-500">Registra a tus clientes para facturarles más rápido y llevar sus cuentas.</p>
              {can("clients.create") ? (
                <Button type="button" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo cliente
                </Button>
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <>
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">RTN</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3 text-right">Saldo pendiente</th>
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </THead>
              <TBody>
                {items.map((client) => {
                  const balance = client.pendingBalance ?? 0;
                  return (
                    <tr key={client.id}>
                      <td data-label="Cliente" className="px-4 py-4">
                        <button
                          type="button"
                          className="text-left font-semibold text-slate-900 hover:text-brand hover:underline"
                          onClick={() => setViewingId(client.id)}
                        >
                          {client.name}
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                          <span>Código {client.code ?? client.id}</span>
                          {client.isGeneric ? <GenericBadge /> : null}
                        </div>
                      </td>
                      <td data-label="RTN" className="px-4 py-4 font-mono text-sm text-slate-700">
                        {client.rtn ? formatRtn(client.rtn) : <span className="font-sans text-slate-400">Sin RTN</span>}
                      </td>
                      <td data-label="Contacto" className="px-4 py-4 text-sm text-slate-600">
                        {client.phone || client.email ? (
                          <div className="grid gap-1">
                            {client.phone ? (
                              <span className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                {client.phone}
                              </span>
                            ) : null}
                            {client.email ? (
                              <span className="flex items-center gap-1.5 break-all">
                                <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                                {client.email}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">Sin contacto</span>
                        )}
                      </td>
                      <td data-label="Saldo pendiente" className="px-4 py-4 text-right tabular-nums">
                        {balance > 0 ? (
                          <span className="font-semibold text-amber-700">{formatCurrency(balance)}</span>
                        ) : (
                          <span className="text-sm text-slate-400">Al día</span>
                        )}
                      </td>
                      <td data-label="Última compra" className="px-4 py-4 text-sm text-slate-600">
                        {client.lastPurchaseDate ? formatDate(client.lastPurchaseDate) : <span className="text-slate-400">Sin compras</span>}
                      </td>
                      <td data-label="Acciones" className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="secondary" size="sm" type="button" onClick={() => setViewingId(client.id)}>
                            Ver
                          </Button>
                          {can("clients.edit") ? (
                            <>
                              <Button variant="secondary" size="sm" type="button" onClick={() => openEdit(client)}>
                                Editar
                              </Button>
                              <DeactivateButton
                                active
                                label={client.name}
                                pending={statusMutation.isPending}
                                disabled={Boolean(client.isGeneric)}
                                title={client.isGeneric ? "El cliente genérico no se puede desactivar." : undefined}
                                onChange={(isActive) => statusMutation.mutate({ client, isActive })}
                              />
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>

          <PaginationControls
            pagination={clientsQuery.data?.pagination}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        </>
      )}

      {/* Ficha del cliente */}
      <Modal open={viewingId !== null} onClose={() => setViewingId(null)} eyebrow="Cliente" title={summary?.client.name ?? "Cliente"}>
        {summaryQuery.isLoading || !summary ? (
          <Spinner label="Cargando cliente..." />
        ) : (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>Código {summary.client.code ?? summary.client.id}</span>
              {summary.client.isGeneric ? <GenericBadge /> : null}
            </div>

            <dl className="grid gap-3 rounded-[20px] bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-500">RTN</dt>
                  <dd className="font-mono text-slate-900">{summary.client.rtn ? formatRtn(summary.client.rtn) : "Sin RTN"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-500">Teléfono</dt>
                  <dd className="text-slate-900">{summary.client.phone ?? "Sin teléfono"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-xs text-slate-500">Correo</dt>
                  <dd className="break-all text-slate-900">{summary.client.email ?? "Sin correo"}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <div>
                  <dt className="text-xs text-slate-500">Dirección</dt>
                  <dd className="text-slate-900">{summary.client.address ?? "Sin dirección"}</dd>
                </div>
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-[18px] border border-border p-3">
                <p className="text-xs text-slate-500">Facturas</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{summary.stats.invoiceCount}</p>
              </div>
              <div className="rounded-[18px] border border-border p-3">
                <p className="text-xs text-slate-500">Total comprado</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(summary.stats.totalPurchased)}</p>
              </div>
              <div className={summary.stats.pendingBalance > 0 ? "rounded-[18px] border border-amber-200 bg-amber-50 p-3" : "rounded-[18px] border border-border p-3"}>
                <p className="text-xs text-slate-500">Saldo pendiente</p>
                <p className={summary.stats.pendingBalance > 0 ? "mt-1 text-lg font-semibold tabular-nums text-amber-700" : "mt-1 text-lg font-semibold tabular-nums text-slate-900"}>
                  {formatCurrency(summary.stats.pendingBalance)}
                </p>
              </div>
              <div className="rounded-[18px] border border-border p-3">
                <p className="text-xs text-slate-500">Última compra</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{summary.stats.lastPurchaseDate ? formatDate(summary.stats.lastPurchaseDate) : "Sin compras"}</p>
              </div>
            </div>

            {summary.stats.overdueCount > 0 ? (
              <div className="flex items-start gap-2 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Tiene {summary.stats.overdueCount} {summary.stats.overdueCount === 1 ? "factura vencida" : "facturas vencidas"} sin pagar.
                </p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">Últimas facturas</p>
              {summary.recentInvoices.length === 0 ? (
                <p className="rounded-[16px] bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Todavía no tiene facturas.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-[16px] border border-border">
                  {summary.recentInvoices.map((invoice) => (
                    <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <div>
                        {can("invoices.view") ? (
                          <Link href={`/invoices/detail?id=${invoice.id}`} className="font-mono font-semibold text-slate-900 hover:text-brand hover:underline">
                            {invoice.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="font-mono font-semibold text-slate-900">{invoice.invoiceNumber}</span>
                        )}
                        <p className="text-xs text-slate-500">
                          {formatDate(invoice.invoiceDate)} · {invoice.saleType === "CREDITO" ? "Crédito" : "Contado"}
                        </p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-semibold text-slate-900">{formatCurrency(invoice.grandTotal)}</p>
                        {invoice.balance > 0 ? <p className="text-xs text-amber-700">Debe {formatCurrency(invoice.balance)}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {can("receivables.view") && summary.stats.invoiceCount > 0 ? (
                <Button
                  variant="secondary"
                  type="button"
                  disabled={statementMutation.isPending}
                  onClick={() => statementMutation.mutate(summary.client.id)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {statementMutation.isPending ? "Generando..." : "Estado de cuenta"}
                </Button>
              ) : null}
              {can("clients.edit") ? (
                <Button type="button" onClick={() => openEdit(summary.client)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar datos
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      {/* Crear / editar */}
      <Modal open={formOpen} onClose={closeForm} title={editingClient ? "Editar cliente" : "Nuevo cliente"}>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          {editingClient ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <UserRound className="h-4 w-4" aria-hidden />
              <span>Código {editingClient.code ?? editingClient.id}</span>
              {editingClient.isGeneric ? <GenericBadge /> : null}
            </div>
          ) : null}
          {editingClient?.isGeneric ? (
            <p className="rounded-[16px] bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Este es el cliente que se usa en las ventas sin cliente. Puedes cambiar su nombre y datos, pero no desactivarlo.
            </p>
          ) : null}

          <div>
            <Label required htmlFor="name">
              Nombre o razón social
            </Label>
            <Input id="name" autoFocus autoComplete="off" maxLength={180} aria-invalid={Boolean(form.formState.errors.name)} {...form.register("name")} />
            <FieldError message={form.formState.errors.name?.message} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="rtn">RTN</Label>
              <Input
                id="rtn"
                className="font-mono"
                inputMode="numeric"
                autoComplete="off"
                maxLength={16}
                placeholder="0801-1990-123456"
                aria-invalid={Boolean(form.formState.errors.rtn)}
                aria-describedby="rtn-help"
                {...rtnField}
                onChange={(event) => {
                  event.target.value = formatRtn(event.target.value);
                  void rtnField.onChange(event);
                }}
              />
              {form.formState.errors.rtn ? (
                <FieldError message={form.formState.errors.rtn.message} />
              ) : (
                <p id="rtn-help" className="mt-1.5 text-xs text-slate-500">
                  14 dígitos (13 si es DNI); los guiones se ponen solos. {rtnValue ? `${rtnDigits(rtnValue).length} de 14.` : "Déjalo vacío si es consumidor final."}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="9999-9999"
                aria-invalid={Boolean(form.formState.errors.phone)}
                {...phoneField}
                onChange={(event) => {
                  event.target.value = formatPhone(event.target.value);
                  void phoneField.onChange(event);
                }}
              />
              <FieldError message={form.formState.errors.phone?.message} />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" inputMode="email" autoComplete="email" maxLength={150} aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
            <FieldError message={form.formState.errors.email?.message} />
          </div>

          <div>
            <Label htmlFor="address">Dirección</Label>
            <Textarea id="address" rows={2} maxLength={255} {...form.register("address")} />
            <FieldError message={form.formState.errors.address?.message} />
          </div>

          {saveMutation.error ? (
            <div className="flex items-start gap-2 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{saveMutation.error.message}</p>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={closeForm}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editingClient ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
