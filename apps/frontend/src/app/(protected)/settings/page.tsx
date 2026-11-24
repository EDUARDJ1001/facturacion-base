"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { settingsService } from "@/services/settings-service";
import { formatDate } from "@/lib/utils";
import type { BillingSeries } from "@/types/api";

/* ------------------------------------------------------------------ */
/* Series de facturación (CAI)                                          */
/* ------------------------------------------------------------------ */

/** Agrupa una cadena en bloques según los tamaños dados y los une con guiones. */
function groupWithDashes(raw: string, sizes: number[]) {
  const groups: string[] = [];
  let i = 0;
  for (const size of sizes) {
    if (i >= raw.length) break;
    groups.push(raw.slice(i, i + size));
    i += size;
  }
  return groups.join("-");
}

/** CAI: 32 letras y números en grupos 6-6-6-6-6-2. */
function maskCai(value: string) {
  const chars = value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 32);
  return groupWithDashes(chars, [6, 6, 6, 6, 6, 2]);
}

/** Prefijo: 8 dígitos en grupos 3-3-2. */
function maskPrefix(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return groupWithDashes(digits, [3, 3, 2]);
}

/** Solo dígitos, hasta 8 (números inicial/final = correlativo de 8 posiciones). */
function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

const seriesSchema = z.object({
  documentType: z.enum(["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "RECIBO"]),
  prefix: z.string().trim().regex(/^\d{3}-\d{3}-\d{2}$/, "Formato del prefijo: 000-001-01."),
  cai: z
    .string()
    .trim()
    .regex(
      /^[0-9A-Za-z]{6}(-[0-9A-Za-z]{6}){4}-[0-9A-Za-z]{2}$/,
      "Completa el CAI: 32 letras y números con el formato XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX."
    ),
  resolutionNumber: z.string().optional(),
  resolutionDate: z.string().optional(),
  issueDeadline: z.string().min(1, "La fecha límite de emisión es obligatoria."),
  rangeStart: z.coerce.number().int().positive("Debe ser mayor que cero.").max(99999999, "Máximo 8 dígitos."),
  rangeEnd: z.coerce.number().int().positive("Debe ser mayor que cero.").max(99999999, "Máximo 8 dígitos."),
  currentNumber: z.coerce.number().int().positive(),
  notes: z.string().optional()
}).superRefine((value, ctx) => {
  if (value.rangeEnd < value.rangeStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El fin del rango no puede ser menor que el inicio.", path: ["rangeEnd"] });
  }
  // Fin + 1 = serie agotada (así queda cuando se emite el último número).
  if (value.currentNumber < value.rangeStart || value.currentNumber > value.rangeEnd + 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El correlativo actual debe estar dentro del rango autorizado.",
      path: ["currentNumber"]
    });
  }
});

type SeriesValues = z.infer<typeof seriesSchema>;

const emptySeries: SeriesValues = {
  documentType: "FACTURA",
  prefix: "",
  cai: "",
  resolutionNumber: "",
  resolutionDate: "",
  issueDeadline: "",
  rangeStart: "" as unknown as number,
  rangeEnd: "" as unknown as number,
  currentNumber: "" as unknown as number,
  notes: ""
};

const documentTypeLabels: Record<string, string> = {
  FACTURA: "Factura",
  NOTA_CREDITO: "Nota de crédito",
  NOTA_DEBITO: "Nota de débito",
  RECIBO: "Recibo"
};

