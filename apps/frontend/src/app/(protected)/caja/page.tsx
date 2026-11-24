"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, FileDown, LockKeyhole, Monitor, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PrintSetupNotice } from "@/components/forms/print-setup-notice";
import { integerInput, moneyInput, quantityInput } from "@/lib/number-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { usePrintSetup } from "@/hooks/use-print-setup";
import { clearStoredCashTerminal, getStoredCashTerminal, storeCashTerminal } from "@/lib/storage";
import { printLetter } from "@/lib/ticket-print";
import { filenameFromResponse, formatCurrency } from "@/lib/utils";
import { cajaService } from "@/services/caja-service";
import type { CashBreakdown, CashFlowKey, CashSessionDetail, CashSummary, PaymentMethod } from "@/types/api";

const METHODS: PaymentMethod[] = ["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA", "OTRO"];
const FLOW_METHODS: PaymentMethod[] = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE", "OTRO"];
const DEFAULT_DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

const METHOD_LABEL: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  CHEQUE: "Cheque",
  OTRO: "Otro"
};

const FLOW_LABEL: Record<CashFlowKey, string> = {
  FONDO: "Fondo de apertura",
  APERTURA: "Apertura",
  VENTA_CONTADO: "Ventas de contado",
  ABONO_CXC: "Abonos de clientes (CxC)",
  PAGO_CXP: "Pagos a proveedores (CxP)",
  INGRESO: "Otros ingresos",
  EGRESO: "Egresos",
  RETIRO: "Retiros",
  AJUSTE: "Ajustes"
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "N/D";
  }
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("es-HN");
}

function sumCounts(denominations: number[], value: CashBreakdown) {
  return denominations.reduce((total, denomination) => total + denomination * Number(value[String(denomination)] ?? 0), 0);
}

