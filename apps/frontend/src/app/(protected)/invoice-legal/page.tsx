"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { integerInput, moneyInput, quantityInput } from "@/lib/number-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { settingsService } from "@/services/settings-service";

const legalSchema = z.object({
  defaultTaxRate: z.coerce.number().int("El ISV debe ser un número entero.").min(0, "El ISV no puede ser negativo.").max(100, "El ISV no puede superar 100%."),
  footerText: z.string().max(16000, "Máximo 16000 caracteres.").optional(),
  payableTo: z.string().max(180, "Máximo 180 caracteres.").optional(),
  invoiceTitle: z.string().min(2, "El título es obligatorio.").max(100, "Máximo 100 caracteres."),
  legendOriginal: z.string().min(1, "La leyenda del original es obligatoria.").max(120, "Máximo 120 caracteres."),
  legendCopy: z.string().min(1, "La leyenda de la copia es obligatoria.").max(120, "Máximo 120 caracteres."),
  sarNotice: z.string().min(1, "El aviso del SAR es obligatorio.").max(255, "Máximo 255 caracteres."),
  allowClientNameCorrection: z.boolean(),
  allowInvoiceDateReissue: z.boolean()
});

type LegalValues = z.infer<typeof legalSchema>;

export default function InvoiceLegalPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("settings.configure");
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  const settingsQuery = useQuery({ queryKey: ["settings", "billing"], queryFn: () => settingsService.getBilling() });

  const form = useForm<LegalValues>({
    resolver: zodResolver(legalSchema),
    defaultValues: {
      defaultTaxRate: 15,
      footerText: "",
      payableTo: "",
      invoiceTitle: "Factura",
      legendOriginal: "Original: Cliente",
      legendCopy: "Copia: Obligado Tributario",
      sarNotice: "La factura es beneficio de todos, ¡Exíjala!",
      allowClientNameCorrection: true,
      allowInvoiceDateReissue: true
    }
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }
    const item = settingsQuery.data.item;
    form.reset({
      defaultTaxRate: item.defaultTaxRate,
      footerText: item.footerText ?? "",
      payableTo: item.payableTo ?? "",
      invoiceTitle: item.invoiceTitle,
      legendOriginal: item.legendOriginal,
      legendCopy: item.legendCopy,
      sarNotice: item.sarNotice,
      allowClientNameCorrection: Boolean(item.allowClientNameCorrection),
      allowInvoiceDateReissue: Boolean(item.allowInvoiceDateReissue)
    });
  }, [form, settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (values: LegalValues) => settingsService.updateBilling(values),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      setFeedback({ tone: "ok", message: response.message });
    },
    onError: (error: Error) => setFeedback({ tone: "error", message: error.message })
  });

  if (settingsQuery.isLoading) {
    return <Spinner label="Cargando información legal..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <p className="section-title">Administración</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Información legal de la factura</h1>
        <p className="mt-3 text-slate-600">
          Textos y parámetros fiscales que se imprimen en la factura: título, leyendas obligatorias, aviso del SAR, pie e
          impuesto por defecto. La identidad de la empresa (razón social, RTN, dirección) se edita en <strong>Empresa</strong>, y el
          CAI/rango en <strong>Facturación SAR</strong>.
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
        {!canEdit ? (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Solo lectura: no tienes permiso para editar la configuración fiscal.</p>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-6">
        <form className="grid gap-5" onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="invoiceTitle">Título del documento</Label>
              <Input id="invoiceTitle" maxLength={100} {...form.register("invoiceTitle")} />
              {form.formState.errors.invoiceTitle ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.invoiceTitle.message}</p> : null}
            </div>
            <div>
              <Label required htmlFor="defaultTaxRate">ISV por defecto (%)</Label>
              <Input id="defaultTaxRate" {...integerInput} min={0} max={100} {...form.register("defaultTaxRate")} />
              {form.formState.errors.defaultTaxRate ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.defaultTaxRate.message}</p> : null}
            </div>
          </div>

          <div>
            <Label htmlFor="payableTo">Cheques a nombre de</Label>
            <Input id="payableTo" maxLength={180} {...form.register("payableTo")} />
            {form.formState.errors.payableTo ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.payableTo.message}</p> : null}
          </div>

          <div>
            <Label htmlFor="footerText">Pie de factura</Label>
            <Textarea
              id="footerText"
              rows={6}
              wrap="off"
              spellCheck={false}
              className="whitespace-pre font-mono text-sm"
              {...form.register("footerText")}
            />
            <p className="mt-2 text-xs text-slate-500">
              Puede ser una frase o un dibujo con caracteres en varias líneas. En el ticket de 80 mm caben 48 caracteres por línea.
            </p>
            {form.formState.errors.footerText ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.footerText.message}</p> : null}
          </div>

          <div className="grid gap-4 rounded-[24px] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Leyendas obligatorias del documento</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label required htmlFor="legendOriginal">Leyenda del original</Label>
                <Input id="legendOriginal" maxLength={120} {...form.register("legendOriginal")} />
                {form.formState.errors.legendOriginal ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.legendOriginal.message}</p> : null}
              </div>
              <div>
                <Label required htmlFor="legendCopy">Leyenda de la copia</Label>
                <Input id="legendCopy" maxLength={120} {...form.register("legendCopy")} />
                {form.formState.errors.legendCopy ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.legendCopy.message}</p> : null}
              </div>
            </div>
            <div>
              <Label required htmlFor="sarNotice">Aviso del SAR</Label>
              <Input id="sarNotice" maxLength={255} {...form.register("sarNotice")} />
              {form.formState.errors.sarNotice ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.sarNotice.message}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 rounded-[24px] bg-slate-50 p-4 text-sm text-slate-700">
            <label className="flex items-center gap-3">
              <input type="checkbox" {...form.register("allowClientNameCorrection")} />
              Permitir corrección de nombre del cliente
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" {...form.register("allowInvoiceDateReissue")} />
              Permitir reexpedición con nueva fecha
            </label>
          </div>

          <div className="grid sm:flex sm:justify-end">
            <Button type="submit" disabled={updateMutation.isPending || !canEdit}>
              {updateMutation.isPending ? "Guardando..." : "Guardar información legal"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
