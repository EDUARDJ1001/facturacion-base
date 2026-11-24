"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { companiesService } from "@/services/companies-service";

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN"];

const LOGO_MAX_BYTES = 800 * 1024;
const FOOTER_BRAND_MAX_BYTES = 300 * 1024;
const FOOTER_BRANDS_MAX = 8;
const DEFAULT_DOCUMENT_COLOR = "#416986";

/** Solo se pueden previsualizar/editar imágenes servibles directamente. */
function isPreviewable(value: string | null): value is string {
  return Boolean(value && (value.startsWith("data:") || /^https?:\/\//i.test(value)));
}

const companySchema = z.object({
  commercialName: z.string().min(1, "El nombre comercial es obligatorio.").max(150),
  legalName: z.string().min(1, "La razón social es obligatoria.").max(180),
  rtn: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^\d{14}$/.test(value), "El RTN debe tener 14 dígitos."),
  email: z.string().email("Correo inválido.").max(150).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  address: z.string().max(255).optional().or(z.literal("")),
  themeMode: z.enum(["light", "dark"])
});

type CompanyValues = z.infer<typeof companySchema>;

function fileToDataUri(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

/** Campo de imagen: guarda un data URI en estado y muestra la vista previa. */
function ImageField({
  id,
  label,
  hint,
  value,
  maxBytes,
  onChange,
  onError
}: {
  id: string;
  label: string;
  hint: string;
  value: string | null;
  maxBytes: number;
  onChange: (value: string | null) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      onError(`${label}: el archivo debe ser una imagen.`);
      return;
    }

    if (file.size > maxBytes) {
      onError(`${label} supera el tamaño máximo (${Math.round(maxBytes / 1024)} KB).`);
      return;
    }

    onChange(await fileToDataUri(file));
  }

  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-slate-50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">Sin imagen</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            Subir imagen
          </Button>
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Quitar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Imágenes del pie de los documentos carta (marcas que representa la empresa). */
function FooterBrandsField({
  value,
  onChange,
  onError
}: {
  value: string[];
  onChange: (value: string[]) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const next = [...value];

    for (const file of Array.from(files)) {
      if (next.length >= FOOTER_BRANDS_MAX) {
        onError(`Se permiten como máximo ${FOOTER_BRANDS_MAX} marcas.`);
        break;
      }

      if (!/^image\/(png|jpe?g)$/.test(file.type)) {
        onError(`${file.name}: la imagen debe ser PNG o JPG.`);
        continue;
      }

      if (file.size > FOOTER_BRAND_MAX_BYTES) {
        onError(`${file.name} supera el tamaño máximo (${Math.round(FOOTER_BRAND_MAX_BYTES / 1024)} KB).`);
        continue;
      }

      next.push(await fileToDataUri(file));
    }

    onChange(next);
  }

  function move(index: number, offset: number) {
    const target = index + offset;

    if (target < 0 || target >= value.length) {
      return;
    }

    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor="footerBrands">Marcas en el pie de página</Label>
        <p className="text-xs text-slate-500">
          Se muestran en una franja al final de facturas, proformas y cotizaciones, en este orden. Opcional, hasta{" "}
          {FOOTER_BRANDS_MAX} imágenes PNG o JPG de máx. 300 KB.
        </p>
      </div>
      {value.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {value.map((src, index) => (
            <div key={`${index}-${src.length}`} className="grid gap-2 rounded-2xl border border-border bg-white p-2">
              <div className="flex h-16 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Marca ${index + 1}`} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-1">
                <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Mover a la izquierda">
                  ‹
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((_, i) => i !== index))}>
                  Quitar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Mover a la derecha"
                >
                  ›
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-slate-500">Sin marcas en el pie.</p>
      )}
      <div>
        <input
          ref={inputRef}
          id="footerBrands"
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={value.length >= FOOTER_BRANDS_MAX}
          onClick={() => inputRef.current?.click()}
        >
          Agregar marcas
        </Button>
      </div>
    </div>
  );
}

export default function CompanyProfilePage() {
  const { user, reloadProfile } = useAuth();
  const { activeCompany } = useCompany();
  const toast = useToast();
  const [logo, setLogo] = useState<string | null>(null);
  // "dirty" = el admin cambió la imagen en esta pantalla. Si no, se conserva la
  // guardada (útil con logos legacy que son nombre de archivo, no data URI).
  const [logoDirty, setLogoDirty] = useState(false);
  const [documentColor, setDocumentColor] = useState<string>("");
  const [footerBrands, setFooterBrands] = useState<string[]>([]);
  const [footerBrandsDirty, setFooterBrandsDirty] = useState(false);

  const isAdmin = Boolean(user && ADMIN_ROLES.includes(user.role));

  const footerBrandsQuery = useQuery({
    queryKey: ["company-footer-brands", activeCompany?.id],
    queryFn: companiesService.activeFooterBrands,
    enabled: Boolean(activeCompany && isAdmin)
  });

  useEffect(() => {
    if (footerBrandsQuery.data && !footerBrandsDirty) {
      setFooterBrands(footerBrandsQuery.data.items);
    }
  }, [footerBrandsQuery.data, footerBrandsDirty]);

  const form = useForm<CompanyValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      commercialName: "",
      legalName: "",
      rtn: "",
      email: "",
      phone: "",
      address: "",
      themeMode: "light"
    }
  });

  useEffect(() => {
    if (!activeCompany) {
      return;
    }

    form.reset({
      commercialName: activeCompany.commercialName,
      legalName: activeCompany.legalName,
      rtn: activeCompany.rtn,
      email: activeCompany.email ?? "",
      phone: activeCompany.phone ?? "",
      address: activeCompany.address ?? "",
      themeMode: activeCompany.themeMode
    });
    setLogo(isPreviewable(activeCompany.logoUrl) ? activeCompany.logoUrl : null);
    setLogoDirty(false);
    setDocumentColor(activeCompany.documentColor ?? "");
  }, [activeCompany, form]);

  const mutation = useMutation({
    mutationFn: (values: CompanyValues) =>
      companiesService.updateActiveCompany({
        ...values,
        // Sin cambios -> se omite y el backend conserva la imagen actual.
        logo: logoDirty ? logo ?? "" : undefined,
        documentColor,
        footerBrands: footerBrandsDirty ? footerBrands : undefined
      }),
    onSuccess: async (response) => {
      setLogo(isPreviewable(response.item.logoUrl) ? response.item.logoUrl : null);
      setLogoDirty(false);
      setFooterBrandsDirty(false);
      void footerBrandsQuery.refetch();
      toast.success(response.message);
      // Refresca el perfil para que el menú lateral y el branding tomen los cambios.
      await reloadProfile();
    },
    onError: (error: Error) => toast.error(error.message)
  });

  if (!isAdmin) {
    return (
      <Card className="p-6 text-slate-600">
        No tienes permisos para editar los datos de la empresa. Solicítalo a un administrador.
      </Card>
    );
  }

  if (!activeCompany) {
    return <Spinner label="Cargando datos de la empresa..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <p className="section-title">Empresa</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Datos de la empresa activa</h1>
        <p className="mt-3 text-slate-600">
          Nombre, RTN, contacto y logo de <span className="font-semibold">{activeCompany.commercialName}</span>. Estos datos
          se imprimen en las facturas nuevas; las ya emitidas conservan su copia.
        </p>

      </Card>

      <Card className="p-4 sm:p-6">
        <form
          className="grid gap-5"
          onSubmit={form.handleSubmit(async (values) => {
            await mutation.mutateAsync(values);
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="commercialName">Nombre comercial</Label>
              <Input id="commercialName" {...form.register("commercialName")} />
              {form.formState.errors.commercialName ? (
                <p className="mt-2 text-sm text-rose-600">{form.formState.errors.commercialName.message}</p>
              ) : null}
            </div>
            <div>
              <Label required htmlFor="legalName">Razón social</Label>
              <Input id="legalName" {...form.register("legalName")} />
              {form.formState.errors.legalName ? (
                <p className="mt-2 text-sm text-rose-600">{form.formState.errors.legalName.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="rtn">RTN</Label>
              <Input id="rtn" inputMode="numeric" className="font-mono" {...form.register("rtn")} />
              {form.formState.errors.rtn ? (
                <p className="mt-2 text-sm text-rose-600">{form.formState.errors.rtn.message}</p>
              ) : null}
            </div>
            <div>
              <Label required htmlFor="themeMode">Tema</Label>
              <select
                id="themeMode"
                className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
                {...form.register("themeMode")}
              >
                <option value="light">Claro</option>
                <option value="dark">Oscuro</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="mt-2 text-sm text-rose-600">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>
          </div>

          <div>
            <Label htmlFor="address">Dirección</Label>
            <Textarea id="address" {...form.register("address")} />
          </div>

          <div className="grid gap-6 rounded-[24px] bg-slate-50 p-4">
            <ImageField
              id="logo"
              label="Logo"
              hint="Aparece en el menú, las facturas y el ticket. PNG o JPG, máx. 800 KB."
              value={logo}
              maxBytes={LOGO_MAX_BYTES}
              onChange={(next) => {
                setLogo(next);
                setLogoDirty(true);
              }}
              onError={(message) => toast.error(message)}
            />
          </div>

          <div className="grid gap-6 rounded-[24px] bg-slate-50 p-4">
            <div>
              <p className="font-semibold text-slate-900">Documentos</p>
              <p className="text-xs text-slate-500">Apariencia de facturas, proformas y cotizaciones en tamaño carta.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="documentColor">Color de los documentos</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="documentColor"
                  type="color"
                  className="h-11 w-16 cursor-pointer rounded-xl border border-border bg-white p-1"
                  value={documentColor || activeCompany.primaryColor || DEFAULT_DOCUMENT_COLOR}
                  onChange={(event) => setDocumentColor(event.target.value)}
                />
                {documentColor ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDocumentColor("")}>
                    Usar color de la empresa
                  </Button>
                ) : (
                  <span className="text-sm text-slate-500">Usa el color de la empresa.</span>
                )}
              </div>
            </div>
            <FooterBrandsField
              value={footerBrands}
              onChange={(next) => {
                setFooterBrands(next);
                setFooterBrandsDirty(true);
              }}
              onError={(message) => toast.error(message)}
            />
          </div>

          <div className="grid sm:flex sm:justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
