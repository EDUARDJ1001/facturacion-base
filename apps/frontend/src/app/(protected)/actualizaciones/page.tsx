"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatDate } from "@/lib/utils";
import { updatesService, type UpdatesStatus } from "@/services/updates-service";

const BUSY_TEXT: Record<NonNullable<UpdatesStatus["busy"]>, string> = {
  descargando: "Descargando la versión nueva...",
  instalando: "Comprobando e instalando...",
  reiniciando: "Reiniciando el sistema con la versión nueva..."
};

function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Sistema > Actualizaciones: versión de esta caja y versiones nuevas publicadas. */
export default function ActualizacionesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["system", "updates"],
    queryFn: () => updatesService.status(),
    enabled: isAdmin,
    refetchInterval: (query) => (query.state.data?.busy ? 2000 : false)
  });

  const checkMutation = useMutation({
    mutationFn: () => updatesService.check(),
    onSuccess: (data) => {
      queryClient.setQueryData(["system", "updates"], data);
      if (data.error) toast.error(data.error);
      else toast.success(data.available ? `Hay una versión nueva: ${data.available.version}.` : "Esta caja tiene la versión más reciente.");
    },
    onError: (error) => toast.error((error as Error).message)
  });

  // Al cambiar de versión el sistema se reinicia: las pantallas se recargan solas cuando vuelve.
  const applyMutation = useMutation({
    mutationFn: () => updatesService.apply(),
    onSuccess: (result) => {
      setConfirmUpdate(false);
      setSwitching(result.version);
    },
    onError: (error) => {
      setConfirmUpdate(false);
      toast.error((error as Error).message);
      void statusQuery.refetch();
    }
  });

  if (!isAdmin) {
    return <Card className="mx-auto max-w-xl p-6 text-center text-slate-600">Solo un administrador puede actualizar el sistema.</Card>;
  }

  if (statusQuery.isLoading) {
    return <Spinner label="Consultando la versión..." />;
  }

  const status = statusQuery.data;
  if (!status) {
    return <Card className="mx-auto max-w-xl p-6 text-center text-slate-600">No se pudo consultar la versión del sistema.</Card>;
  }

  if (switching || status.busy === "reiniciando") {
    return (
      <Card className="mx-auto grid max-w-xl justify-items-center gap-3 p-8 text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-brand motion-reduce:animate-none" aria-hidden />
        <p className="text-lg font-semibold text-slate-900">Cambiando a la versión {switching ?? status.available?.version}</p>
        <p className="text-sm text-slate-600">El sistema se reinicia en esta caja. La pantalla se recarga sola en unos segundos; no cierres el programa.</p>
      </Card>
    );
  }

  const available = status.available;

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <Card className="p-4 sm:p-6">
        <p className="section-title">Sistema</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Actualizaciones</h1>
        <p className="mt-2 text-slate-600">
          Instala la versión nueva del sistema en esta caja cuando te convenga. Cada caja se actualiza por separado.
        </p>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-4 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-slate-900">Versión instalada: {status.current}</p>
            <p className="text-slate-600">
              {!status.supported
                ? "Las actualizaciones se instalan en el programa de escritorio de cada caja."
                : !status.configured
                  ? "No hay una dirección de actualizaciones configurada en esta caja."
                  : status.checkedAt
                    ? `Revisado el ${formatDate(status.checkedAt)}, ${new Date(status.checkedAt).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}`
                    : "Todavía no se ha revisado si hay versiones nuevas."}
            </p>
            {status.error ? <p className="mt-1 text-rose-700">{status.error}</p> : null}
          </div>
          {status.supported && status.configured ? (
            <Button variant="secondary" size="sm" type="button" disabled={checkMutation.isPending || Boolean(status.busy)} onClick={() => checkMutation.mutate()}>
              <RefreshCw className={cn("mr-2 h-4 w-4", checkMutation.isPending && "animate-spin motion-reduce:animate-none")} aria-hidden />
              {checkMutation.isPending ? "Buscando..." : "Buscar actualizaciones"}
            </Button>
          ) : null}
        </div>
      </Card>

      {available ? (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900">Versión {available.version} disponible</p>
                <p className="text-sm text-slate-500">
                  Publicada el {formatDate(available.date)} · {megabytes(available.size)}
                </p>
              </div>
            </div>
            {available.needsInstaller ? null : (
              <Button type="button" disabled={Boolean(status.busy) || applyMutation.isPending} onClick={() => setConfirmUpdate(true)}>
                <Download className="mr-2 h-4 w-4" aria-hidden />
                Actualizar
              </Button>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Novedades</p>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{available.notes}</p>
          </div>

          {available.needsInstaller ? (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Esta versión necesita el instalador nuevo (InstalarCaja). Pídeselo a quien administra el sistema.
            </p>
          ) : null}
          {status.busy ? (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              {BUSY_TEXT[status.busy]}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Modal open={confirmUpdate} onClose={() => setConfirmUpdate(false)} eyebrow="Actualizaciones" title={`Actualizar a la versión ${available?.version ?? ""}`}>
        <div className="grid gap-4">
          <p className="text-sm text-slate-600">
            Se descarga la versión nueva y el sistema se reinicia en esta caja (unos segundos). Termina antes la venta que tengas en curso.
          </p>
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Si la versión trae cambios en la base de datos, las demás cajas tendrán que actualizarse para seguir trabajando; verán el aviso con el botón para hacerlo.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setConfirmUpdate(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={applyMutation.isPending} onClick={() => applyMutation.mutate()}>
              {applyMutation.isPending ? (status.busy ? BUSY_TEXT[status.busy] : "Descargando...") : "Actualizar ahora"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
