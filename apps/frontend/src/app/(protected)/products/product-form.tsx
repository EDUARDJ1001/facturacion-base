"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Barcode, Boxes, ChevronDown, History, ImageIcon, Info, Lock, Package, Plus, Upload, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

import { integerInput, moneyInput, quantityInput } from "@/lib/number-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useCompany } from "@/hooks/use-company";
import { hasAtMostTwoDecimals, isCountableUnit, MAX_QUANTITY, MAX_UNIT_COST } from "@/lib/inventory-rules";
import { movementIsIn, movementLabel } from "@/lib/kardex";
import { baseFromFinal, getPriceIncludesTax, setPriceIncludesTax, taxOf, totalWithTax } from "@/lib/pricing";
import { isServiceUnit } from "@/lib/inventory-rules";
import { formatQuantity, unitLabel, unitRule, unitsForType } from "@/lib/product-units";
import { cn, formatCurrency } from "@/lib/utils";
import { cloudinaryService } from "@/services/cloudinary-service";
import { inventoryService } from "@/services/inventory-service";
import { productsService } from "@/services/products-service";
import { warehousesService } from "@/services/warehouses-service";
import type { Product } from "@/types/api";

type TaxOption = "EXENTO" | "15" | "18";

function buildSchema(isEdit: boolean) {
  return z
    .object({
      type: z.enum(["PRODUCTO", "SERVICIO"]),
      name: z.string().trim().min(2, "Escribe el nombre (mínimo 2 letras).").max(180, "Máximo 180 caracteres."),
      categoryId: z.string(),
      unitMeasure: z.string().trim().min(1, "Elige la unidad de medida."),
      salePrice: z.coerce.number({ invalid_type_error: "Escribe el precio." }).min(0, "El precio no puede ser negativo.").max(MAX_UNIT_COST, "Precio demasiado alto."),
      tax: z.enum(["EXENTO", "15", "18"]),
      costPrice: z.coerce.number({ invalid_type_error: "Escribe el costo." }).min(0, "El costo no puede ser negativo.").max(MAX_UNIT_COST, "Costo demasiado alto."),
      controlsStock: z.boolean(),
      minStock: z.coerce.number({ invalid_type_error: "Escribe una cantidad." }).min(0, "No puede ser negativo.").max(MAX_QUANTITY, "Cantidad demasiado alta."),
      initialStock: z.coerce.number({ invalid_type_error: "Escribe una cantidad." }).min(0, "No puede ser negativo.").max(MAX_QUANTITY, "Cantidad demasiado alta."),
      initialWarehouseId: z.string(),
      model: z.string().max(60, "Máximo 60 caracteres."),
      codes: z.array(
        z.object({
          code: z.string().trim().min(1, "Escribe el código o quítalo.").max(60),
          codeType: z.enum(["BARRA", "MANUAL"])
        })
      ),
      description: z.string().max(255, "Máximo 255 caracteres.")
    })
    .superRefine((value, ctx) => {
      if (!hasAtMostTwoDecimals(value.salePrice)) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Máximo 2 decimales." });
      if (!hasAtMostTwoDecimals(value.costPrice)) ctx.addIssue({ code: "custom", path: ["costPrice"], message: "Máximo 2 decimales." });
      if (!hasAtMostTwoDecimals(value.minStock)) ctx.addIssue({ code: "custom", path: ["minStock"], message: "Máximo 2 decimales." });

      const tracksStock = value.type === "PRODUCTO" && value.controlsStock;
      const whole = isCountableUnit(value.unitMeasure);
      if (tracksStock && whole && !Number.isInteger(value.minStock)) {
        ctx.addIssue({ code: "custom", path: ["minStock"], message: "Se cuenta por piezas: usa un número entero." });
      }

      if (!isEdit && tracksStock && value.initialStock > 0) {
        if (!value.initialWarehouseId) ctx.addIssue({ code: "custom", path: ["initialWarehouseId"], message: "Elige la bodega donde está la mercadería." });
        if (!(value.costPrice > 0)) ctx.addIssue({ code: "custom", path: ["costPrice"], message: "Con existencia inicial, indica el costo de compra." });
        if (whole && !Number.isInteger(value.initialStock)) ctx.addIssue({ code: "custom", path: ["initialStock"], message: "Se cuenta por piezas: usa un número entero." });
        if (!hasAtMostTwoDecimals(value.initialStock)) ctx.addIssue({ code: "custom", path: ["initialStock"], message: "Máximo 2 decimales." });
      }

      const seen = new Set<string>();
      value.codes.forEach((entry, index) => {
        const key = entry.code.trim().toUpperCase();
        if (key && seen.has(key)) ctx.addIssue({ code: "custom", path: ["codes", index, "code"], message: "Código repetido." });
        seen.add(key);
      });
    });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY: FormValues = {
  type: "PRODUCTO",
  name: "",
  categoryId: "",
  unitMeasure: "UND",
  salePrice: 0,
  tax: "15",
  costPrice: 0,
  controlsStock: true,
  minStock: 0,
  initialStock: 0,
  initialWarehouseId: "",
  model: "",
  codes: [],
  description: ""
};

function taxOptionFrom(product: Product): TaxOption {
  if (!product.taxable || Number(product.taxRate) === 0) return "EXENTO";
  return Number(product.taxRate) === 18 ? "18" : "15";
}

const selectClass =
  "h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-brand/40 focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-sm text-rose-600">{message}</p> : null;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-slate-500">{children}</p>;
}

