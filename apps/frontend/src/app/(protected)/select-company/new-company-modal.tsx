"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { companiesService } from "@/services/companies-service";
import type { Company } from "@/types/api";

const schema = z.object({
  commercialName: z.string().trim().min(1, "Escribe el nombre comercial.").max(150),
  legalName: z.string().trim().min(1, "Escribe la razón social.").max(180),
  rtn: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^\d{14}$/.test(value), "El RTN debe tener 14 dígitos."),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(150).email("Correo inválido.").or(z.literal("")),
  address: z.string().trim().max(255),
  primaryColor: z.string()
});

type Values = z.input<typeof schema>;

const INCLUDED = [
  "Bodega principal",
  "Caja 1",
  "Cliente “Consumidor final”",
  "Numeración de proformas y cotizaciones",
  "Configuración de facturación con ISV 15%"
];

/** Nueva empresa (solo Super Administrador). */
export function NewCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (company: Company) => void }) {
  const toast = useToast();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { commercialName: "", legalName: "", rtn: "", phone: "", email: "", address: "", primaryColor: "#0F172A" }
  });
  const errors = form.formState.errors;

  const mutation = useMutation({
    mutationFn: (values: Values) => companiesService.createCompany(schema.parse(values)),
    onSuccess: (response) => {
      toast.success(response.message);
      form.reset();
      onCreated(response.item);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <Modal open={open} onClose={onClose} title="Nueva empresa" className="max-w-3xl">
      <form className="grid gap-5" onSubmit={form.handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined))}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label required htmlFor="commercialName">
              Nombre comercial
            </Label>
            <Input id="commercialName" autoFocus placeholder="Como la conocen tus clientes" {...form.register("commercialName")} />
            {errors.commercialName ? <p className="mt-1.5 text-sm text-rose-600">{errors.commercialName.message}</p> : null}
          </div>
          <div>
            <Label required htmlFor="legalName">
              Razón social
            </Label>
            <Input id="legalName" placeholder="Como aparece en el RTN" {...form.register("legalName")} />
            {errors.legalName ? <p className="mt-1.5 text-sm text-rose-600">{errors.legalName.message}</p> : null}
          </div>
          <div>
            <Label required htmlFor="rtn">
              RTN
            </Label>
            <Input id="rtn" inputMode="numeric" className="font-mono" placeholder="14 dígitos" {...form.register("rtn")} />
            {errors.rtn ? <p className="mt-1.5 text-sm text-rose-600">{errors.rtn.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" {...form.register("phone")} />
          </div>
          <div>
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {errors.email ? <p className="mt-1.5 text-sm text-rose-600">{errors.email.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="primaryColor">Color de la empresa</Label>
            <input id="primaryColor" type="color" className="h-11 w-full cursor-pointer rounded-2xl border border-border bg-white p-1" {...form.register("primaryColor")} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" {...form.register("address")} />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Se crea lista para empezar con:</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3">
            Después registra su <span className="font-semibold text-slate-900">CAI</span> en Facturación SAR para poder facturar, y el logo en Empresa.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creando..." : "Crear empresa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
