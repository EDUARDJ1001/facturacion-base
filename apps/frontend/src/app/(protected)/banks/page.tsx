"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Ban, CheckCircle2, FileSignature, Landmark, Pencil, Plus, Power, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { PAGE_SIZE_DEFAULT, Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatDate, todayInputValue } from "@/lib/utils";
import { banksService, type BankAccount, type BankMovement, type BankMovementType } from "@/services/banks-service";

const TYPE_LABELS: Record<BankMovementType, string> = {
  DEPOSITO: "Depósito",
  RETIRO: "Retiro",
  TRANSFERENCIA_ENTRADA: "Transferencia recibida",
  TRANSFERENCIA_SALIDA: "Transferencia enviada",
  COMISION: "Comisión bancaria",
  INTERES: "Interés",
  NOTA_CREDITO: "Nota de crédito",
  NOTA_DEBITO: "Nota de débito",
  CHEQUE: "Cheque"
};
const MANUAL_TYPES = ["DEPOSITO", "RETIRO", "COMISION", "INTERES", "NOTA_CREDITO", "NOTA_DEBITO"] as const;

function money(value: number, currency: "HNL" | "USD") {
  return new Intl.NumberFormat("es-HN", { style: "currency", currency }).format(value);
}

/** Solo los últimos 4 dígitos a la vista. */
function maskedNumber(accountNumber: string) {
  return `•••• ${accountNumber.replace(/\D/g, "").slice(-4)}`;
}

const twoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
const amountField = z.coerce.number({ message: "Escribe el monto." }).positive("El monto debe ser mayor que cero.").refine(twoDecimals, "Máximo 2 decimales.");
const dateField = z.string().min(1, "Elige la fecha.").refine((value) => value <= todayInputValue(), "La fecha no puede ser posterior a hoy.");

const accountSchema = z.object({
  bankName: z.string().trim().min(2, "Escribe el nombre del banco.").max(80, "Máximo 80 caracteres."),
  accountType: z.enum(["CORRIENTE", "AHORRO"]),
  currency: z.enum(["HNL", "USD"]),
  accountNumber: z
    .string()
    .trim()
    .min(4, "Escribe el número de cuenta (al menos 4 dígitos).")
    .max(40, "Máximo 40 caracteres.")
    .regex(/^[\d\s-]+$/, "Solo números, espacios y guiones."),
  alias: z.string().trim().max(80, "Máximo 80 caracteres."),
  openingBalance: z.coerce.number({ message: "Escribe el saldo inicial (0 si empieza vacía)." }).refine(twoDecimals, "Máximo 2 decimales."),
  openingDate: dateField
});
type AccountInput = z.input<typeof accountSchema>;
type AccountValues = z.output<typeof accountSchema>;

const movementSchema = z.object({
  kind: z.enum(["movement", "check", "transfer"]),
  movementType: z.string(),
  movementDate: dateField,
  amount: amountField,
  toAccountId: z.string(),
  checkNumber: z.string().trim().max(30, "Máximo 30 caracteres."),
  beneficiary: z.string().trim().max(150, "Máximo 150 caracteres."),
  reference: z.string().trim().max(60, "Máximo 60 caracteres."),
  description: z.string().trim().max(255, "Máximo 255 caracteres.")
}).superRefine((value, ctx) => {
  if (value.kind === "check") {
    if (!value.checkNumber) ctx.addIssue({ code: "custom", path: ["checkNumber"], message: "Escribe el número de cheque." });
    else if (!/^[\w-]+$/.test(value.checkNumber)) ctx.addIssue({ code: "custom", path: ["checkNumber"], message: "Solo letras, números y guiones." });
    if (value.beneficiary.length < 2) ctx.addIssue({ code: "custom", path: ["beneficiary"], message: "Escribe a nombre de quién va el cheque." });
  }
  if (value.kind === "transfer" && !value.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Elige la cuenta de destino." });
  if (value.kind === "movement" && !MANUAL_TYPES.includes(value.movementType as (typeof MANUAL_TYPES)[number])) {
    ctx.addIssue({ code: "custom", path: ["movementType"], message: "Elige el tipo de movimiento." });
  }
});
type MovementInput = z.input<typeof movementSchema>;
type MovementValues = z.output<typeof movementSchema>;
type MovementKind = MovementValues["kind"];

const selectClass =
  "h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-slate-50";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1.5 text-sm text-rose-600" role="alert">
      {message}
    </p>
  ) : null;
}

