"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, Monitor, ReceiptText, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { usePrintSetup } from "@/hooks/use-print-setup";
import { printAgent, type AgentPrinter, type PrintKind } from "@/lib/print-agent";
import { cn } from "@/lib/utils";
import { printService, type LocalTicketTarget } from "@/services/print-service";

/** Opción del ticket térmico: "escpos:" + impresora del sistema (\\.\COM1, windows-raw:..., tcp://...). */
const ESCPOS = "escpos:";
const NETWORK_OPTION = "__red__";

const CONNECTION_LABEL: Record<AgentPrinter["connection"], string> = {
  usb: "USB",
  red: "Red / IP",
  serial: "Serial",
  compartida: "Compartida",
  virtual: "Virtual",
  otra: "Otra"
};

function Tag({ tone, children }: { tone: "slate" | "emerald" | "rose" | "sky"; children: ReactNode }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    sky: "bg-sky-50 text-sky-700"
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

/** Texto corto para una impresora de ticket térmico (lo que guarda el sistema). */
function describeInterface(iface: string) {
  if (/^\\\\\.\\COM\d+$/i.test(iface)) return { label: iface.slice(4).toUpperCase(), kind: "Puerto COM" };
  if (iface.startsWith("windows-raw:")) return { label: iface.slice("windows-raw:".length), kind: "Windows" };
  if (iface.startsWith("tcp://")) return { label: iface.slice("tcp://".length), kind: "Red / IP" };
  if (iface.startsWith("windows:")) return { label: iface.slice("windows:".length), kind: "Compartida" };
  return { label: iface, kind: "Otra" };
}

const optionClass = "h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

/**
 * Impresoras de ESTE equipo.
 *   - Tickets: en la PC donde corre el sistema (cada caja), el ticket térmico (siempre el
 *     mismo formato) por puerto COM (EPSON TM Virtual Port), impresora de Windows o red.
 *     También se puede usar el formato PDF por el programa de impresión.
 *   - Carta: impresora de Windows por el programa de impresión (PDF).
 * Un tipo sin impresora no ofrece "Imprimir" en el sistema.
 */
export function PrinterSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const setup = usePrintSetup();
  const [busy, setBusy] = useState<string | null>(null);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [networkHost, setNetworkHost] = useState("");
  const [networkPort, setNetworkPort] = useState("9100");

  const printersQuery = useQuery({
    queryKey: ["print-agent", "printers"],
    queryFn: () => printAgent.printers(),
    enabled: setup.agentOnline,
    retry: false
  });
  const targetsQuery = useQuery({
    queryKey: ["print", "local-targets"],
    queryFn: () => printService.localTargets(),
    enabled: setup.isServerPc,
    retry: false
  });

  const printers = printersQuery.data?.items ?? [];
  const targets = targetsQuery.data?.items ?? [];
  const serverInterface = setup.isServerPc && setup.serverPrinter?.configured ? setup.serverPrinter.interface : "";
  const ticketValue = serverInterface ? `${ESCPOS}${serverInterface}` : setup.agent?.ticketPrinter ?? "";
  const letterValue = setup.agent?.letterPrinter ?? "";

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["print-agent"] });
    await queryClient.invalidateQueries({ queryKey: ["print"] });
  };

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await action());
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  /** Una sola impresora de tickets: elegir una quita la otra. */
  const changeTicket = (value: string) => {
    if (value === NETWORK_OPTION) {
      setNetworkOpen(true);
      return;
    }
    void run("ticket", async () => {
      if (value.startsWith(ESCPOS)) {
        const iface = value.slice(ESCPOS.length);
        await printService.setTicketPrinter(iface);
        if (setup.agentOnline) await printAgent.saveConfig({ ticketPrinter: null });
        return `Tickets en formato térmico por ${describeInterface(iface).label}.`;
      }
      if (setup.isServerPc && serverInterface) await printService.setTicketPrinter("");
      if (setup.agentOnline) await printAgent.saveConfig({ ticketPrinter: value || null });
      return value ? `Tickets en formato PDF por ${value}.` : "Tickets sin impresora en este equipo.";
    });
  };

  const saveNetwork = () => {
    const host = networkHost.trim();
    const port = Number(networkPort) || 9100;
    if (!/^[\w.-]+$/.test(host) || port < 1 || port > 65535) {
      toast.error("Escribe la dirección IP de la impresora, por ejemplo 192.168.1.50.");
      return;
    }
    setNetworkOpen(false);
    changeTicket(`${ESCPOS}tcp://${host}:${port}`);
  };

  const changeLetter = (value: string) =>
    run("letter", async () => {
      await printAgent.saveConfig({ letterPrinter: value || null });
      return value ? `Impresora de carta: ${value}.` : "Documentos carta sin impresora en este equipo.";
    });

  const testPrint = (kind: PrintKind, value: string) =>
    run(`test-${kind}`, async () => {
      if (value.startsWith(ESCPOS)) {
        await printService.testTicket();
        return "Ticket de prueba enviado.";
      }
      const response = await printService.testPdf(kind === "ticket" ? "ticket" : "carta");
      await printAgent.print(kind, await response.blob(), value);
      return `Página de prueba enviada a ${value}.`;
    });

  /** Estado de la opción elegida, debajo del menú. */
  const details = (value: string) => {
    if (value.startsWith(ESCPOS)) {
      const iface = value.slice(ESCPOS.length);
      const target = targets.find((item) => item.interface === iface);
      const server = setup.serverPrinter;
      return (
        <>
          <Tag tone="sky">Formato térmico</Tag>
          <Tag tone="slate">{describeInterface(iface).kind}</Tag>
          {target?.detail ? <Tag tone="slate">{target.detail}</Tag> : null}
          {server ? server.connected ? <Tag tone="emerald">Lista</Tag> : <Tag tone="rose">{server.error ?? "No disponible"}</Tag> : null}
        </>
      );
    }

    if (!value) {
      return <span className="text-xs text-slate-500">No se ofrecerá imprimir este tipo de documento en este equipo.</span>;
    }

    const printer = printers.find((item) => item.name === value);
    if (!printer) {
      return setup.agentOnline && !printersQuery.isLoading ? <Tag tone="rose">No encontrada en esta PC</Tag> : null;
    }

    return (
      <>
        <Tag tone="slate">Formato PDF</Tag>
        <Tag tone="slate">{CONNECTION_LABEL[printer.connection]}</Tag>
        {printer.driver ? <Tag tone="slate">{printer.driver}</Tag> : null}
        {printer.isDefault ? <Tag tone="sky">Predeterminada de Windows</Tag> : null}
        {printer.offline ? <Tag tone="rose">Desconectada</Tag> : <Tag tone="emerald">Lista</Tag>}
      </>
    );
  };

  const targetOption = (target: LocalTicketTarget) => (
    <option key={target.interface} value={`${ESCPOS}${target.interface}`}>
      {target.label}
      {target.detail ? ` · ${target.detail}` : ""}
    </option>
  );

  const ticketSelect = () => {
    const thermal = targets.filter((target) => target.thermal);
    const others = targets.filter((target) => !target.thermal);
    const knownEscpos = !serverInterface || targets.some((target) => target.interface === serverInterface);
    const missingPdf = ticketValue && !ticketValue.startsWith(ESCPOS) && !printers.some((printer) => printer.name === ticketValue);

    return (
      <>
        <option value="">Sin impresora</option>
        {setup.isServerPc ? (
          <optgroup label="Ticket térmico (recomendado, mismo formato en todas las cajas)">
            {thermal.map(targetOption)}
            {/* Impresora guardada que no está en la lista (red, o ya no instalada). */}
            {!knownEscpos ? <option value={ticketValue}>{describeInterface(serverInterface).label}</option> : null}
            <option value={NETWORK_OPTION}>Impresora de red (dirección IP)...</option>
          </optgroup>
        ) : null}
        {setup.isServerPc && others.length > 0 ? (
          <optgroup label="Otras impresoras en formato térmico (solo si son de tickets)">{others.map(targetOption)}</optgroup>
        ) : null}
        {printers.length > 0 ? (
          <optgroup label="Formato PDF (programa de impresión)">
            {printers.map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.name} · {CONNECTION_LABEL[printer.connection]}
                {printer.offline ? " · desconectada" : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
        {missingPdf ? <option value={ticketValue}>{ticketValue} (no encontrada)</option> : null}
      </>
    );
  };

  const letterSelect = () => {
    const missing = letterValue && !printers.some((printer) => printer.name === letterValue);
    return (
      <>
        <option value="">Sin impresora</option>
        {printers.length > 0 ? (
          <optgroup label="Impresoras de esta PC">
            {printers.map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.name} · {CONNECTION_LABEL[printer.connection]}
                {printer.offline ? " · desconectada" : ""}
              </option>
            ))}
          </optgroup>
        ) : null}
        {missing ? <option value={letterValue}>{letterValue} (no encontrada)</option> : null}
      </>
    );
  };

  const section = (props: {
    kind: PrintKind;
    icon: ReactNode;
    title: string;
    description: string;
    value: string;
    options: ReactNode;
    selectable: boolean;
    onSelect: (value: string) => void;
  }) => {
    const testable = Boolean(props.value) && (props.value.startsWith(ESCPOS) || setup.agentOnline);

    return (
      <Card className="flex flex-col p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">{props.icon}</span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
            <p className="text-sm text-slate-500">{props.description}</p>
          </div>
        </div>

        <label htmlFor={`printer-${props.kind}`} className="mt-5 text-sm font-medium text-slate-700">
          Impresora
        </label>
        <div className="mt-1 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <select
              id={`printer-${props.kind}`}
              className={optionClass}
              value={props.value}
              disabled={busy !== null || !props.selectable}
              onChange={(event) => props.onSelect(event.target.value)}
            >
              {props.options}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
          <Button variant="secondary" type="button" disabled={busy !== null || !testable} onClick={() => testable && void testPrint(props.kind, props.value)}>
            Probar
          </Button>
        </div>

        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1">{details(props.value)}</div>
      </Card>
    );
  };

  return (
    <div className="grid gap-6">
      {/* Estado del programa de impresión */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-title">Sistema · Este equipo</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Impresoras</h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Elige en qué impresora de esta PC salen los tickets y los documentos carta. Se guarda en esta PC y aplica a todos los usuarios
              que la usen.
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3",
              setup.isLoading ? "bg-slate-50" : setup.agentOnline ? "bg-emerald-50" : "bg-rose-50"
            )}
          >
            <Monitor className={cn("h-6 w-6 shrink-0", setup.agentOnline ? "text-emerald-700" : "text-rose-700")} />
            <div className="text-sm">
              <p className="font-semibold text-slate-900">
                {setup.isLoading ? "Buscando programa de impresión" : setup.agentOnline ? "Programa de impresión activo" : "Programa de impresión no detectado"}
              </p>
              <p className="text-slate-600">
                {setup.agentOnline
                  ? `${setup.agent?.hostname} · ${printers.length} ${printers.length === 1 ? "impresora" : "impresoras"} en Windows`
                  : "No se pueden leer las impresoras de esta PC"}
              </p>
            </div>
            <Button variant="ghost" size="sm" type="button" title="Volver a buscar" onClick={() => void refresh()}>
              <RefreshCw className={cn("h-4 w-4", printersQuery.isFetching || targetsQuery.isFetching ? "animate-spin" : "")} />
            </Button>
          </div>
        </div>

        {!setup.isLoading && !setup.agentOnline ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">El programa de impresión no está activo en esta PC</p>
            <p className="mt-1">
              Sin él no se imprimen documentos carta en este equipo
              {setup.isServerPc ? "; los tickets en formato térmico sí funcionan" : ""}. Instálalo y presiona volver a buscar.
            </p>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {section({
          kind: "ticket",
          icon: <ReceiptText className="h-5 w-5" />,
          title: "Tickets (80 mm)",
          description: setup.isServerPc
            ? "Formato térmico: el mismo ticket con cualquier conexión (puerto COM, USB con driver de Windows o red)."
            : "Facturas en formato ticket para la impresora térmica.",
          value: ticketValue,
          options: ticketSelect(),
          selectable: setup.isServerPc || setup.agentOnline,
          onSelect: changeTicket
        })}

        {section({
          kind: "letter",
          icon: <FileText className="h-5 w-5" />,
          title: "Documentos carta",
          description: "Facturas, proformas, cotizaciones y cierres de caja en tamaño carta.",
          value: letterValue,
          options: letterSelect(),
          selectable: setup.agentOnline,
          onSelect: (value) => void changeLetter(value)
        })}
      </div>

      <Modal open={networkOpen} onClose={() => setNetworkOpen(false)} eyebrow="Tickets" title="Impresora de red">
        <div className="grid gap-4">
          <p className="text-sm text-slate-600">Impresora de tickets conectada por cable de red o WiFi. La dirección aparece en su hoja de configuración.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <label htmlFor="network-host" className="text-sm font-medium text-slate-700">
                Dirección IP<span className="ml-0.5 text-rose-500">*</span>
              </label>
              <Input id="network-host" className="mt-1 font-mono" placeholder="192.168.1.50" value={networkHost} onChange={(event) => setNetworkHost(event.target.value)} />
            </div>
            <div>
              <label htmlFor="network-port" className="text-sm font-medium text-slate-700">
                Puerto
              </label>
              <Input id="network-port" className="mt-1 font-mono" inputMode="numeric" value={networkPort} onChange={(event) => setNetworkPort(event.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setNetworkOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!networkHost.trim()} onClick={saveNetwork}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
