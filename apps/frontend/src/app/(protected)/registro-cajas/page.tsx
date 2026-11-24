"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Globe, KeyRound, Monitor, Network, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DeactivateButton, DeactivatedLink } from "@/components/ui/deactivation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { useCompany } from "@/hooks/use-company";
import { useLocalPagination } from "@/hooks/use-local-pagination";
import { clearStoredCashTerminal, getStoredCashTerminal, storeCashTerminal } from "@/lib/storage";
import { cajaService } from "@/services/caja-service";

/** Red /24 de una IPv4 ("192.168.1.37" -> "192.168.1.0/24"); null si no es IPv4. */
function ipv4Network24(ip: string | null) {
  const match = ip?.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  return match ? `${match[1]}.${match[2]}.${match[3]}.0/24` : null;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin uso";
  }
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("es-HN");
}

export default function RegistroCajasPage() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id ?? null;

  const overviewQuery = useQuery({ queryKey: ["caja", "overview"], queryFn: () => cajaService.overview() });
  const registersQuery = useQuery({ queryKey: ["caja", "registers"], queryFn: () => cajaService.registers() });
  const terminalsQuery = useQuery({ queryKey: ["caja", "terminals"], queryFn: () => cajaService.terminals() });
  const networksQuery = useQuery({ queryKey: ["caja", "networks"], queryFn: () => cajaService.networks() });

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Caja: crear o renombrar
  const [registerForm, setRegisterForm] = useState<{ id: number | null; name: string } | null>(null);

  // Registrar este equipo
  const [registerTerminalOpen, setRegisterTerminalOpen] = useState(false);
  const [terminalRegisterId, setTerminalRegisterId] = useState("");
  const [terminalName, setTerminalName] = useState("");

  // Red autorizada
  const [networkCidr, setNetworkCidr] = useState("");
  // "" = todas las cajas; si no, id de la caja
  const [networkScope, setNetworkScope] = useState("");
  const [networkLabel, setNetworkLabel] = useState("");

  // Código de vinculación para otra PC
  // Asignar PC por IP (alta o cambio de IP de un equipo existente)
  const [ipForm, setIpForm] = useState<{ terminalId: number | null; cashRegisterId: string; name: string; ip: string } | null>(null);

  const [pairingFor, setPairingFor] = useState<{ id: number; name: string } | null>(null);
  const [pairingName, setPairingName] = useState("");
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const currentTerminal = overviewQuery.data?.terminal ?? null;
  const allRegisters = registersQuery.data?.items ?? [];
  const activeRegisters = allRegisters.filter((register) => register.isActive);
  const terminals = terminalsQuery.data?.items ?? [];
  // Cada caja admite un solo equipo activo.
  const activeTerminalsOf = (registerId: number) => terminals.filter((terminal) => terminal.isActive && terminal.cashRegisterId === registerId);
  const freeRegisters = activeRegisters.filter((register) => activeTerminalsOf(register.id).length === 0);
  // Solo cajas activas; las desactivadas están en Administración → Desactivados.
  const shownRegisters = activeRegisters;
  // Tablas de 50 en 50; la navegación aparece solo si hay más de una página posible.
  const registersPage = useLocalPagination(shownRegisters);
  const terminalsPage = useLocalPagination(terminals);
  const networksPage = useLocalPagination(networksQuery.data?.items ?? []);
  const openRegisterIds = new Set(
    (overviewQuery.data?.registers ?? []).filter((register) => register.session).map((register) => register.id)
  );

  // Token guardado pero el backend no reconoce el equipo (revocado): se olvida.
  useEffect(() => {
    if (companyId && overviewQuery.data?.terminalStatus === "invalid" && getStoredCashTerminal(companyId)) {
      clearStoredCashTerminal(companyId);
    }
  }, [companyId, overviewQuery.data]);

  // Cuenta regresiva del código (la validez real la controla el servidor).
  useEffect(() => {
    if (!pairing) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  const pairingSecondsLeft = pairing ? Math.max(0, Math.floor((new Date(pairing.expiresAt).getTime() - now) / 1000)) : 0;

  const onSuccess = (message: string) => {
    setFeedback(message);
    setError(null);
    queryClient.invalidateQueries();
  };
  const onError = (err: Error) => {
    setError(err.message);
    setFeedback(null);
  };

  const saveRegisterMutation = useMutation({
    mutationFn: async () => {
      if (registerForm!.id) {
        await cajaService.updateRegister(registerForm!.id, { name: registerForm!.name.trim() });
      } else {
        await cajaService.createRegister(registerForm!.name.trim());
      }
    },
    onSuccess: () => {
      onSuccess(registerForm?.id ? "Caja actualizada." : "Caja creada.");
      setRegisterForm(null);
    },
    onError
  });

  const toggleRegisterMutation = useMutation({
    mutationFn: (payload: { id: number; isActive: boolean }) => cajaService.updateRegister(payload.id, { isActive: payload.isActive }),
    onSuccess: (_data, payload) => onSuccess(payload.isActive ? "Caja restaurada." : "Caja desactivada."),
    onError
  });

  const registerTerminalMutation = useMutation({
    mutationFn: () => cajaService.registerTerminal({ cashRegisterId: Number(terminalRegisterId), name: terminalName.trim() }),
    onSuccess: (data) => {
      if (companyId) {
        storeCashTerminal(companyId, data.token);
      }
      setRegisterTerminalOpen(false);
      setTerminalName("");
      onSuccess(`Este equipo quedó registrado como ${data.terminal.registerName}.`);
    },
    onError
  });

  const ipMutation = useMutation({
    mutationFn: async () => {
      const form = ipForm!;
      if (form.terminalId) {
        await cajaService.updateTerminal(form.terminalId, { boundIp: form.ip.trim() });
        return `IP del equipo actualizada a ${form.ip.trim()}.`;
      }
      const result = await cajaService.registerTerminalByIp({
        cashRegisterId: Number(form.cashRegisterId),
        name: form.name.trim(),
        ip: form.ip.trim()
      });
      return `La PC ${result.terminal.boundIp} quedó habilitada como ${result.terminal.registerName}.`;
    },
    onSuccess: (message) => {
      setIpForm(null);
      onSuccess(message);
    },
    onError
  });

  const pairingMutation = useMutation({
    mutationFn: () => cajaService.createPairing(pairingFor!.id, pairingName.trim() || undefined),
    onSuccess: (data) => {
      setNow(Date.now());
      setPairing({ code: data.code, expiresAt: data.expiresAt });
      setError(null);
    },
    onError
  });

  const closePairing = () => {
    setPairingFor(null);
    setPairing(null);
    setPairingName("");
    queryClient.invalidateQueries({ queryKey: ["caja"] });
  };

  const addNetworkMutation = useMutation({
    mutationFn: (payload: { cidr: string; label?: string; cashRegisterId: number | null }) => cajaService.addNetwork(payload),
    onSuccess: (data, payload) => {
      setNetworkCidr("");
      setNetworkLabel("");
      const affected = data.byRegister.filter((item) => payload.cashRegisterId === null || item.cashRegisterId === payload.cashRegisterId);
      const outside = affected.filter((item) => !item.clientAllowed).map((item) => item.name);
      onSuccess(
        outside.length === 0
          ? "Red autorizada."
          : `Red autorizada. Atención: desde tu IP actual ya no se puede operar ${outside.join(", ")}.`
      );
    },
    onError
  });

  const removeNetworkMutation = useMutation({
    mutationFn: (id: number) => cajaService.removeNetwork(id),
    onSuccess: () => onSuccess("Red eliminada."),
    onError
  });

  const addNetwork = async (cidr: string, label?: string) => {
    const cashRegisterId = networkScope ? Number(networkScope) : null;
    // Cajas que pasan de "sin restricción" a restringidas: sus equipos fuera de la red se bloquean.
    const newlyRestricted = (networksQuery.data?.byRegister ?? [])
      .filter((item) => !item.restricted && (cashRegisterId === null || item.cashRegisterId === cashRegisterId))
      .map((item) => item.name);
    if (newlyRestricted.length > 0) {
      const ok = await confirm({
        title: "Autorizar red",
        message: `Al autorizar "${cidr}", ${newlyRestricted.join(", ")} solo funcionará desde esa red. Los equipos que estén fuera quedarán bloqueados hasta autorizar su red.`,
        confirmLabel: "Autorizar"
      });
      if (!ok) {
        return;
      }
    }
    addNetworkMutation.mutate({ cidr, label: label || undefined, cashRegisterId });
  };

  const networkAccess = new Map((networksQuery.data?.byRegister ?? []).map((item) => [item.cashRegisterId, item]));

  const updateTerminalMutation = useMutation({
    mutationFn: (payload: { id: number; cashRegisterId?: number; isActive?: boolean }) =>
      cajaService.updateTerminal(payload.id, { cashRegisterId: payload.cashRegisterId, isActive: payload.isActive }),
    onSuccess: (_data, payload) => {
      if (payload.isActive === false && payload.id === currentTerminal?.id && companyId) {
        clearStoredCashTerminal(companyId);
      }
      onSuccess(payload.isActive === false ? "Equipo revocado." : "Equipo actualizado.");
    },
    onError
  });

  const deleteTerminalMutation = useMutation({
    mutationFn: (id: number) => cajaService.deleteTerminal(id),
    onSuccess: () => onSuccess("Equipo eliminado."),
    onError
  });

  const deleteTerminal = async (id: number, name: string) => {
    const ok = await confirm({
      title: "Eliminar equipo",
      message: `Se eliminará el equipo "${name}" de la lista. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      tone: "danger"
    });
    if (ok) {
      deleteTerminalMutation.mutate(id);
    }
  };

  const revokeTerminal = async (id: number, name: string) => {
    const ok = await confirm({
      title: "Revocar equipo",
      message: `El equipo "${name}" dejará de operar como caja.`,
      confirmLabel: "Revocar",
      tone: "danger"
    });
    if (ok) {
      updateTerminalMutation.mutate({ id, isActive: false });
    }
  };

  const openRegisterTerminal = () => {
    setTerminalRegisterId(String(freeRegisters[0]?.id ?? ""));
    setTerminalName("");
    setRegisterTerminalOpen(true);
  };

  if (overviewQuery.isLoading || registersQuery.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <p className="section-title">Sistema</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Registro de cajas</h1>
        <p className="mt-3 text-slate-600">
          Crea las cajas físicas de la empresa y liga cada equipo (PC) a su caja. Un equipo registrado solo factura y opera su propia caja.
        </p>

        {feedback ? (
          <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{feedback}</div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</div>
        ) : null}
      </Card>

      {/* Este equipo */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Este equipo</h2>
        <div
          className={`mt-4 flex flex-col gap-3 rounded-2xl px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${currentTerminal ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900"}`}
        >
          <div className="flex items-center gap-3">
            <Monitor className="h-6 w-6 shrink-0" />
            {currentTerminal ? (
              <div>
                <p className="font-semibold">{currentTerminal.name}</p>
                <p className="text-sm">Registrado como <span className="font-semibold">{currentTerminal.registerName}</span></p>
              </div>
            ) : (
              <div>
                <p className="font-semibold">Sin registrar</p>
                <p className="text-sm">
                  Registra este equipo desde la PC de la caja. El registro se guarda en este navegador.
                </p>
              </div>
            )}
          </div>
          {currentTerminal ? (
            <Button variant="secondary" type="button" disabled={updateTerminalMutation.isPending} onClick={() => void revokeTerminal(currentTerminal.id, currentTerminal.name)}>
              Quitar registro
            </Button>
          ) : (
            <Button type="button" disabled={freeRegisters.length === 0} title={freeRegisters.length === 0 ? "Todas las cajas ya tienen su equipo" : undefined} onClick={openRegisterTerminal}>
              Registrar este equipo
            </Button>
          )}
        </div>
        <Link
          href="/impresoras"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-4 text-sm transition hover:bg-slate-50"
        >
          <span className="flex items-center gap-3">
            <Printer className="h-5 w-5 text-slate-500" />
            <span>
              <span className="block font-semibold text-slate-900">Impresoras de este equipo</span>
              <span className="text-slate-500">Asigna la impresora de tickets y la de carta de esta PC.</span>
            </span>
          </span>
          <span className="font-semibold text-slate-700">Configurar</span>
        </Link>
      </Card>

      {/* Cajas */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cajas</h2>
            <p className="mt-1 text-sm text-slate-500">Una caja con sesión abierta no se puede desactivar hasta cerrarla.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DeactivatedLink type="cajas" />
            <Button type="button" onClick={() => setRegisterForm({ id: null, name: "" })}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva caja
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Caja</th>
                  <th className="px-4 py-3">Sesión</th>
                  <th className="px-4 py-3">Equipos</th>
                  <th className="px-4 py-3">Red</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </THead>
              <TBody>
                {shownRegisters.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No hay cajas activas.
                    </td>
                  </tr>
                ) : null}
                {registersPage.items.map((register) => {
                  const registerTerminals = activeTerminalsOf(register.id);
                  const terminalCount = registerTerminals.length;
                  const isOpen = openRegisterIds.has(register.id);
                  return (
                    <tr key={register.id}>
                      <td data-label="Caja" className="px-4 py-3 font-medium text-slate-800">{register.name}</td>
                      <td data-label="Sesión" className="px-4 py-3 text-slate-600">{isOpen ? "Abierta" : "Cerrada"}</td>
                      <td data-label="Equipos" className="px-4 py-3 text-slate-600">
                        {terminalCount === 0 ? (
                          "Sin equipo"
                        ) : terminalCount === 1 ? (
                          <span className="font-medium text-slate-800">{registerTerminals[0]!.name}</span>
                        ) : (
                          <span className="text-rose-700">
                            {terminalCount} equipos: {registerTerminals.map((terminal) => terminal.name).join(", ")}. Cada caja admite uno solo; quita el registro de los demás.
                          </span>
                        )}
                      </td>
                      <td data-label="Red" className="px-4 py-3 text-xs">
                        {(() => {
                          const access = networkAccess.get(register.id);
                          const own = (networksQuery.data?.items ?? []).filter((network) => network.cashRegisterId === register.id);
                          if (!register.isActive || !access) {
                            return <span className="text-slate-400">No aplica</span>;
                          }
                          if (!access.restricted) {
                            return <span className="text-slate-500">Sin restricción</span>;
                          }
                          return (
                            <div className="grid gap-0.5">
                              <span className="font-mono text-slate-700">
                                {own.length > 0 ? own.map((network) => network.cidr).join(", ") : "Solo redes generales"}
                              </span>
                              <span className={access.clientAllowed ? "text-emerald-700" : "text-rose-700"}>
                                {access.clientAllowed ? "Tu IP puede operarla" : "Tu IP está fuera"}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td data-label="Acciones" className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {register.isActive && terminalCount === 0 ? (
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => setIpForm({ terminalId: null, cashRegisterId: String(register.id), name: "", ip: "" })}
                            >
                              <Globe className="mr-1 h-4 w-4" />
                              Asignar PC por IP
                            </Button>
                          ) : null}
                          {register.isActive && terminalCount === 0 ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => {
                                setPairingFor({ id: register.id, name: register.name });
                                setPairingName("");
                                setPairing(null);
                              }}
                            >
                              <KeyRound className="mr-1 h-4 w-4" />
                              Vincular equipo
                            </Button>
                          ) : null}
                          {register.isActive ? (
                            <Button variant="ghost" size="sm" type="button" onClick={() => setRegisterForm({ id: register.id, name: register.name })}>
                              <Pencil className="mr-1 h-4 w-4" />
                              Renombrar
                            </Button>
                          ) : null}
                          <DeactivateButton
                            active={register.isActive}
                            label={register.name}
                            pending={toggleRegisterMutation.isPending}
                            disabled={register.isActive && isOpen}
                            title={register.isActive && isOpen ? "Cierra la caja antes de desactivarla" : undefined}
                            onChange={(isActive) => toggleRegisterMutation.mutate({ id: register.id, isActive })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
          {registersPage.pagination.total > 10 ? <Pagination {...registersPage} /> : null}
        </div>
      </Card>

      {/* Equipos */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Equipos registrados</h2>
        <p className="mt-1 text-sm text-slate-500">Cambia la caja de un equipo sin ir a la PC, revócalo si se cambia o se pierde, y elimínalo cuando ya no lo necesites.</p>
        <div className="mt-4">
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">Equipo</th>
                  <th className="whitespace-nowrap px-4 py-3">Caja</th>
                  <th className="whitespace-nowrap px-4 py-3">Registrado por</th>
                  <th className="whitespace-nowrap px-4 py-3">Último uso</th>
                  <th className="whitespace-nowrap px-4 py-3">IP</th>
                  <th className="whitespace-nowrap px-4 py-3">Estado</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">Acciones</th>
                </tr>
              </THead>
              <TBody>
                {terminals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Aún no hay equipos registrados.</td>
                  </tr>
                ) : null}
                {terminalsPage.items.map((terminal) => (
                  <tr key={terminal.id}>
                    <td data-label="Equipo" className="px-4 py-3">
                      <span className="block font-medium text-slate-800">{terminal.name}</span>
                      {terminal.id === currentTerminal?.id ? (
                        <span className="mt-1 inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Este equipo</span>
                      ) : null}
                    </td>
                    <td data-label="Caja" className="px-4 py-3">
                      <select
                        className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm disabled:opacity-60"
                        value={terminal.cashRegisterId}
                        disabled={!terminal.isActive || updateTerminalMutation.isPending}
                        onChange={(event) => updateTerminalMutation.mutate({ id: terminal.id, cashRegisterId: Number(event.target.value) })}
                      >
                        {allRegisters
                          .filter((register) => register.isActive || register.id === terminal.cashRegisterId)
                          .map((register) => {
                            const taken = register.id !== terminal.cashRegisterId && activeTerminalsOf(register.id).length > 0;
                            return (
                              <option key={register.id} value={register.id} disabled={taken}>
                                {register.name}
                                {taken ? " (ya tiene equipo)" : ""}
                              </option>
                            );
                          })}
                      </select>
                    </td>
                    <td data-label="Registrado por" className="px-4 py-3 text-slate-600">{terminal.registeredByName ?? "N/D"}</td>
                    <td data-label="Último uso" className="px-4 py-3 text-xs text-slate-500">{formatDateTime(terminal.lastSeenAt)}</td>
                    <td data-label="IP" className="px-4 py-3 text-xs">
                      {terminal.boundIp ? (
                        <div className="grid gap-0.5">
                          <span className="font-mono font-semibold text-slate-800">{terminal.boundIp}</span>
                          <span className="text-slate-500">Asignada por IP</span>
                        </div>
                      ) : (
                        <div className="grid gap-0.5" title={terminal.registeredIp ? `Registrado desde ${terminal.registeredIp}` : undefined}>
                          <span className="font-mono text-slate-600">{terminal.lastIp ?? terminal.registeredIp ?? "N/D"}</span>
                          <span className="text-slate-500">Registrado en el navegador</span>
                        </div>
                      )}
                    </td>
                    <td data-label="Estado" className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${terminal.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                      >
                        {terminal.isActive ? "ACTIVO" : "REVOCADO"}
                      </span>
                    </td>
                    <td data-label="Acciones" className="px-4 py-3 text-right">
                      <div className="flex flex-nowrap justify-end gap-1.5">
                        {terminal.isActive && terminal.boundIp ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            onClick={() => setIpForm({ terminalId: terminal.id, cashRegisterId: String(terminal.cashRegisterId), name: terminal.name, ip: terminal.boundIp ?? "" })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Cambiar IP
                          </button>
                        ) : null}
                        {terminal.isActive ? (
                          <button
                            type="button"
                            disabled={updateTerminalMutation.isPending}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                            onClick={() => void revokeTerminal(terminal.id, terminal.name)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Revocar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={deleteTerminalMutation.isPending}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                            onClick={() => void deleteTerminal(terminal.id, terminal.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
          {terminalsPage.pagination.total > 10 ? <Pagination {...terminalsPage} /> : null}
        </div>
      </Card>

      {/* Red autorizada */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Network className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Red autorizada</h2>
            <p className="mt-1 text-sm text-slate-500">
              Verificación extra por IP. Sin redes, los equipos funcionan desde cualquier lugar. Con redes, solo registran, vinculan y
              operan caja desde ellas. Con el servidor en internet, usa la IP pública de la tienda.
            </p>
          </div>
        </div>

        {networksQuery.data ? (
          <div className="mt-4 flex flex-col gap-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Cada red aplica a todas las cajas o a una sola. Un equipo se valida con las redes generales más las de su caja; una caja sin
              redes no tiene restricción.
            </p>
            <p className="shrink-0">
              Tu IP: <span className="font-mono font-semibold">{networksQuery.data.clientIp ?? "N/D"}</span>
            </p>
          </div>
        ) : null}

        <form
          className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void addNetwork(networkCidr.trim(), networkLabel.trim());
          }}
        >
          <div>
            <Label required htmlFor="networkCidr">IP o red</Label>
            <Input
              id="networkCidr"
              className="font-mono"
              value={networkCidr}
              onChange={(event) => setNetworkCidr(event.target.value)}
              placeholder="192.168.1.0/24"
            />
          </div>
          <div>
            <Label required htmlFor="networkScope">Aplica a</Label>
            <select
              id="networkScope"
              className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={networkScope}
              onChange={(event) => setNetworkScope(event.target.value)}
            >
              <option value="">Todas las cajas</option>
              {activeRegisters.map((register) => (
                <option key={register.id} value={register.id}>{register.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="networkLabel">Etiqueta (opcional)</Label>
            <Input id="networkLabel" value={networkLabel} onChange={(event) => setNetworkLabel(event.target.value)} placeholder="Red de la tienda" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={addNetworkMutation.isPending || networkCidr.trim().length === 0}>
              Autorizar
            </Button>
          </div>
        </form>

        {networksQuery.data?.clientIp ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={addNetworkMutation.isPending}
              onClick={() => void addNetwork(networksQuery.data!.clientIp!, "IP de este equipo")}
            >
              Autorizar mi IP ({networksQuery.data.clientIp})
            </Button>
            {ipv4Network24(networksQuery.data.clientIp) ? (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={addNetworkMutation.isPending}
                onClick={() => void addNetwork(ipv4Network24(networksQuery.data!.clientIp)!, "Red de este equipo")}
              >
                Autorizar mi red ({ipv4Network24(networksQuery.data.clientIp)})
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">IP o red</th>
                  <th className="px-4 py-3">Aplica a</th>
                  <th className="px-4 py-3">Etiqueta</th>
                  <th className="px-4 py-3">Autorizada por</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </THead>
              <TBody>
                {networksQuery.data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Sin redes autorizadas: no hay restricción por IP.</td>
                  </tr>
                ) : null}
                {networksPage.items.map((network) => (
                  <tr key={network.id}>
                    <td data-label="IP o red" className="px-4 py-3 font-mono text-sm text-slate-800">{network.cidr}</td>
                    <td data-label="Aplica a" className="px-4 py-3 text-slate-700">{network.registerName ?? "Todas las cajas"}</td>
                    <td data-label="Etiqueta" className="px-4 py-3 text-slate-600">{network.label ?? "Sin etiqueta"}</td>
                    <td data-label="Autorizada por" className="px-4 py-3 text-slate-600">{network.createdByName ?? "N/D"}</td>
                    <td data-label="Acciones" className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={removeNetworkMutation.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Quitar red autorizada",
                            message: `Se quitará la red "${network.cidr}".`,
                            confirmLabel: "Quitar",
                            tone: "danger"
                          });
                          if (ok) {
                            removeNetworkMutation.mutate(network.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
          {networksPage.pagination.total > 10 ? <Pagination {...networksPage} /> : null}
        </div>
      </Card>

      {/* Asignar PC por IP */}
      <Modal
        className="max-w-3xl"
        open={Boolean(ipForm)}
        onClose={() => setIpForm(null)}
        title={ipForm?.terminalId ? "Cambiar IP del equipo" : "Asignar PC por IP"}
      >
        {ipForm ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              ipMutation.mutate();
            }}
          >
            <p className="text-sm text-slate-600">
              La PC con esta IP queda habilitada como la caja elegida, sin código ni registro en su navegador. La PC debe tener IP fija
              (reservada en el router); si cambia, actualízala aquí.
            </p>
            {!ipForm.terminalId ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label required htmlFor="ipRegister">Caja</Label>
                  <select
                    id="ipRegister"
                    className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                    value={ipForm.cashRegisterId}
                    onChange={(event) => setIpForm({ ...ipForm, cashRegisterId: event.target.value })}
                  >
                    {freeRegisters.map((register) => (
                      <option key={register.id} value={register.id}>{register.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label required htmlFor="ipName">Nombre del equipo</Label>
                  <Input id="ipName" value={ipForm.name} onChange={(event) => setIpForm({ ...ipForm, name: event.target.value })} placeholder="PC Caja 2" />
                </div>
              </div>
            ) : null}
            <div>
              <Label required htmlFor="ipAddress">IP de la PC</Label>
              <div className="flex gap-2">
                <Input
                  id="ipAddress"
                  className="font-mono"
                  value={ipForm.ip}
                  onChange={(event) => setIpForm({ ...ipForm, ip: event.target.value })}
                  placeholder="192.168.1.30"
                  autoFocus
                />
                {networksQuery.data?.clientIp ? (
                  <Button variant="secondary" type="button" onClick={() => setIpForm({ ...ipForm, ip: networksQuery.data!.clientIp! })}>
                    Usar la de esta PC
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Para ver la IP de otra PC: en esa PC abre Símbolo del sistema y escribe ipconfig (Dirección IPv4).
              </p>
            </div>
            {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setIpForm(null)}>Cancelar</Button>
              <Button
                type="submit"
                disabled={
                  ipMutation.isPending ||
                  ipForm.ip.trim().length === 0 ||
                  (!ipForm.terminalId && (ipForm.name.trim().length === 0 || !ipForm.cashRegisterId))
                }
              >
                {ipForm.terminalId ? "Guardar IP" : "Asignar"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Código de vinculación */}
      <Modal className="max-w-3xl" open={Boolean(pairingFor)} onClose={closePairing} title={pairingFor ? `Vincular equipo a ${pairingFor.name}` : "Vincular equipo"}>
        {pairing ? (
          <div className="grid gap-5">
            <div className="grid justify-items-center gap-2 rounded-2xl bg-slate-50 px-4 py-8 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">Código de vinculación</p>
              <p className="font-mono text-4xl font-semibold tracking-[0.2em] text-slate-900 sm:text-5xl">{pairing.code}</p>
              <p className={`text-sm ${pairingSecondsLeft > 0 ? "text-slate-600" : "text-rose-700"}`}>
                {pairingSecondsLeft > 0
                  ? `Vence en ${Math.floor(pairingSecondsLeft / 60)}:${String(pairingSecondsLeft % 60).padStart(2, "0")}`
                  : "El código venció. Genera uno nuevo."}
              </p>
            </div>
            <ol className="grid list-decimal gap-1 pl-5 text-sm text-slate-600">
              <li>En la PC de la caja, inicia sesión con cualquier usuario que tenga acceso a Caja.</li>
              <li>Abre el módulo <span className="font-semibold">Caja</span>.</li>
              <li>En el aviso &quot;Este equipo no está registrado&quot;, escribe el código y presiona <span className="font-semibold">Vincular</span>.</li>
            </ol>
            <p className="text-xs text-slate-500">El código sirve una sola vez. Generar otro anula este.</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" disabled={pairingMutation.isPending} onClick={() => pairingMutation.mutate()}>
                Generar otro
              </Button>
              <Button type="button" onClick={closePairing}>Listo</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-slate-600">
              Genera un código de un solo uso y escríbelo en la PC que será esta caja. No hace falta iniciar sesión como administrador en esa PC.
            </p>
            {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
            <div>
              <Label htmlFor="pairingName">Nombre del equipo (opcional)</Label>
              <Input id="pairingName" value={pairingName} onChange={(event) => setPairingName(event.target.value)} placeholder="PC Caja 2" autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={closePairing}>Cancelar</Button>
              <Button type="button" disabled={pairingMutation.isPending} onClick={() => pairingMutation.mutate()}>
                Generar código
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Crear / renombrar caja */}
      <Modal
        className="max-w-3xl"
        open={Boolean(registerForm)}
        onClose={() => setRegisterForm(null)}
        title={registerForm?.id ? "Renombrar caja" : "Nueva caja"}
      >
        <div className="grid gap-4">
          <div>
            <Label required htmlFor="registerName">Nombre</Label>
            <Input
              id="registerName"
              value={registerForm?.name ?? ""}
              onChange={(event) => setRegisterForm((current) => (current ? { ...current, name: event.target.value } : current))}
              placeholder="Caja 2"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setRegisterForm(null)}>Cancelar</Button>
            <Button
              type="button"
              disabled={saveRegisterMutation.isPending || !registerForm || registerForm.name.trim().length === 0}
              onClick={() => saveRegisterMutation.mutate()}
            >
              Guardar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Registrar este equipo */}
      <Modal className="max-w-3xl" open={registerTerminalOpen} onClose={() => setRegisterTerminalOpen(false)} title="Registrar este equipo">
        <div className="grid gap-4">
          <p className="text-sm text-slate-600">
            Este equipo quedará ligado a la caja elegida: sus ventas, abonos y pagos irán a esa caja, sin importar qué usuario inicie sesión.
          </p>
          <div>
            <Label required htmlFor="terminalRegister">Caja</Label>
            <select
              id="terminalRegister"
              className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
              value={terminalRegisterId}
              onChange={(event) => setTerminalRegisterId(event.target.value)}
            >
              {freeRegisters.map((register) => (
                <option key={register.id} value={register.id}>{register.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Solo aparecen las cajas que todavía no tienen equipo: cada caja admite uno solo.</p>
          </div>
          <div>
            <Label required htmlFor="terminalName">Nombre del equipo</Label>
            <Input id="terminalName" value={terminalName} onChange={(event) => setTerminalName(event.target.value)} placeholder="PC Mostrador" autoFocus />
          </div>
          <p className="text-xs text-slate-500">
            Si se borran los datos del navegador o se usa otro navegador en esta PC, habrá que registrarla de nuevo.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setRegisterTerminalOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              disabled={registerTerminalMutation.isPending || !terminalRegisterId || terminalName.trim().length === 0}
              onClick={() => registerTerminalMutation.mutate()}
            >
              Registrar
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