function differenceLabel(difference: number) {
  return difference === 0 ? "cuadrada" : difference > 0 ? "sobrante" : "faltante";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Cuadro de flujo: concepto x método, desde la apertura hasta ahora (o hasta el cierre). */
function FlowTable({ summary }: { summary: CashSummary }) {
  const { rows, totals } = summary.flow;
  // Efectivo siempre; los demás métodos solo si tuvieron movimiento.
  const methods = FLOW_METHODS.filter(
    (method) => method === "EFECTIVO" || rows.some((row) => Math.abs(row.byMethod[method]) >= 0.005)
  );
  const cell = (value: number, strong = false) => (
    <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${value < 0 ? "text-rose-700" : "text-slate-800"}`}>
      {formatCurrency(Math.abs(value) < 0.005 ? 0 : Math.abs(value))}
    </span>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-slate-800 text-white">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Concepto</th>
            {methods.map((method) => (
              <th key={method} className="px-3 py-2 text-right font-semibold">{METHOD_LABEL[method]}</th>
            ))}
            <th className="px-3 py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-slate-100 even:bg-slate-50">
              <td className="px-3 py-2 text-slate-700">{FLOW_LABEL[row.key]}</td>
              {methods.map((method) => (
                <td key={method} className="px-3 py-2 text-right">{cell(row.byMethod[method])}</td>
              ))}
              <td className="px-3 py-2 text-right">{cell(row.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-slate-100">
          <tr className="border-t border-slate-300">
            <td className="px-3 py-2 font-semibold text-slate-900">Saldo esperado</td>
            {methods.map((method) => (
              <td key={method} className="px-3 py-2 text-right">{cell(totals.byMethod[method], true)}</td>
            ))}
            <td className="px-3 py-2 text-right">{cell(totals.total, true)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Los montos en rojo son salidas de dinero.</p>
    </div>
  );
}

function DenominationCounter({
  denominations,
  value,
  onChange
}: {
  denominations: number[];
  value: CashBreakdown;
  onChange: (next: CashBreakdown) => void;
}) {
  const total = sumCounts(denominations, value);

  return (
    <div className="grid gap-2 rounded-2xl bg-slate-50 p-4">
      <div className="grid grid-cols-[1fr_90px_120px] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Denominación</span>
        <span className="text-center">Cantidad</span>
        <span className="text-right">Subtotal</span>
      </div>
      {denominations.map((denomination) => {
        const key = String(denomination);
        const count = Number(value[key] ?? 0);
        return (
          <div key={denomination} className="grid grid-cols-[1fr_90px_120px] items-center gap-2">
            <span className="text-sm font-medium text-slate-700">L {denomination}</span>
            <input
              min="0"
              {...integerInput}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-sm outline-none focus:border-slate-400"
              value={value[key] ?? ""}
              onChange={(event) => {
                const next = { ...value };
                const raw = event.target.value;
                if (raw === "") {
                  delete next[key];
                } else {
                  next[key] = Math.max(0, Math.floor(Number(raw)));
                }
                onChange(next);
              }}
            />
            <span className="text-right text-sm tabular-nums text-slate-600">{formatCurrency(denomination * count)}</span>
          </div>
        );
      })}
      <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-sm font-semibold text-slate-700">Total contado</span>
        <span className="text-xl font-semibold tabular-nums text-slate-900">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function ArqueoTiles({ expected, counted, difference }: { expected: number; counted: number; difference: number }) {
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-3">
      <div className="rounded-xl bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">Efectivo esperado</p>
        <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(expected)}</p>
      </div>
      <div className="rounded-xl bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">Efectivo contado</p>
        <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(counted)}</p>
      </div>
      <div className={`rounded-xl px-3 py-2 ${difference === 0 ? "bg-emerald-50" : "bg-amber-50"}`}>
        <p className="text-xs text-slate-500">Diferencia · {differenceLabel(difference)}</p>
        <p className={`font-semibold tabular-nums ${difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>
          {formatCurrency(Math.abs(difference))}
        </p>
      </div>
    </div>
  );
}

export default function CajaPage() {
  const queryClient = useQueryClient();
  const { can, user } = useAuth();

  const overviewQuery = useQuery({ queryKey: ["caja", "overview"], queryFn: () => cajaService.overview() });
  const historyQuery = useQuery({
    queryKey: ["caja", "history"],
    queryFn: () => cajaService.sessions(new URLSearchParams({ status: "CERRADA", page: "1", pageSize: "8" }))
  });

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  // Apertura: usuario, hora y monto de apertura
  const [openFor, setOpenFor] = useState<{ id: number; name: string } | null>(null);
  const [openingAmount, setOpeningAmount] = useState("");
  const [now, setNow] = useState(() => new Date());

  // Movimiento manual
  const [moveFor, setMoveFor] = useState<number | null>(null);
  const [moveType, setMoveType] = useState<"INGRESO" | "EGRESO" | "RETIRO">("INGRESO");
  const [moveMethod, setMoveMethod] = useState<PaymentMethod>("EFECTIVO");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveDescription, setMoveDescription] = useState("");

  // Cierre: cuadre de todo el flujo desde la apertura
  const [closeFor, setCloseFor] = useState<{ id: number; name: string } | null>(null);
  const [countedCounts, setCountedCounts] = useState<CashBreakdown>({});
  const [closingNotes, setClosingNotes] = useState("");
  const [report, setReport] = useState<CashSessionDetail | null>(null);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);

  const printSetup = usePrintSetup();

  // Vincular este equipo con el código que genera el administrador
  const [pairCode, setPairCode] = useState("");

  // Equipo desde el que se opera (su registro se gestiona en Registro de cajas)
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id ?? null;
  const canManage = overviewQuery.data?.canManage ?? false;
  const currentTerminal = overviewQuery.data?.terminal ?? null;
  const outsideNetwork = overviewQuery.data?.terminalStatus === "network";

  // Token guardado pero el backend no reconoce el equipo (revocado): se olvida.
  useEffect(() => {
    if (companyId && overviewQuery.data?.terminalStatus === "invalid" && getStoredCashTerminal(companyId)) {
      clearStoredCashTerminal(companyId);
    }
  }, [companyId, overviewQuery.data]);

  const denominations = overviewQuery.data?.denominations?.length ? overviewQuery.data.denominations : DEFAULT_DENOMS;

  // Reloj del formulario de apertura (la hora definitiva la registra el servidor).
  useEffect(() => {
    if (!openFor) {
      return;
    }
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [openFor]);

  const sessionQuery = useQuery({
    queryKey: ["caja", "session", selectedSessionId],
    queryFn: () => cajaService.session(selectedSessionId as number),
    enabled: selectedSessionId !== null
  });

  const closeDetailQuery = useQuery({
    queryKey: ["caja", "session", closeFor?.id],
    queryFn: () => cajaService.session(closeFor!.id),
    enabled: closeFor !== null
  });

  // Arqueo por denominación; solo el efectivo se compara contra lo esperado.
  const countedTotal = round2(sumCounts(denominations, countedCounts));
  const closeExpected = closeDetailQuery.data?.summary?.expectedCash ?? 0;
  const closeDifference = round2(countedTotal - closeExpected);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["caja"] });
  };

  const handlePdf = async (sessionId: number, mode: "download" | "print") => {
    setPdfBusy(sessionId);
    setError(null);
    try {
      const response = await cajaService.closePdf(sessionId);
      const blob = await response.blob();
      if (mode === "print") {
        // Impresora de carta de este equipo (programa de impresión).
        await printLetter(async () => blob);
        setFeedback("Cierre enviado a la impresora.");
      } else {
        downloadBlob(blob, filenameFromResponse(response, `cierre-caja-${sessionId}.pdf`));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar o imprimir el cierre.");
    } finally {
      setPdfBusy(null);
    }
  };

  const redeemMutation = useMutation({
    mutationFn: () => cajaService.redeemPairing({ code: pairCode }),
    onSuccess: (data) => {
      if (companyId) {
        storeCashTerminal(companyId, data.token);
      }
      setPairCode("");
      setFeedback(`Este equipo quedó vinculado a ${data.terminal.registerName}.`);
      setError(null);
      queryClient.invalidateQueries();
    },
    onError: (err: Error) => setError(err.message)
  });

  const openMutation = useMutation({
    mutationFn: () =>
      cajaService.open({
        cashRegisterId: openFor!.id,
        openingAmount: round2(Number(openingAmount || 0))
      }),
    onSuccess: () => {
      setFeedback("Caja abierta. Permanecerá abierta hasta que un usuario la cierre.");
      setError(null);
      setOpenFor(null);
      setOpeningAmount("");
      refresh();
    },
    onError: (err: Error) => setError(err.message)
  });

  const moveMutation = useMutation({
    mutationFn: () =>
      cajaService.move({
        cashSessionId: moveFor!,
        type: moveType,
        method: moveMethod,
        amount: Number(moveAmount || 0),
        description: moveDescription || undefined
      }),
    onSuccess: () => {
      setFeedback("Movimiento registrado.");
      setError(null);
      setMoveFor(null);
      setMoveAmount("");
      setMoveDescription("");
      refresh();
    },
    onError: (err: Error) => setError(err.message)
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      cajaService.close({
        cashSessionId: closeFor!.id,
        countedBreakdown: countedCounts,
        countedAmount: countedTotal,
        notes: closingNotes || undefined
      }),
    onSuccess: (data) => {
      setReport(data);
      setCloseFor(null);
      setCountedCounts({});
      setClosingNotes("");
      setFeedback(null);
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message)
  });

  if (overviewQuery.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const registers = overviewQuery.data?.registers ?? [];
  const detail = sessionQuery.data;

  const pdfButtons = (sessionId: number, size: "sm" | undefined = "sm") => (
    <>
      <Button variant="secondary" size={size} type="button" disabled={pdfBusy === sessionId} onClick={() => handlePdf(sessionId, "download")}>
        <FileDown className="mr-1 h-4 w-4" />
        Guardar PDF
      </Button>
      {printSetup.letter ? (
        <Button variant="secondary" size={size} type="button" disabled={pdfBusy === sessionId} onClick={() => handlePdf(sessionId, "print")}>
          <Printer className="mr-1 h-4 w-4" />
          Imprimir (carta)
        </Button>
      ) : (
        <PrintSetupNotice kinds={["letter"]} />
      )}
    </>
  );

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-title">Caja</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Cajas y arqueos</h1>
            <p className="mt-3 text-slate-600">
              Cada caja física se liga a un equipo. La caja queda abierta hasta que un usuario la cierra y sin ella no se puede facturar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <Link href="/registro-cajas">
                <Button type="button" variant="secondary">Registro de cajas</Button>
              </Link>
            ) : null}
          </div>
        </div>

        <div
          className={`mt-4 flex flex-col gap-3 rounded-2xl px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${currentTerminal ? "bg-sky-50 text-sky-900" : outsideNetwork ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}
        >
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 shrink-0" />
            {currentTerminal ? (
              <p>
                Este equipo: <span className="font-semibold">{currentTerminal.registerName}</span> ({currentTerminal.name})
              </p>
            ) : outsideNetwork ? (
              <p>
                Este equipo está registrado, pero está fuera de la red autorizada para caja (IP {overviewQuery.data?.clientIp ?? "desconocida"}).
                Conéctalo a la red de la tienda o pide a un administrador que la autorice.
              </p>
            ) : (
              <p>
                Este equipo no está registrado como caja. Ingresa el código de vinculación que te dé el administrador.
                {registers.length > 1 ? " Con varias cajas, solo un equipo registrado puede facturar y operar su caja." : ""}
              </p>
            )}
          </div>
          {!currentTerminal && !outsideNetwork ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                redeemMutation.mutate();
              }}
            >
              <input
                aria-label="Código de vinculación"
                className="h-9 w-36 rounded-xl border border-amber-200 bg-white px-3 font-mono text-sm uppercase tracking-widest text-slate-900 outline-none focus:border-amber-400"
                placeholder="XXXX-XXXX"
                maxLength={9}
                value={pairCode}
                onChange={(event) => setPairCode(event.target.value.toUpperCase())}
              />
              <Button size="sm" type="submit" disabled={redeemMutation.isPending || pairCode.replace(/[^A-Za-z0-9]/g, "").length !== 8}>
                Vincular
              </Button>
              {canManage ? (
                <Link href="/registro-cajas">
                  <Button size="sm" variant="ghost" type="button">Registrar sin código</Button>
                </Link>
              ) : null}
            </form>
          ) : null}
        </div>

        {feedback ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{feedback}</div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</div>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {registers.map((register) => {
          const open = Boolean(register.session);
          return (
            <Card key={register.id} className={`p-4 ${open ? "ring-1 ring-emerald-200" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Caja</p>
                  <h3 className="text-lg font-semibold text-slate-900">{register.name}</h3>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${open ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                >
                  {open ? "ABIERTA" : "CERRADA"}
                </span>
              </div>

              {open && register.session && register.summary ? (
                <div className="mt-4 grid gap-1 text-sm">
                  <p className="text-slate-500">Aperturada por: <span className="text-slate-700">{register.session.openedByName ?? "N/D"}</span></p>
                  <p className="text-slate-500">Apertura: <span className="text-slate-700">{formatDateTime(register.session.openedAt)}</span></p>
                  <p className="text-slate-500">Monto de apertura: <span className="text-slate-700">{formatCurrency(register.session.openingAmount)}</span></p>
                  <div className="mt-2 flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Efectivo esperado</span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(register.summary.expectedCash)}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Sin sesión abierta.</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {open && register.session ? (
                  <>
                    <Button variant="ghost" size="sm" type="button" onClick={() => setSelectedSessionId(register.session!.id)}>
                      Ver detalle
                    </Button>
                    {can("caja.move") && register.canOperate ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setMoveFor(register.session!.id);
                          setMoveType("INGRESO");
                          setMoveMethod("EFECTIVO");
                        }}
                      >
                        Movimiento
                      </Button>
                    ) : null}
                    {can("caja.close") && register.canClose ? (
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => {
                          setCloseFor({ id: register.session!.id, name: register.name });
                          setCountedCounts({});
                          setClosingNotes("");
                        }}
                      >
                        <LockKeyhole className="mr-1 h-4 w-4" />
                        Cerrar
                      </Button>
                    ) : null}
                  </>
                ) : can("caja.open") && register.canOperate ? (
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setOpenFor({ id: register.id, name: register.name });
                      setOpeningAmount("");
                    }}
                  >
                    <Banknote className="mr-1 h-4 w-4" />
                    Abrir
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {detail ? (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Resumen de {detail.session.registerName}</h2>
              <p className="text-sm text-slate-500">
                {detail.session.status === "ABIERTA" ? "Abierta" : "Cerrada"} · apertura {formatCurrency(detail.session.openingAmount)} ·
                {" "}esperado {formatCurrency(detail.summary?.expectedCash ?? 0)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {detail.session.status === "CERRADA" ? pdfButtons(detail.session.id) : null}
              <Button variant="ghost" size="sm" type="button" onClick={() => setSelectedSessionId(null)}>
                Ocultar
              </Button>
            </div>
          </div>
          {detail.summary ? (
            <div className="mt-4">
              <FlowTable summary={detail.summary} />
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Cierres recientes</h2>
        <div className="mt-4">
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Caja</th>
                  <th className="px-4 py-3">Cierre</th>
                  <th className="px-4 py-3">Aperturada por</th>
                  <th className="px-4 py-3 text-right">Esperado</th>
                  <th className="px-4 py-3 text-right">Contado</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                  <th className="px-4 py-3 text-right">Reporte</th>
                </tr>
              </THead>
              <TBody>
                {historyQuery.data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Aún no hay cierres.</td>
                  </tr>
                ) : null}
                {historyQuery.data?.items.map((item) => (
                  <tr key={item.id} className="cursor-pointer" onClick={() => setSelectedSessionId(item.id)}>
                    <td data-label="Caja" className="px-4 py-3 text-slate-700">{item.registerName ?? "N/D"}</td>
                    <td data-label="Cierre" className="px-4 py-3 text-xs text-slate-500">{formatDateTime(item.closedAt)}</td>
                    <td data-label="Aperturada por" className="px-4 py-3 text-slate-700">{item.openedByName ?? "N/D"}</td>
                    <td data-label="Esperado" className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(item.expectedAmount ?? 0)}</td>
                    <td data-label="Contado" className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(item.countedAmount ?? 0)}</td>
                    <td
                      data-label="Diferencia"
                      className={`px-4 py-3 text-right font-semibold tabular-nums ${(item.difference ?? 0) === 0 ? "text-slate-700" : (item.difference ?? 0) > 0 ? "text-emerald-700" : "text-rose-700"}`}
                    >
                      {formatCurrency(Math.abs(item.difference ?? 0))}
                    </td>
                    <td data-label="Reporte" className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" type="button" title="Guardar PDF" disabled={pdfBusy === item.id} onClick={() => handlePdf(item.id, "download")}>
                          <FileDown className="h-4 w-4" />
                        </Button>
                        {printSetup.letter ? (
                          <Button variant="ghost" size="sm" type="button" title="Imprimir (carta)" disabled={pdfBusy === item.id} onClick={() => handlePdf(item.id, "print")}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        ) : (
                          <PrintSetupNotice kinds={["letter"]} compact />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </div>
      </Card>

      {/* Apertura */}
      <Modal className="max-w-3xl" open={Boolean(openFor)} onClose={() => setOpenFor(null)} title={openFor ? `Apertura de ${openFor.name}` : "Apertura de caja"}>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="openedBy">Usuario que apertura</Label>
            <Input id="openedBy" value={user?.fullName ?? ""} readOnly disabled />
          </div>
          <div>
            <Label htmlFor="openedAt">Fecha y hora de apertura</Label>
            <Input id="openedAt" value={now.toLocaleString("es-HN")} readOnly disabled />
          </div>
          <div>
            <Label required htmlFor="openingAmount">Monto de apertura (L)</Label>
            <Input
              id="openingAmount"
              min="0"
              {...moneyInput}
              inputMode="decimal"
              value={openingAmount}
              onChange={(event) => setOpeningAmount(event.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <p className="text-xs text-slate-500">La caja queda abierta para toda la empresa hasta que un usuario la cierre.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpenFor(null)}>Cancelar</Button>
            <Button type="button" disabled={openMutation.isPending || Number(openingAmount || 0) < 0} onClick={() => openMutation.mutate()}>
              Aperturar caja
            </Button>
          </div>
        </div>
      </Modal>

      {/* Movimiento */}
      <Modal open={moveFor !== null} onClose={() => setMoveFor(null)} title="Registrar movimiento">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required htmlFor="moveType">Tipo</Label>
              <select
                id="moveType"
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                value={moveType}
                onChange={(event) => setMoveType(event.target.value as "INGRESO" | "EGRESO" | "RETIRO")}
              >
                <option value="INGRESO">Ingreso</option>
                <option value="EGRESO">Egreso</option>
                <option value="RETIRO">Retiro</option>
              </select>
            </div>
            <div>
              <Label required htmlFor="moveMethod">Método</Label>
              <select
                id="moveMethod"
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                value={moveMethod}
                onChange={(event) => setMoveMethod(event.target.value as PaymentMethod)}
              >
                {METHODS.map((method) => (
                  <option key={method} value={method}>{METHOD_LABEL[method]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label required htmlFor="moveAmount">Monto (L)</Label>
            <Input id="moveAmount" min="0" {...moneyInput} value={moveAmount} onChange={(event) => setMoveAmount(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="moveDescription">Descripción</Label>
            <Textarea id="moveDescription" rows={2} value={moveDescription} onChange={(event) => setMoveDescription(event.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setMoveFor(null)}>Cancelar</Button>
            <Button type="button" disabled={moveMutation.isPending || Number(moveAmount) <= 0} onClick={() => moveMutation.mutate()}>
              Registrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cierre */}
      <Modal className="max-w-6xl" open={Boolean(closeFor)} onClose={() => setCloseFor(null)} title={closeFor ? `Cierre de ${closeFor.name}` : "Cierre de caja"}>
        {!closeDetailQuery.data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-4">
                <div className="grid gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">Aperturada por</p>
                    <p className="font-medium text-slate-800">{closeDetailQuery.data.session.openedByName ?? "N/D"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Apertura</p>
                    <p className="font-medium text-slate-800">{formatDateTime(closeDetailQuery.data.session.openedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Monto de apertura</p>
                    <p className="font-medium text-slate-800">{formatCurrency(closeDetailQuery.data.session.openingAmount)}</p>
                  </div>
                </div>

                {closeDetailQuery.data.summary ? <FlowTable summary={closeDetailQuery.data.summary} /> : null}

                <div>
                  <Label htmlFor="closingNotes">Observaciones del cierre</Label>
                  <Textarea id="closingNotes" rows={3} value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} />
                </div>
              </div>

              <div className="grid content-start gap-3 rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Arqueo de efectivo</p>
                  <p className="text-xs text-slate-500">Cuenta billetes y monedas. Solo el efectivo se compara con lo esperado.</p>
                </div>
                <DenominationCounter denominations={denominations} value={countedCounts} onChange={setCountedCounts} />
                <ArqueoTiles expected={closeExpected} counted={countedTotal} difference={closeDifference} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setCloseFor(null)}>Cancelar</Button>
              <Button type="button" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
                Cerrar caja
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reporte de cierre */}
      <Modal className="max-w-5xl" open={Boolean(report)} onClose={() => setReport(null)} title="Cierre de caja">
        {report ? (
          <div className="grid gap-4">
            <div className="grid gap-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2">
              <p className="text-slate-500">Caja: <span className="font-medium text-slate-800">{report.session.registerName ?? "N/D"}</span></p>
              <p className="text-slate-500">Monto de apertura: <span className="font-medium text-slate-800">{formatCurrency(report.session.openingAmount)}</span></p>
              <p className="text-slate-500">Aperturada por: <span className="font-medium text-slate-800">{report.session.openedByName ?? "N/D"}</span></p>
              <p className="text-slate-500">Apertura: <span className="font-medium text-slate-800">{formatDateTime(report.session.openedAt)}</span></p>
              <p className="text-slate-500">Cerrada por: <span className="font-medium text-slate-800">{report.session.closedByName ?? "N/D"}</span></p>
              <p className="text-slate-500">Cierre: <span className="font-medium text-slate-800">{formatDateTime(report.session.closedAt)}</span></p>
            </div>

            {report.summary ? <FlowTable summary={report.summary} /> : null}

            <ArqueoTiles
              expected={report.session.expectedAmount ?? 0}
              counted={report.session.countedAmount ?? 0}
              difference={report.session.difference ?? 0}
            />

            <div className="flex flex-wrap justify-end gap-2">
              {pdfButtons(report.session.id, undefined)}
              <Button type="button" onClick={() => setReport(null)}>Listo</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