export default function BanksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const isSuperadmin = user?.role === "SUPERADMIN";

  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState<{ open: boolean; account: BankAccount | null }>({ open: false, account: null });
  const [movementKind, setMovementKind] = useState<MovementKind | null>(null);
  const [voidTarget, setVoidTarget] = useState<BankMovement | null>(null);
  const [voidReason, setVoidReason] = useState("");

  // Filtros del libro (vuelven a la página 1 al cambiar).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  useEffect(() => setPage(1), [selectedId, dateFrom, dateTo, typeFilter, statusFilter]);

  const accountsQuery = useQuery({
    queryKey: ["banks", "accounts", showInactive],
    queryFn: () => banksService.accounts(showInactive ? "all" : "active"),
    enabled: isSuperadmin
  });
  const accounts = useMemo(() => accountsQuery.data?.items ?? [], [accountsQuery.data]);
  const selected = accounts.find((account) => account.id === selectedId) ?? null;

  // La primera cuenta queda elegida al entrar.
  useEffect(() => {
    if (!selected && accounts.length > 0) setSelectedId(accounts[0]!.id);
  }, [accounts, selected]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize), type: typeFilter, status: statusFilter });
    if (dateFrom) value.set("dateFrom", dateFrom);
    if (dateTo) value.set("dateTo", dateTo);
    return value;
  }, [page, pageSize, typeFilter, statusFilter, dateFrom, dateTo]);

  const movementsQuery = useQuery({
    queryKey: ["banks", "movements", selectedId, params.toString()],
    queryFn: () => banksService.movements(selectedId!, params),
    enabled: isSuperadmin && Boolean(selectedId),
    placeholderData: keepPreviousData
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["banks"] });

  // ---------- Cuenta ----------
  const accountFormHook = useForm<AccountInput, unknown, AccountValues>({ resolver: zodResolver(accountSchema), mode: "onTouched" });
  const openAccountForm = (account: BankAccount | null) => {
    accountFormHook.reset(
      account
        ? {
            bankName: account.bankName,
            accountType: account.accountType,
            currency: account.currency,
            accountNumber: account.accountNumber,
            alias: account.alias ?? "",
            openingBalance: account.openingBalance,
            openingDate: account.openingDate
          }
        : { bankName: "", accountType: "CORRIENTE", currency: "HNL", accountNumber: "", alias: "", openingBalance: 0, openingDate: todayInputValue() }
    );
    accountMutation.reset();
    setAccountForm({ open: true, account });
  };
  const accountMutation = useMutation({
    mutationFn: (values: AccountValues) => {
      const payload = { ...values, alias: values.alias || undefined };
      return accountForm.account ? banksService.updateAccount(accountForm.account.id, payload) : banksService.createAccount(payload);
    },
    onSuccess: (response) => {
      toast.success(response.message);
      setAccountForm({ open: false, account: null });
      setSelectedId(response.item.id);
      void refresh();
    }
  });
  const statusMutation = useMutation({
    mutationFn: (account: BankAccount) => banksService.setAccountStatus(account.id, !account.isActive),
    onSuccess: (response) => {
      toast.success(response.message);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const toggleAccount = async (account: BankAccount) => {
    if (account.isActive) {
      const ok = await confirm({
        title: `Desactivar ${account.bankName} ${maskedNumber(account.accountNumber)}`,
        message: "La cuenta deja de recibir movimientos. Su historial se conserva y se puede volver a activar.",
        confirmLabel: "Desactivar",
        tone: "danger"
      });
      if (!ok) return;
    }
    statusMutation.mutate(account);
  };

  // ---------- Movimientos ----------
  const movementForm = useForm<MovementInput, unknown, MovementValues>({ resolver: zodResolver(movementSchema), mode: "onTouched" });
  const openMovement = (kind: MovementKind) => {
    movementForm.reset({
      kind,
      movementType: kind === "movement" ? "DEPOSITO" : kind === "check" ? "CHEQUE" : "TRANSFERENCIA_SALIDA",
      movementDate: todayInputValue(),
      amount: "" as unknown as number,
      toAccountId: "",
      checkNumber: "",
      beneficiary: "",
      reference: "",
      description: ""
    });
    movementMutation.reset();
    setMovementKind(kind);
  };
  const movementMutation = useMutation({
    mutationFn: (values: MovementValues) => {
      const base = { movementDate: values.movementDate, amount: values.amount, description: values.description || undefined };
      if (values.kind === "check") {
        return banksService.createCheck({ ...base, bankAccountId: selected!.id, checkNumber: values.checkNumber, beneficiary: values.beneficiary });
      }
      if (values.kind === "transfer") {
        return banksService.createTransfer({ ...base, fromAccountId: selected!.id, toAccountId: Number(values.toAccountId), reference: values.reference || undefined });
      }
      return banksService.createMovement({ ...base, bankAccountId: selected!.id, movementType: values.movementType, reference: values.reference || undefined });
    },
    onSuccess: (response) => {
      toast.success(response.message);
      if (response.warning) toast.error(response.warning);
      setMovementKind(null);
      void refresh();
    }
  });

  const checkMutation = useMutation({
    mutationFn: (movement: BankMovement) => banksService.setCheckStatus(movement.id, movement.checkStatus === "COBRADO" ? "EMITIDO" : "COBRADO"),
    onSuccess: (response) => {
      toast.success(response.message);
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const voidMutation = useMutation({
    mutationFn: () => banksService.voidMovement(voidTarget!.id, voidReason),
    onSuccess: (response) => {
      toast.success(response.message);
      setVoidTarget(null);
      setVoidReason("");
      void refresh();
    }
  });

  if (!isSuperadmin) {
    return <Card className="p-6 text-slate-600">Bancos está disponible solo para el superadministrador.</Card>;
  }
  if (accountsQuery.isLoading) {
    return <Spinner label="Cargando cuentas bancarias..." />;
  }

  const otherAccounts = accounts.filter((account) => account.isActive && selected && account.id !== selected.id && account.currency === selected.currency);
  const movementErrors = movementForm.formState.errors;
  const accountErrors = accountFormHook.formState.errors;
  const movements = movementsQuery.data?.items ?? [];
  const currency = selected?.currency ?? "HNL";

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Finanzas</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Bancos</h1>
            <p className="mt-3 max-w-2xl text-slate-600">Cuentas bancarias de la empresa, su saldo y el libro de movimientos: depósitos, retiros, cheques y transferencias.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
              Mostrar desactivadas
            </label>
            <Button type="button" onClick={() => openAccountForm(null)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Nueva cuenta
            </Button>
          </div>
        </div>
      </Card>

      {accounts.length === 0 ? (
        <Card className="grid justify-items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Landmark className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-lg font-semibold text-slate-900">Todavía no hay cuentas bancarias</p>
          <p className="max-w-md text-sm text-slate-500">Registra la primera cuenta con su saldo inicial para empezar a llevar el libro de bancos.</p>
          <Button type="button" onClick={() => openAccountForm(null)}>
            Registrar cuenta
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="Cuentas bancarias">
          {accounts.map((account) => {
            const active = account.id === selectedId;
            return (
              <button
                key={account.id}
                type="button"
                role="listitem"
                aria-pressed={active}
                onClick={() => setSelectedId(account.id)}
                className={cn(
                  "rounded-[24px] border bg-white p-5 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
                  active ? "border-brand/60 ring-2 ring-brand/20" : "border-border hover:border-slate-300",
                  !account.isActive && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{account.alias || account.bankName}</p>
                    <p className="text-sm text-slate-500">
                      {account.alias ? `${account.bankName} · ` : ""}
                      {account.accountType === "CORRIENTE" ? "Corriente" : "Ahorro"} · <span className="font-mono">{maskedNumber(account.accountNumber)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{account.currency}</span>
                </div>
                <p className={cn("mt-4 text-2xl font-semibold tabular-nums", account.balance < 0 ? "text-rose-700" : "text-slate-900")}>{money(account.balance, account.currency)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {!account.isActive
                    ? "Desactivada"
                    : account.pendingChecks > 0
                      ? `${account.pendingChecks} ${account.pendingChecks === 1 ? "cheque" : "cheques"} en circulación por ${money(account.pendingChecksTotal, account.currency)}`
                      : "Sin cheques en circulación"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <Card className="grid gap-5 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-title">Libro de bancos</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {selected.alias || selected.bankName} <span className="font-mono text-base font-normal text-slate-500">{maskedNumber(selected.accountNumber)}</span>
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Saldo inicial {money(selected.openingBalance, currency)} el {formatDate(selected.openingDate)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.isActive ? (
                <>
                  <Button type="button" onClick={() => openMovement("movement")}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                    Nuevo movimiento
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => openMovement("check")}>
                    <FileSignature className="mr-1.5 h-4 w-4" aria-hidden />
                    Emitir cheque
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => openMovement("transfer")}>
                    <ArrowLeftRight className="mr-1.5 h-4 w-4" aria-hidden />
                    Transferir
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" type="button" onClick={() => openAccountForm(selected)}>
                <Pencil className="mr-1.5 h-4 w-4" aria-hidden />
                Editar cuenta
              </Button>
              <Button variant="ghost" type="button" className={selected.isActive ? "hover:bg-rose-50 hover:text-rose-700" : ""} disabled={statusMutation.isPending} onClick={() => void toggleAccount(selected)}>
                <Power className="mr-1.5 h-4 w-4" aria-hidden />
                {selected.isActive ? "Desactivar" : "Activar"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="tipo">Tipo</Label>
              <select id="tipo" className={selectClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">Todos</option>
                {(Object.keys(TYPE_LABELS) as BankMovementType[]).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="estado">Estado</Label>
              <select id="estado" className={selectClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todos</option>
                <option value="ACTIVO">Vigentes</option>
                <option value="ANULADO">Anulados</option>
              </select>
            </div>
          </div>

          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Movimiento</th>
                  <th className="px-4 py-3">Detalle</th>
                  <th className="px-4 py-3 text-right">Entrada</th>
                  <th className="px-4 py-3 text-right">Salida</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </THead>
              <TBody>
                {movementsQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      {dateFrom || dateTo || typeFilter !== "all" || statusFilter !== "all" ? "No hay movimientos con estos filtros." : "Esta cuenta todavía no tiene movimientos."}
                    </td>
                  </tr>
                ) : null}
                {movements.map((movement) => {
                  const voided = movement.status === "ANULADO";
                  const isCheck = movement.movementType === "CHEQUE";
                  return (
                    <tr key={movement.id} className={voided ? "text-slate-400" : undefined}>
                      <td data-label="Fecha" className="whitespace-nowrap px-4 py-3">
                        {formatDate(movement.movementDate)}
                      </td>
                      <td data-label="Movimiento" className="px-4 py-3">
                        <p className={cn("font-medium", voided ? "line-through" : "text-slate-900")}>{TYPE_LABELS[movement.movementType]}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {voided ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Anulado</span> : null}
                          {isCheck && !voided ? (
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", movement.checkStatus === "COBRADO" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
                              {movement.checkStatus === "COBRADO" ? "Cobrado" : "En circulación"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td data-label="Detalle" className="px-4 py-3 text-sm">
                        {isCheck ? (
                          <p className={voided ? undefined : "text-slate-800"}>
                            Cheque <span className="font-mono">{movement.checkNumber}</span> a {movement.beneficiary}
                          </p>
                        ) : null}
                        {movement.relatedAccountName ? (
                          <p className={voided ? undefined : "text-slate-800"}>
                            {movement.direction === "OUT" ? "Hacia" : "Desde"} {movement.relatedAccountName}
                          </p>
                        ) : null}
                        {movement.reference && !isCheck ? <p>Ref. {movement.reference}</p> : null}
                        {movement.description ? <p className="text-slate-500">{movement.description}</p> : null}
                        <p className="text-xs text-slate-400">{movement.createdByName ?? ""}</p>
                        {voided && movement.voidReason ? <p className="text-xs text-rose-700">Motivo: {movement.voidReason}</p> : null}
                      </td>
                      <td data-label="Entrada" className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">
                        {movement.direction === "IN" ? money(movement.amount, currency) : ""}
                      </td>
                      <td data-label="Salida" className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {movement.direction === "OUT" ? money(movement.amount, currency) : ""}
                      </td>
                      <td data-label="Acciones" className="px-4 py-3">
                        {!voided ? (
                          <div className="flex justify-end gap-1.5">
                            {isCheck ? (
                              <Button variant="ghost" size="sm" type="button" disabled={checkMutation.isPending} onClick={() => checkMutation.mutate(movement)}>
                                {movement.checkStatus === "COBRADO" ? <Undo2 className="mr-1.5 h-4 w-4" aria-hidden /> : <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />}
                                {movement.checkStatus === "COBRADO" ? "Marcar emitido" : "Marcar cobrado"}
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              className="w-10 px-0 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                              title="Anular"
                              aria-label={`Anular ${TYPE_LABELS[movement.movementType].toLowerCase()} del ${formatDate(movement.movementDate)}`}
                              disabled={isCheck && movement.checkStatus === "COBRADO"}
                              onClick={() => {
                                voidMutation.reset();
                                setVoidReason("");
                                setVoidTarget(movement);
                              }}
                            >
                              <Ban className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
          {(movementsQuery.data?.pagination.total ?? 0) > 0 ? (
            <Pagination
              pagination={movementsQuery.data?.pagination}
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Cuenta: crear o editar */}
      <Modal
        open={accountForm.open}
        onClose={() => setAccountForm({ open: false, account: null })}
        eyebrow={accountForm.account ? "Editar cuenta" : "Nueva cuenta"}
        title={accountForm.account ? accountForm.account.bankName : "Cuenta bancaria"}
      >
        <form className="grid gap-4" noValidate onSubmit={accountFormHook.handleSubmit((values) => accountMutation.mutate(values))}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="bankName">Banco</Label>
              <Input id="bankName" autoFocus maxLength={80} placeholder="Nombre del banco" aria-invalid={Boolean(accountErrors.bankName)} {...accountFormHook.register("bankName")} />
              <FieldError message={accountErrors.bankName?.message} />
            </div>
            <div>
              <Label htmlFor="alias">Nombre corto</Label>
              <Input id="alias" maxLength={80} placeholder="Opcional, por ejemplo Cuenta de ventas" {...accountFormHook.register("alias")} />
              <FieldError message={accountErrors.alias?.message} />
            </div>
            <div>
              <Label required htmlFor="accountNumber">Número de cuenta</Label>
              <Input id="accountNumber" inputMode="numeric" autoComplete="off" maxLength={40} className="font-mono" aria-invalid={Boolean(accountErrors.accountNumber)} {...accountFormHook.register("accountNumber")} />
              <FieldError message={accountErrors.accountNumber?.message} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required htmlFor="accountType">Tipo</Label>
                <select id="accountType" className={selectClass} {...accountFormHook.register("accountType")}>
                  <option value="CORRIENTE">Corriente</option>
                  <option value="AHORRO">Ahorro</option>
                </select>
              </div>
              <div>
                <Label required htmlFor="currency">Moneda</Label>
                <select id="currency" className={selectClass} disabled={Boolean(accountForm.account?.hasMovements)} {...accountFormHook.register("currency")}>
                  <option value="HNL">Lempiras</option>
                  <option value="USD">Dólares</option>
                </select>
              </div>
            </div>
            <div>
              <Label required htmlFor="openingBalance">Saldo inicial</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                inputMode="decimal"
                className="tabular-nums"
                disabled={Boolean(accountForm.account?.hasMovements)}
                aria-invalid={Boolean(accountErrors.openingBalance)}
                {...accountFormHook.register("openingBalance")}
              />
              <FieldError message={accountErrors.openingBalance?.message} />
            </div>
            <div>
              <Label required htmlFor="openingDate">Fecha del saldo inicial</Label>
              <Input id="openingDate" type="date" max={todayInputValue()} disabled={Boolean(accountForm.account?.hasMovements)} aria-invalid={Boolean(accountErrors.openingDate)} {...accountFormHook.register("openingDate")} />
              <FieldError message={accountErrors.openingDate?.message} />
            </div>
          </div>
          {accountForm.account?.hasMovements ? (
            <p className="text-xs text-slate-500">La cuenta ya tiene movimientos: la moneda, el saldo y la fecha inicial no se pueden cambiar.</p>
          ) : null}
          {accountMutation.error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {accountMutation.error.message}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setAccountForm({ open: false, account: null })}>
              Cancelar
            </Button>
            <Button type="submit" disabled={accountMutation.isPending}>
              {accountMutation.isPending ? "Guardando..." : accountForm.account ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Movimiento, cheque o transferencia */}
      <Modal
        open={Boolean(movementKind && selected)}
        onClose={() => setMovementKind(null)}
        eyebrow={selected ? `${selected.alias || selected.bankName} ${maskedNumber(selected.accountNumber)}` : "Movimiento"}
        title={movementKind === "check" ? "Emitir cheque" : movementKind === "transfer" ? "Transferir a otra cuenta" : "Nuevo movimiento"}
        className="max-w-xl"
      >
        <form className="grid gap-4" noValidate onSubmit={movementForm.handleSubmit((values) => movementMutation.mutate(values))}>
          {movementKind === "movement" ? (
            <div>
              <Label required htmlFor="movementType">Tipo</Label>
              <select id="movementType" className={selectClass} {...movementForm.register("movementType")}>
                {MANUAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]} ({["DEPOSITO", "INTERES", "NOTA_CREDITO"].includes(type) ? "entra dinero" : "sale dinero"})
                  </option>
                ))}
              </select>
              <FieldError message={movementErrors.movementType?.message} />
            </div>
          ) : null}
          {movementKind === "transfer" ? (
            <div>
              <Label required htmlFor="toAccountId">Cuenta de destino</Label>
              <select id="toAccountId" className={selectClass} {...movementForm.register("toAccountId")}>
                <option value="">Elige la cuenta</option>
                {otherAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.alias || account.bankName} {maskedNumber(account.accountNumber)}
                  </option>
                ))}
              </select>
              {otherAccounts.length === 0 ? (
                <p className="mt-1.5 text-xs text-amber-800">No hay otra cuenta activa en {currency === "HNL" ? "lempiras" : "dólares"} para transferir.</p>
              ) : (
                <FieldError message={movementErrors.toAccountId?.message} />
              )}
            </div>
          ) : null}
          {movementKind === "check" ? (
            <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div>
                <Label required htmlFor="checkNumber">Número de cheque</Label>
                <Input id="checkNumber" autoFocus maxLength={30} className="font-mono" aria-invalid={Boolean(movementErrors.checkNumber)} {...movementForm.register("checkNumber")} />
                <FieldError message={movementErrors.checkNumber?.message} />
              </div>
              <div>
                <Label required htmlFor="beneficiary">A nombre de</Label>
                <Input id="beneficiary" maxLength={150} aria-invalid={Boolean(movementErrors.beneficiary)} {...movementForm.register("beneficiary")} />
                <FieldError message={movementErrors.beneficiary?.message} />
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label required htmlFor="amount">Monto ({currency})</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                className="tabular-nums"
                autoFocus={movementKind !== "check"}
                aria-invalid={Boolean(movementErrors.amount)}
                {...movementForm.register("amount")}
              />
              <FieldError message={movementErrors.amount?.message} />
            </div>
            <div>
              <Label required htmlFor="movementDate">Fecha</Label>
              <Input id="movementDate" type="date" min={selected?.openingDate} max={todayInputValue()} aria-invalid={Boolean(movementErrors.movementDate)} {...movementForm.register("movementDate")} />
              <FieldError message={movementErrors.movementDate?.message} />
            </div>
          </div>
          {movementKind !== "check" ? (
            <div>
              <Label htmlFor="reference">Referencia</Label>
              <Input id="reference" maxLength={60} placeholder="Número de boleta o de transferencia" {...movementForm.register("reference")} />
              <FieldError message={movementErrors.reference?.message} />
            </div>
          ) : null}
          <div>
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" maxLength={255} placeholder="Opcional" {...movementForm.register("description")} />
            <FieldError message={movementErrors.description?.message} />
          </div>
          {movementMutation.error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {movementMutation.error.message}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setMovementKind(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={movementMutation.isPending || (movementKind === "transfer" && otherAccounts.length === 0)}>
              {movementMutation.isPending ? "Guardando..." : movementKind === "check" ? "Registrar cheque" : movementKind === "transfer" ? "Transferir" : "Registrar"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Anular */}
      <Modal open={Boolean(voidTarget)} onClose={() => setVoidTarget(null)} eyebrow="Anular movimiento" title={voidTarget ? TYPE_LABELS[voidTarget.movementType] : "Anular"} className="max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (voidReason.trim().length >= 5) voidMutation.mutate();
          }}
        >
          <p className="text-sm text-slate-600">
            El movimiento deja de contar en el saldo, pero queda en el libro marcado como anulado.
            {voidTarget?.relatedMovementId ? " Es una transferencia: se anula también en la otra cuenta." : ""}
          </p>
          <div>
            <Label required htmlFor="voidReason">Motivo</Label>
            <Input id="voidReason" autoFocus maxLength={255} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Por ejemplo: monto equivocado" />
            <p className="mt-1.5 text-xs text-slate-500">Mínimo 5 letras. Queda en la bitácora.</p>
          </div>
          {voidMutation.error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {voidMutation.error.message}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => setVoidTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" type="submit" disabled={voidMutation.isPending || voidReason.trim().length < 5}>
              {voidMutation.isPending ? "Anulando..." : "Anular"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