/** Valor fijo (campo bloqueado): se muestra como texto para que el formulario conserve su valor. */
function LockedValue({ children }: { children: React.ReactNode }) {
  return <div className="flex h-11 items-center rounded-2xl border border-border bg-slate-50 px-4 text-sm text-slate-600">{children}</div>;
}

function LockedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Package; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[rgb(226,232,240)] p-4">
      <div className="mb-3 flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/** Crear o editar un producto, con un resumen al lado de cómo quedará. */
export function ProductFormModal({ open, product, onClose }: { open: boolean; product: Product | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { activeCompany } = useCompany();
  const isEdit = Boolean(product);
  const [moreOpen, setMoreOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ name: string; url: string } | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  // El precio escrito incluye ISV: se guarda sin ISV (lo calcula el sistema).
  const [priceIncludesTax, setPriceIncludesTaxState] = useState(false);

  const schema = useMemo(() => buildSchema(isEdit), [isEdit]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) as Resolver<FormValues>, defaultValues: EMPTY });
  const codesArray = useFieldArray({ control: form.control, name: "codes" });
  const errors = form.formState.errors;

  const categoriesQuery = useQuery({
    queryKey: ["product-categories", "form"],
    queryFn: () => productsService.listCategories(new URLSearchParams({ page: "1", pageSize: "100", status: "active" })),
    enabled: open
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", "product-form"],
    queryFn: () => warehousesService.list(new URLSearchParams({ page: "1", pageSize: "100", status: "active" })),
    enabled: open
  });
  const nextCodeQuery = useQuery({
    queryKey: ["products", "next-code"],
    queryFn: () => productsService.nextCode(),
    enabled: open && !isEdit,
    retry: false
  });
  const stockQuery = useQuery({
    queryKey: ["inventory", "product-warehouses", product?.id],
    queryFn: () => inventoryService.productWarehouses(product!.id),
    enabled: open && Boolean(product && product.type === "PRODUCTO")
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory", "movements", "product", product?.id],
    queryFn: () => inventoryService.movements(new URLSearchParams({ productId: String(product!.id), page: "1", pageSize: "5" })),
    enabled: open && Boolean(product && product.type === "PRODUCTO")
  });

  // Con movimientos en el kardex: tipo, control de existencias, unidad y costo quedan fijos.
  const hasMovements = (movementsQuery.data?.pagination.total ?? 0) > 0;
  const costLocked = hasMovements && Number(product?.costPrice ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const includesTax = getPriceIncludesTax();
    setPriceIncludesTaxState(includesTax);
    setMoreOpen(false);
    setImageFile(null);
    if (!product) {
      form.reset(EMPTY);
      setImagePreview(null);
      setImageUrl("");
      return;
    }
    const codes = product.codes?.map((entry) => ({ code: entry.code, codeType: entry.codeType })) ?? [];
    form.reset({
      type: product.type,
      name: product.name,
      categoryId: product.categoryId ? String(product.categoryId) : "",
      unitMeasure: product.unitMeasure.toUpperCase(),
      salePrice: includesTax
        ? totalWithTax(Number(product.salePrice), taxOptionFrom(product) === "EXENTO" ? 0 : Number(taxOptionFrom(product)))
        : Number(product.salePrice),
      tax: taxOptionFrom(product),
      costPrice: Number(product.costPrice),
      controlsStock: Boolean(product.controlsStock),
      minStock: Number(product.minStock),
      initialStock: 0,
      initialWarehouseId: "",
      model: product.barcode ?? "",
      codes,
      description: product.description ?? ""
    });
    setImageUrl(product.imageUrl ?? "");
    setImagePreview(product.imageUrl ? { name: "Imagen actual", url: product.imageUrl } : null);
    setMoreOpen(Boolean(product.barcode || codes.length || product.description || product.imageUrl));
  }, [open, product, form]);

  // Bodega principal preseleccionada para la existencia inicial.
  useEffect(() => {
    if (!open || isEdit || form.getValues("initialWarehouseId")) return;
    const warehouses = warehousesQuery.data?.items ?? [];
    const preferred = warehouses.find((warehouse) => Boolean(warehouse.isDefault)) ?? warehouses[0];
    if (preferred) form.setValue("initialWarehouseId", String(preferred.id));
  }, [open, isEdit, form, warehousesQuery.data?.items]);

  useEffect(() => {
    return () => {
      if (imagePreview?.url.startsWith("blob:")) URL.revokeObjectURL(imagePreview.url);
    };
  }, [imagePreview]);

  const values = form.watch();
  const isService = values.type === "SERVICIO";
  const tracksStock = !isService && values.controlsStock;
  const typedPrice = Number(values.salePrice) || 0;
  const cost = Number(values.costPrice) || 0;
  const rate = values.tax === "EXENTO" ? 0 : Number(values.tax);
  const price = priceIncludesTax ? baseFromFinal(typedPrice, rate) : typedPrice;
  const isv = taxOf(price, rate);
  const finalPrice = totalWithTax(price, rate);
  const margin = price - cost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;
  const initialStock = Number(values.initialStock) || 0;
  const unit = values.unitMeasure || "UND";
  const warehouses = warehousesQuery.data?.items ?? [];
  const initialWarehouse = warehouses.find((warehouse) => String(warehouse.id) === values.initialWarehouseId);
  const code = product?.code ?? nextCodeQuery.data?.item.code ?? "";
  // Servicio: por servicio o tiempo. Producto: unidad, peso o medida. Una unidad guardada
  // fuera de la lista se muestra igual para no perderla al editar.
  const typeUnits = unitsForType(values.type);
  const unitOptions = typeUnits.some((item) => item.value === unit) ? typeUnits : [{ value: unit, label: unitLabel(unit) }, ...typeUnits];

  const warnings: string[] = [];
  if (price === 0) warnings.push("El precio de venta está en L 0.00.");
  if (cost > 0 && margin < 0) warnings.push("Se vendería por debajo del costo.");
  if (!isEdit && tracksStock && initialStock === 0) warnings.push("Sin existencia inicial: no se podrá facturar hasta registrar una entrada de mercadería.");
  if (!values.categoryId) warnings.push("Sin categoría: será más difícil encontrarlo en reportes y filtros.");

  const close = () => {
    if (imagePreview?.url.startsWith("blob:")) URL.revokeObjectURL(imagePreview.url);
    onClose();
  };

  const saveMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const uploadedImageUrl = imageFile
        ? await cloudinaryService.uploadProductImage({ file: imageFile, companyCode: activeCompany?.code ?? "empresa" })
        : imageUrl;
      const service = data.type === "SERVICIO";
      const withStock = !isEdit && !service && data.controlsStock && data.initialStock > 0;
      const payload = {
        code,
        name: data.name.trim(),
        type: data.type,
        categoryId: data.categoryId ? Number(data.categoryId) : null,
        unitMeasure: data.unitMeasure,
        salePrice: priceIncludesTax ? baseFromFinal(data.salePrice, data.tax === "EXENTO" ? 0 : Number(data.tax)) : data.salePrice,
        costPrice: data.costPrice,
        taxable: data.tax !== "EXENTO",
        taxRate: data.tax === "EXENTO" ? 0 : Number(data.tax),
        controlsStock: service ? false : data.controlsStock,
        minStock: service || !data.controlsStock ? 0 : data.minStock,
        barcode: data.model.trim() || null,
        codes: data.codes.map((entry) => ({ code: entry.code.trim(), codeType: entry.codeType })),
        description: data.description.trim() || null,
        imageUrl: uploadedImageUrl || null,
        isActive: product ? Boolean(product.isActive) : true
      };

      if (product) {
        return productsService.update(product.id, payload);
      }
      return productsService.create({
        ...payload,
        initialStock: withStock ? data.initialStock : 0,
        initialWarehouseId: withStock ? Number(data.initialWarehouseId) : null
      });
    },
    onSuccess: (response) => {
      toast.success(response.message);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      close();
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const setType = (type: FormValues["type"]) => {
    form.setValue("type", type, { shouldValidate: form.formState.isSubmitted });
    // La unidad sigue al tipo: servicio por servicio o tiempo; producto por unidad, peso o medida.
    const currentUnit = form.getValues("unitMeasure");
    if (type === "SERVICIO" && !isServiceUnit(currentUnit)) {
      form.setValue("unitMeasure", "SERV");
    }
    if (type === "PRODUCTO" && isServiceUnit(currentUnit)) {
      form.setValue("unitMeasure", "UND");
    }
  };

  return (
    <Modal open={open} onClose={close} title={isEdit ? "Editar producto" : "Nuevo producto"} className="max-w-6xl">
      <form
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
        onSubmit={form.handleSubmit((data) => saveMutation.mutateAsync(data).catch(() => undefined))}
      >
        <div className="grid content-start gap-5">
          {/* Qué es */}
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { value: "PRODUCTO", icon: Package, title: "Producto", text: "Mercadería física. Puede llevar existencias y kardex." },
                { value: "SERVICIO", icon: Wrench, title: "Servicio", text: "Mano de obra, instalación, asesoría. No lleva existencias." }
              ] as const
            ).map((option) => {
              const selected = values.type === option.value;
              const disabled = hasMovements && !selected;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setType(option.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
                    selected ? "border-brand bg-brand/5 ring-4 ring-brand/10" : "border-border bg-white hover:border-brand/40",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-brand text-white" : "bg-slate-100 text-slate-500")}>
                    <option.icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900">{option.title}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">{option.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {hasMovements ? <LockedNote>Tiene movimientos en el kardex: el tipo no se puede cambiar.</LockedNote> : null}

          {/* Datos básicos */}
          <Section icon={Package} title="Datos básicos">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label required htmlFor="name">
                  Nombre
                </Label>
                <Input id="name" autoFocus placeholder={isService ? "Ej.: Instalación de cámara" : "Ej.: Cable HDMI 2 m"} {...form.register("name")} />
                <FieldError message={errors.name?.message} />
                <Hint>Así aparece en la factura.</Hint>
              </div>
              <div>
                <Label htmlFor="categoryId">Categoría</Label>
                <select id="categoryId" className={selectClass} {...form.register("categoryId")}>
                  <option value="">Sin categoría</option>
                  {categoriesQuery.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label required htmlFor="unitMeasure">Se vende por</Label>
                {hasMovements ? (
                  <LockedValue>
                    {unitLabel(unit)} ({unit})
                  </LockedValue>
                ) : (
                  <select id="unitMeasure" className={selectClass} {...form.register("unitMeasure")}>
                    {unitOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label} ({item.value})
                      </option>
                    ))}
                  </select>
                )}
                {hasMovements ? <LockedNote>Tiene movimientos: la unidad no se puede cambiar.</LockedNote> : <Hint>{unitRule(unit)}.</Hint>}
              </div>
            </div>
          </Section>

          {/* Precio */}
          <Section icon={Barcode} title="Precio e impuesto">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label required htmlFor="salePrice">
                  {priceIncludesTax ? "Precio final (con ISV)" : "Precio de venta (sin ISV)"}
                </Label>
                <Input id="salePrice" min="0" {...moneyInput} {...form.register("salePrice")} />
                <FieldError message={errors.salePrice?.message} />
                {priceIncludesTax && rate ? (
                  <Hint>
                    Sin ISV: {formatCurrency(price)} por {unitLabel(unit).toLowerCase()}.
                    {Math.abs(finalPrice - typedPrice) >= 0.005 ? ` Por redondeo el cliente pagará ${formatCurrency(finalPrice)}.` : ""}
                  </Hint>
                ) : (
                  <Hint>Por {unitLabel(unit).toLowerCase()}.</Hint>
                )}
                <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={priceIncludesTax}
                    onChange={(event) => {
                      const next = event.target.checked;
                      // Mantiene el mismo precio: pasa de sin ISV a con ISV o al revés.
                      form.setValue("salePrice", next ? finalPrice : price, { shouldValidate: form.formState.isSubmitted });
                      setPriceIncludesTaxState(next);
                      setPriceIncludesTax(next);
                    }}
                  />
                  El precio incluye ISV
                </label>
              </div>
              <div>
                <Label required htmlFor="tax">Impuesto</Label>
                <select id="tax" className={selectClass} {...form.register("tax")}>
                  <option value="15">ISV 15%</option>
                  <option value="18">ISV 18%</option>
                  <option value="EXENTO">Exento</option>
                </select>
                <Hint>Cliente paga {formatCurrency(finalPrice)}.</Hint>
              </div>
              <div>
                <Label required={!isEdit && tracksStock && initialStock > 0} htmlFor="costPrice">
                  Costo de compra
                </Label>
                {costLocked ? (
                  <LockedValue>{formatCurrency(cost)}</LockedValue>
                ) : (
                  <Input id="costPrice" min="0" {...moneyInput} {...form.register("costPrice")} />
                )}
                <FieldError message={errors.costPrice?.message} />
                {costLocked ? (
                  <LockedNote>Se actualiza con cada entrada de mercadería.</LockedNote>
                ) : (
                  <Hint>{isService ? "Opcional: para calcular la ganancia." : "Por unidad, sin ISV."}</Hint>
                )}
              </div>
            </div>
          </Section>

          {/* Existencias */}
          {!isService ? (
            <Section icon={Boxes} title="Existencias">
              <label className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {hasMovements ? (
                  <Lock className="mt-1 h-4 w-4 shrink-0 text-amber-700" />
                ) : (
                  <input type="checkbox" className="mt-1" {...form.register("controlsStock")} />
                )}
                <span>
                  <span className="font-medium text-slate-900">Llevar control de existencias</span>
                  <span className="block text-slate-500">
                    Se descuenta al facturar, no deja vender sin existencia y cada movimiento queda en el kardex.
                  </span>
                </span>
              </label>
              {hasMovements ? <LockedNote>Tiene movimientos en el kardex: el control de existencias no se puede cambiar.</LockedNote> : null}

              {values.controlsStock ? (
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {!isEdit ? (
                    <>
                      <div>
                        <Label htmlFor="initialStock">Existencia inicial</Label>
                        <Input id="initialStock" min="0" {...quantityInput(unit)} {...form.register("initialStock")} />
                        <FieldError message={errors.initialStock?.message} />
                        <Hint>Lo que tienes hoy. Opcional.</Hint>
                      </div>
                      <div>
                        <Label required={initialStock > 0} htmlFor="initialWarehouseId">Bodega</Label>
                        <select id="initialWarehouseId" className={selectClass} {...form.register("initialWarehouseId")}>
                          <option value="">Elige la bodega</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name}
                            </option>
                          ))}
                        </select>
                        <FieldError message={errors.initialWarehouseId?.message} />
                      </div>
                    </>
                  ) : null}
                  <div>
                    <Label htmlFor="minStock">Avisar cuando queden</Label>
                    <Input id="minStock" min="0" {...quantityInput(unit)} {...form.register("minStock")} />
                    <FieldError message={errors.minStock?.message} />
                    <Hint>Existencia mínima. 0 = sin aviso.</Hint>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Se podrá facturar sin límite de existencia y no tendrá kardex.</p>
              )}
            </Section>
          ) : null}

          {/* Más opciones */}
          <div className="rounded-2xl border border-[rgb(226,232,240)]">
            <button type="button" onClick={() => setMoreOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Más opciones</span>
                <span className="mt-1 block text-sm text-slate-500">Códigos de barras, modelo, descripción e imagen. Todo opcional.</span>
              </span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-slate-400 transition", moreOpen && "rotate-180")} />
            </button>
            {moreOpen ? (
              <div className="grid gap-4 border-t border-[rgb(226,232,240)] p-4">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="flex items-center gap-1.5">
                      <Barcode className="h-4 w-4 text-slate-400" />
                      Códigos para escanear o buscar
                    </Label>
                    <Button type="button" variant="secondary" size="sm" onClick={() => codesArray.append({ code: "", codeType: "BARRA" })}>
                      <Plus className="mr-1 h-4 w-4" />
                      Agregar
                    </Button>
                  </div>
                  <Hint>Al facturar se puede escanear o escribir cualquiera de estos códigos.</Hint>
                  <div className="mt-2 grid gap-2">
                    {codesArray.fields.map((field, index) => (
                      <div key={field.id}>
                        <div className="flex items-center gap-2">
                          <Input placeholder="Código de barras o interno" className="flex-1 font-mono" {...form.register(`codes.${index}.code`)} />
                          <select className={cn(selectClass, "w-32")} {...form.register(`codes.${index}.codeType`)}>
                            <option value="BARRA">Barras</option>
                            <option value="MANUAL">Interno</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => codesArray.remove(index)}
                            className="p-1 text-slate-300 transition hover:text-rose-600"
                            aria-label={`Quitar código ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <FieldError message={errors.codes?.[index]?.code?.message} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="model">Modelo o referencia</Label>
                    <Input id="model" placeholder="Ej.: DS-2CD1043" {...form.register("model")} />
                    <FieldError message={errors.model?.message} />
                  </div>
                  <div>
                    <Label htmlFor="productImage">Imagen</Label>
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor="productImage"
                        className="flex h-11 flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-border bg-slate-50 px-4 text-sm text-slate-600 transition hover:border-brand/40 hover:bg-white"
                      >
                        <Upload className="h-4 w-4 text-brand" />
                        <span className="truncate">{imagePreview?.name ?? "Seleccionar imagen"}</span>
                        <input
                          id="productImage"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            setImagePreview((current) => {
                              if (current?.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
                              return { name: file.name, url: URL.createObjectURL(file) };
                            });
                            setImageFile(file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {imagePreview ? (
                        <button
                          type="button"
                          className="p-1 text-slate-400 hover:text-rose-600"
                          aria-label="Quitar imagen"
                          onClick={() => {
                            setImagePreview(null);
                            setImageFile(null);
                            setImageUrl("");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea id="description" rows={2} placeholder="Detalle interno opcional" {...form.register("description")} />
                  <FieldError message={errors.description?.message} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Resumen */}
        <aside className="grid content-start gap-4 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-2xl border border-[rgb(226,232,240)] bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white text-slate-300">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview.url} alt="" className="h-full w-full object-cover" />
                ) : isService ? (
                  <Wrench className="h-6 w-6" />
                ) : (
                  <ImageIcon className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{values.name?.trim() || (isService ? "Nuevo servicio" : "Nuevo producto")}</p>
                <p className="text-xs text-slate-500">
                  Código <span className="font-mono">{code || "se asigna al guardar"}</span> · {unitLabel(unit)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-1.5 text-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">En la factura</p>
              <div className="flex justify-between text-slate-600">
                <span>1 {unit} × precio sin ISV</span>
                <span className="tabular-nums">{formatCurrency(price)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{rate ? `ISV ${rate}%` : "Exento"}</span>
                <span className="tabular-nums">{formatCurrency(isv)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                <span>Cliente paga</span>
                <span className="tabular-nums">{formatCurrency(finalPrice)}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-1.5 text-sm">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Ganancia por {unitLabel(unit).toLowerCase()}</p>
              {cost > 0 ? (
                <div className={cn("flex justify-between font-semibold", margin < 0 ? "text-rose-600" : "text-emerald-700")}>
                  <span>{margin < 0 ? "Pérdida" : "Ganancia"}</span>
                  <span className="tabular-nums">
                    {formatCurrency(Math.abs(margin))} · {Math.abs(marginPct).toFixed(1)}%
                  </span>
                </div>
              ) : (
                <p className="text-slate-500">Indica el costo para calcularla.</p>
              )}
            </div>
          </div>

          {/* Kardex */}
          {tracksStock ? (
            <div className="rounded-2xl border border-[rgb(226,232,240)] p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <History className="h-4 w-4" />
                <p className="text-xs font-bold uppercase tracking-[0.14em]">Kardex</p>
              </div>
              {!isEdit ? (
                initialStock > 0 ? (
                  <div className="mt-3 text-sm text-slate-600">
                    <p>Primer movimiento al guardar:</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      Existencia inicial · {formatQuantity(initialStock, unit)} {unit}
                    </p>
                    <p>{initialWarehouse ? `En ${initialWarehouse.name}` : "Elige la bodega"}</p>
                    <p>
                      Costo {formatCurrency(cost)} c/u · Valor {formatCurrency(cost * initialStock)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Empezará en 0. Las entradas, ventas y ajustes quedarán registrados aquí.</p>
                )
              ) : (
                <div className="mt-3 grid gap-3 text-sm">
                  <div className="grid gap-1">
                    {(stockQuery.data?.items ?? []).map((row) => (
                      <div key={row.warehouseId} className="flex justify-between text-slate-600">
                        <span className="truncate">{row.warehouseName}</span>
                        <span className="font-semibold tabular-nums text-slate-900">
                          {formatQuantity(row.stockQuantity, unit)} {unit}
                        </span>
                      </div>
                    ))}
                  </div>
                  {movementsQuery.data?.items.length ? (
                    <div className="grid gap-1.5 border-t border-slate-200 pt-3">
                      <p className="text-xs text-slate-400">Últimos movimientos</p>
                      {movementsQuery.data.items.map((movement) => (
                        <div key={movement.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-slate-600">
                            {new Date(movement.createdAt).toLocaleDateString("es-HN")} · {movementLabel(movement.movementType)}
                          </span>
                          <span className={cn("shrink-0 font-semibold tabular-nums", movementIsIn(movement) ? "text-emerald-700" : "text-rose-600")}>
                            {formatQuantity(movement.quantity, unit)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500">Sin movimientos todavía.</p>
                  )}
                  <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/inventory/movements?productId=${product!.id}`)}>
                    Ver kardex completo
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="grid gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              {warnings.map((warning) => (
                <p key={warning} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {warning}
                </p>
              ))}
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Todo listo para guardar.
            </p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" type="button" className="flex-1" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (imageFile ? "Subiendo imagen..." : "Guardando...") : isEdit ? "Guardar cambios" : "Crear"}
            </Button>
          </div>
        </aside>
      </form>
    </Modal>
  );
}