function SeriesCard({
  series,
  onEdit,
  onToggle,
  busy
}: {
  series: BillingSeries;
  onEdit: () => void;
  onToggle: () => void;
  busy: boolean;
}) {
  const barTone =
    series.usedPercent >= 90 ? "bg-rose-500" : series.usedPercent >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{series.prefix}</h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${series.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${series.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
              {series.isActive ? "Activa" : "Inactiva"}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {documentTypeLabels[series.documentType] ?? series.documentType}
            </span>
          </div>
          <p className="mt-2 break-all font-mono text-sm text-slate-700">{series.cai}</p>
          {series.resolutionNumber ? (
            <p className="mt-1 text-xs text-slate-500">
              Resolución {series.resolutionNumber}
              {series.resolutionDate ? ` · ${formatDate(series.resolutionDate)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" type="button" onClick={onEdit}>
            Editar
          </Button>
          <Button variant={series.isActive ? "ghost" : "primary"} size="sm" type="button" disabled={busy} onClick={onToggle}>
            {series.isActive ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </div>

      {series.warnings.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {series.warnings.map((warning) => (
            <li key={warning} className="rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Rango autorizado</dt>
          <dd className="mt-1 font-mono text-sm text-slate-800">{series.firstNumber}</dd>
          <dd className="font-mono text-sm text-slate-800">{series.lastNumber}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Próxima factura</dt>
          <dd className="mt-1 font-mono text-sm text-slate-800">{series.nextNumber ?? "Rango agotado"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Fecha límite de emisión</dt>
          <dd className="mt-1 text-sm text-slate-800">{formatDate(series.issueDeadline)}</dd>
          <dd className="text-xs text-slate-500">
            {series.daysToDeadline < 0 ? `Venció hace ${Math.abs(series.daysToDeadline)} días` : `Faltan ${series.daysToDeadline} días`}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Consumo</dt>
          <dd className="mt-1 text-sm text-slate-800">
            {series.issuedCount} de {series.totalAuthorized} emitidas
          </dd>
          <dd className="text-xs text-slate-500">{series.remainingCount} disponibles</dd>
        </div>
      </dl>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, series.usedPercent)}%` }} />
      </div>

      {series.notes ? <p className="mt-3 text-sm text-slate-600">{series.notes}</p> : null}
    </Card>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [seriesModalOpen, setSeriesModalOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<BillingSeries | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [caiRejected, setCaiRejected] = useState(false);

  const seriesQuery = useQuery({
    queryKey: ["settings", "series"],
    queryFn: () => settingsService.listSeries()
  });

  const seriesForm = useForm<SeriesValues>({
    resolver: zodResolver(seriesSchema),
    defaultValues: emptySeries
  });

  useEffect(() => {
    if (editingSeries) {
      seriesForm.reset({
        documentType: editingSeries.documentType,
        prefix: `${editingSeries.establishmentCode}-${editingSeries.pointCode}-${editingSeries.documentCode}`,
        cai: editingSeries.cai,
        resolutionNumber: editingSeries.resolutionNumber ?? "",
        resolutionDate: editingSeries.resolutionDate ?? "",
        issueDeadline: editingSeries.issueDeadline,
        rangeStart: editingSeries.rangeStart,
        rangeEnd: editingSeries.rangeEnd,
        currentNumber: editingSeries.currentNumber,
        notes: editingSeries.notes ?? ""
      });
      return;
    }

    seriesForm.reset(emptySeries);
  }, [editingSeries, seriesForm]);

  // En un CAI nuevo el próximo correlativo siempre arranca en el número inicial.
  const rangeStartValue = seriesForm.watch("rangeStart");
  useEffect(() => {
    if (editingSeries) {
      return;
    }
    seriesForm.setValue("currentNumber", (rangeStartValue ? Number(rangeStartValue) : "") as unknown as number);
  }, [rangeStartValue, editingSeries, seriesForm]);

  // Vista previa del próximo correlativo completo: PREFIJO-NNNNNNNN (igual formato que la factura).
  const prefixValue = seriesForm.watch("prefix");
  const currentNumberValue = seriesForm.watch("currentNumber");
  const nextCorrelativoDisplay =
    prefixValue && currentNumberValue
      ? `${prefixValue}-${String(currentNumberValue).padStart(8, "0")}`
      : "";

  const saveSeriesMutation = useMutation({
    mutationFn: (values: SeriesValues) => {
      const [establishmentCode, pointCode, documentCode] = values.prefix.split("-");
      const payload = { ...values, cai: values.cai.toUpperCase(), establishmentCode, pointCode, documentCode };

      if (editingSeries) {
        return settingsService.updateSeries(editingSeries.id, payload);
      }

      // Un CAI nuevo entra como el activo; el backend desactiva el anterior.
      return settingsService.createSeries({ ...payload, isActive: true });
    },
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      setSeriesModalOpen(false);
      setEditingSeries(null);
      setFeedback({ tone: "ok", message: response.message });
    }
    // El error se muestra dentro del modal (saveSeriesMutation.error), no en la página.
  });

  const seriesStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => settingsService.updateSeriesStatus(id, isActive),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      setFeedback({ tone: "ok", message: response.message });
    },
    onError: (error: Error) => setFeedback({ tone: "error", message: error.message })
  });

  if (seriesQuery.isLoading) {
    return <Spinner label="Cargando facturación SAR..." />;
  }

  const seriesItems = seriesQuery.data?.items ?? [];
  const activeSeries = seriesItems.find((item) => item.isActive && item.documentType === "FACTURA");

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <p className="section-title">Facturación SAR</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">CAI, rango y correlativos</h1>
        <p className="mt-3 text-slate-600">
          Administra el CAI, el rango autorizado y la fecha límite de emisión. Los textos legales de la factura (título,
          leyendas, aviso del SAR, pie) se editan en <strong>Información legal</strong>.
        </p>

        {feedback ? (
          <div
            className={
              feedback.tone === "ok"
                ? "mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                : "mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800"
            }
            role="status"
          >
            {feedback.message}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6">
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="section-title">Facturación SAR</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl">CAI, rango autorizado y vigencia</h2>
                <p className="mt-3 text-slate-600">
                  Cada CAI que emite el SAR autoriza un rango de correlativos y una fecha límite. Solo una serie puede estar
                  activa por tipo de documento: es la que toma el número de las facturas nuevas.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setEditingSeries(null);
                  saveSeriesMutation.reset();
                  setSeriesModalOpen(true);
                }}
              >
                Registrar CAI
              </Button>
            </div>

            {activeSeries ? (
              <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Las facturas nuevas se emitirán como{" "}
                <span className="font-mono font-semibold text-slate-900">{activeSeries.nextNumber ?? "N/D"}</span> con el CAI{" "}
                <span className="font-mono">{activeSeries.cai}</span>.
              </div>
            ) : (
              <div className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
                No hay ninguna serie de factura activa. Sin ella el sistema no puede emitir facturas.
              </div>
            )}
          </Card>

          {seriesItems.length === 0 ? (
            <Card className="p-6 text-center text-slate-500">
              Todavía no hay series registradas para esta empresa.
            </Card>
          ) : null}

          {seriesItems.map((series) => (
            <SeriesCard
              key={series.id}
              series={series}
              busy={seriesStatusMutation.isPending}
              onEdit={() => {
                setEditingSeries(series);
                saveSeriesMutation.reset();
                setSeriesModalOpen(true);
              }}
              onToggle={() => seriesStatusMutation.mutate({ id: series.id, isActive: !series.isActive })}
            />
          ))}
        </div>

      <Modal
        open={seriesModalOpen}
        onClose={() => {
          setSeriesModalOpen(false);
          setEditingSeries(null);
          saveSeriesMutation.reset();
        }}
        title={editingSeries ? `Editar serie ${editingSeries.prefix}` : "Registrar CAI"}
      >
        <form
          className="grid gap-4"
          autoComplete="off"
          onSubmit={seriesForm.handleSubmit((values) => {
            saveSeriesMutation.mutate(values);
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="documentType">Tipo de documento</Label>
              <select
                id="documentType"
                className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
                {...seriesForm.register("documentType")}
              >
                <option value="FACTURA">Factura</option>
                <option value="NOTA_CREDITO">Nota de crédito</option>
                <option value="NOTA_DEBITO">Nota de débito</option>
                <option value="RECIBO">Recibo</option>
              </select>
            </div>
            <div>
              <Label required htmlFor="issueDeadline">Fecha límite de emisión</Label>
              <Input id="issueDeadline" type="date" {...seriesForm.register("issueDeadline")} />
              {seriesForm.formState.errors.issueDeadline ? (
                <p className="mt-2 text-sm text-rose-600">{seriesForm.formState.errors.issueDeadline.message}</p>
              ) : null}
            </div>
          </div>

          <div>
            <Label required htmlFor="cai">CAI</Label>
            <Input
              id="cai"
              placeholder="A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-4D"
              className="font-mono"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={37}
              {...seriesForm.register("cai")}
              onChange={(event) => {
                // Se descartan símbolos (el SAR solo usa letras y números): se avisa en vez de ignorarlos sin explicación.
                setCaiRejected(/[^0-9A-Za-z\s-]/.test(event.target.value));
                seriesForm.setValue("cai", maskCai(event.target.value), { shouldValidate: true });
              }}
            />
            {caiRejected ? (
              <p className="mt-2 text-sm text-amber-700" role="alert">
                El CAI solo lleva letras y números; los guiones se ponen solos.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate-500">32 letras y números en seis grupos, tal como lo entrega el SAR. Los guiones se ponen solos.</p>
            {seriesForm.formState.errors.cai ? (
              <p className="mt-2 text-sm text-rose-600">{seriesForm.formState.errors.cai.message}</p>
            ) : null}
          </div>

          <div>
            <Label required htmlFor="prefix">Prefijo</Label>
            <Input
              id="prefix"
              maxLength={10}
              placeholder="000-001-01"
              className="font-mono"
              autoComplete="off"
              {...seriesForm.register("prefix")}
              onChange={(event) => {
                seriesForm.setValue("prefix", maskPrefix(event.target.value), { shouldValidate: true });
              }}
            />
            <p className="mt-2 text-xs text-slate-500">Establecimiento-Punto de emisión-Tipo. No cambia entre facturas.</p>
            {seriesForm.formState.errors.prefix ? (
              <p className="mt-2 text-sm text-rose-600">{seriesForm.formState.errors.prefix.message}</p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label required htmlFor="rangeStart">Número inicial</Label>
              <Input
                id="rangeStart"
                inputMode="numeric"
                maxLength={8}
                placeholder="00000001"
                disabled={Boolean(editingSeries && editingSeries.issuedCount > 0)}
                {...seriesForm.register("rangeStart")}
                onChange={(event) => {
                  seriesForm.setValue("rangeStart", digitsOnly(event.target.value) as unknown as number, { shouldValidate: true });
                }}
              />
              {editingSeries && editingSeries.issuedCount > 0 ? (
                <p className="mt-2 text-xs text-slate-500">Bloqueado: la serie ya emitió facturas.</p>
              ) : null}
              {seriesForm.formState.errors.rangeStart ? (
                <p className="mt-2 text-sm text-rose-600">{seriesForm.formState.errors.rangeStart.message}</p>
              ) : null}
            </div>
            <div>
              <Label required htmlFor="rangeEnd">Número final</Label>
              <Input
                id="rangeEnd"
                inputMode="numeric"
                maxLength={8}
                placeholder="00001000"
                {...seriesForm.register("rangeEnd")}
                onChange={(event) => {
                  seriesForm.setValue("rangeEnd", digitsOnly(event.target.value) as unknown as number, { shouldValidate: true });
                }}
              />
              {seriesForm.formState.errors.rangeEnd ? (
                <p className="mt-2 text-sm text-rose-600">{seriesForm.formState.errors.rangeEnd.message}</p>
              ) : null}
            </div>
            <div>
              <Label required htmlFor="currentNumber">Próximo correlativo</Label>
              <input type="hidden" {...seriesForm.register("currentNumber")} />
              <Input
                id="currentNumber"
                readOnly
                className="bg-slate-50 font-mono text-slate-600"
                placeholder="000-001-01-00000001"
                value={nextCorrelativoDisplay}
              />
              {seriesForm.formState.errors.currentNumber ? (
                <p className="mt-2 text-sm text-rose-600">{seriesForm.formState.errors.currentNumber.message}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  {editingSeries ? "Próxima factura de la serie. No retrocede." : "Arranca en el número inicial."}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="resolutionNumber">Número de resolución (opcional)</Label>
              <Input id="resolutionNumber" placeholder="SAR-2026-000123" {...seriesForm.register("resolutionNumber")} />
              <p className="mt-2 text-xs text-slate-500">Resolución del SAR que autoriza el CAI. Se imprime en la factura.</p>
            </div>
            <div>
              <Label htmlFor="resolutionDate">Fecha de resolución (opcional)</Label>
              <Input id="resolutionDate" type="date" {...seriesForm.register("resolutionDate")} />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notas internas</Label>
            <Textarea id="notes" {...seriesForm.register("notes")} />
          </div>

          {!editingSeries ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              El CAI se registra como <strong>activo</strong> y reemplaza al CAI activo anterior de este tipo de documento.
            </p>
          ) : null}

          {saveSeriesMutation.isError ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {(saveSeriesMutation.error as Error).message}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setSeriesModalOpen(false);
                saveSeriesMutation.reset();
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saveSeriesMutation.isPending}>
              {saveSeriesMutation.isPending ? "Guardando..." : editingSeries ? "Actualizar serie" : "Registrar CAI"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
