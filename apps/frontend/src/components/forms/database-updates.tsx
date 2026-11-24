"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { systemService, type PendingMigrationReview } from "@/services/system-service";

/**
 * Actualizaciones de estructura pendientes de la base conectada. Se aplican solo si
 * ninguna cambia ni borra datos existentes; si alguna no pasa la revisión, se muestra
 * el motivo y no se ofrece aplicar.
 */
export function DatabaseUpdates({ reviews }: { reviews: PendingMigrationReview[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const blocked = reviews.filter((review) => review.problems.length > 0);

  const migrateMutation = useMutation({
    mutationFn: () => systemService.migrateDatabase(),
    onSuccess: (result) => {
      if (result.blocked.length > 0) {
        toast.error("No se aplicó ninguna actualización: algunas cambiarían datos existentes.");
      } else {
        toast.success(`Base actualizada: ${result.applied.length} ${result.applied.length === 1 ? "cambio aplicado" : "cambios aplicados"}.`);
      }
      void queryClient.invalidateQueries();
    },
    onError: (error) => toast.error((error as Error).message)
  });

  const apply = async () => {
    const ok = await confirm({
      title: "Aplicar actualizaciones",
      message:
        "Antes de continuar, haz un respaldo de la base de datos. Solo cambia la estructura: los datos que ya existen no se modifican ni se borran; si algún cambio pudiera hacerlo, no se aplica nada. Las cajas con un programa más viejo quedarán bloqueadas hasta actualizarse.",
      confirmLabel: "Aplicar"
    });
    if (ok) migrateMutation.mutate();
  };

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Actualizaciones de la base</h2>
            <p className="text-sm text-slate-500">
              El programa trae {reviews.length} {reviews.length === 1 ? "cambio" : "cambios"} de estructura que esta base todavía no tiene.
            </p>
          </div>
        </div>
        <Button type="button" className="shrink-0" disabled={blocked.length > 0 || migrateMutation.isPending} onClick={() => void apply()}>
          {migrateMutation.isPending ? "Aplicando..." : "Aplicar actualizaciones"}
        </Button>
      </div>

      {blocked.length > 0 ? (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          No se aplicará ninguna: {blocked.length === 1 ? "una actualización cambiaría" : "algunas actualizaciones cambiarían"} datos existentes. Corrige primero los datos indicados abajo o pide ayuda al soporte.
        </p>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Se revisaron todas: solo cambian la estructura, los datos que ya existen no se tocan. Haz un respaldo de la base antes de aplicarlas.
        </p>
      )}

      <ul className="mt-4 grid gap-2">
        {reviews.map((review) => (
          <li key={review.file} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
            <p className="font-medium text-slate-900">{review.title}</p>
            {review.dataChange ? <p className="mt-1 text-slate-600">Completa la información nueva: {review.dataChange}</p> : null}
            {review.problems.map((problem) => (
              <p key={problem} className="mt-1 text-rose-700">
                No se puede aplicar: {problem}.
              </p>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}
