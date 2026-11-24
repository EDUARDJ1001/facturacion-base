"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Check, Package, Search, StickyNote, Trash2, UserPlus, UserRound, Warehouse } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { PrintSetupNotice } from "@/components/forms/print-setup-notice";
import { formatPhone, formatRtn } from "@/lib/masks";
import { integerInput, moneyInput, quantityInput } from "@/lib/number-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { amountToWords } from "@/lib/amount-to-words";
import { usePrintSetup } from "@/hooks/use-print-setup";
import { printLetter } from "@/lib/ticket-print";
import { isValidRtn, MAX_SALE_LINES, RTN_MESSAGE } from "@/lib/sale-rules";
import { cn, formatCurrency, todayInputValue } from "@/lib/utils";
import { clientsService } from "@/services/clients-service";
import { inventoryService } from "@/services/inventory-service";
import { productsService } from "@/services/products-service";
import { proformasService } from "@/services/proformas-service";
import { settingsService } from "@/services/settings-service";
import { warehousesService } from "@/services/warehouses-service";
import type { Product } from "@/types/api";

const itemSchema = z
  .object({
    productId: z.string().optional(),
    description: z.string().optional(),
    quantity: z.coerce
      .number({ invalid_type_error: "Ingresa una cantidad válida." })
      .positive("La cantidad debe ser mayor que 0.")
      .max(1000000, "La cantidad es demasiado alta."),
    unitPrice: z.coerce.number({ invalid_type_error: "Ingresa un precio válido." }).min(0, "El precio no puede ser negativo."),
    lineDiscount: z.coerce.number({ invalid_type_error: "Ingresa un descuento válido." }).min(0, "El descuento no puede ser negativo.")
  })
  .superRefine((value, ctx) => {
    if (!value.productId && !value.description?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona un producto o describe la línea.", path: ["description"] });
    }

    if (value.lineDiscount > value.quantity * value.unitPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El descuento no puede superar el importe de la línea.", path: ["lineDiscount"] });
    }
  });

const proformaSchema = z
  .object({
    useManualCustomer: z.boolean().default(false),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerRtn: z.string().optional(),
    customerPhone: z.string().optional(),
    customerAddress: z.string().optional(),
    warehouseId: z.string().optional(),
    proformaDate: z.string().min(1),
    validUntil: z.string().optional(),
    notes: z.string().optional(),
    items: z
      .array(itemSchema)
      .min(1, "Agrega al menos un producto.")
      .max(MAX_SALE_LINES, `Máximo ${MAX_SALE_LINES} líneas por proforma.`)
  })
  .superRefine((value, ctx) => {
    // La proforma sí requiere un cliente identificado (para el documento).
    if (!value.customerId && !value.customerName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona o ingresa el cliente de la proforma.", path: ["customerName"] });
    }

    const usesCatalogClient = Boolean(value.customerId) && !value.useManualCustomer;
    if (!usesCatalogClient && !isValidRtn(value.customerRtn)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: RTN_MESSAGE, path: ["customerRtn"] });
    }

    if (value.validUntil && value.validUntil < value.proformaDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La validez no puede ser anterior a la fecha.", path: ["validUntil"] });
    }
  });

type ProformaFormValues = z.infer<typeof proformaSchema>;

const today = todayInputValue();
const GRID = "lg:grid-cols-[52px_minmax(0,1fr)_150px_170px_150px_110px_190px_56px]";

/** Guarda un blob como archivo descargado. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function NewProformaPage() {
  const printSetup = usePrintSetup();
  const router = useRouter();
  const queryClient = useQueryClient();

  const clientsQuery = useQuery({
    queryKey: ["proforma-form", "clients"],
    queryFn: () => clientsService.list(new URLSearchParams({ page: "1", pageSize: "100", status: "active" }))
  });
  const settingsQuery = useQuery({ queryKey: ["proforma-form", "settings"], queryFn: () => settingsService.getBilling() });
  const productsQuery = useQuery({
    queryKey: ["proforma-form", "products"],
    queryFn: () => productsService.list(new URLSearchParams({ page: "1", pageSize: "100", status: "active", type: "all" }))
  });
  const warehousesQuery = useQuery({
    queryKey: ["proforma-form", "warehouses"],
    queryFn: () => warehousesService.list(new URLSearchParams({ page: "1", pageSize: "100", status: "active" }))
  });

  const form = useForm<ProformaFormValues>({
    resolver: zodResolver(proformaSchema),
    defaultValues: {
      useManualCustomer: false,
      customerId: "",
      customerName: "",
      customerRtn: "",
      customerPhone: "",
      customerAddress: "",
      warehouseId: "",
      proformaDate: today,
      validUntil: "",
      notes: "",
      items: []
    }
  });

  const itemsArray = useFieldArray({ control: form.control, name: "items" });

  const items = form.watch("items");
  const useManualCustomer = form.watch("useManualCustomer");
  const customerId = form.watch("customerId");
  const notes = form.watch("notes");
  const selectedWarehouseId = form.watch("warehouseId") ?? "";
  const taxRate = Number(settingsQuery.data?.item.defaultTaxRate ?? 15);
  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data?.items]);

  const stocksQuery = useQuery({
    queryKey: ["proforma-form", "stocks", selectedWarehouseId],
    queryFn: () => inventoryService.stocks(new URLSearchParams({ page: "1", pageSize: "100", warehouseId: selectedWarehouseId })),
    enabled: Boolean(selectedWarehouseId)
  });
  const stockByProductId = useMemo(
    () => new Map((stocksQuery.data?.items ?? []).map((stock) => [stock.productId, stock])),
    [stocksQuery.data?.items]
  );
  const hasWarehouseStock = Boolean(selectedWarehouseId && stocksQuery.data);
  const getAvailableStock = useCallback(
    (productId: number) => {
      const product = products.find((candidate) => candidate.id === productId);
      if (!product || !product.controlsStock) {
        return null;
      }
      return hasWarehouseStock ? stockByProductId.get(productId)?.stockQuantity ?? 0 : product.stockQuantity;
    },
    [products, hasWarehouseStock, stockByProductId]
  );

  useEffect(() => {
    const defaultWarehouse = warehousesQuery.data?.items.find((warehouse) => Boolean(warehouse.isDefault)) ?? warehousesQuery.data?.items[0];
    if (defaultWarehouse && !form.getValues("warehouseId")) {
      form.setValue("warehouseId", String(defaultWarehouse.id));
    }
  }, [form, warehousesQuery.data?.items]);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const product = item.productId ? products.find((candidate) => candidate.id === Number(item.productId)) : null;
        const lineTaxRate = product ? (product.taxable ? Number(product.taxRate) : 0) : taxRate;
        const gross = Number(item.quantity || 0) * Number(item.unitPrice || 0);
        const discount = Number(item.lineDiscount || 0);
        const base = Math.max(0, gross - discount);
        const tax = base * (lineTaxRate / 100);
        const is18 = lineTaxRate >= 18;
        const is15 = lineTaxRate > 0 && lineTaxRate < 18;
        return {
          subtotal: acc.subtotal + gross,
          discountTotal: acc.discountTotal + discount,
          taxableAmount15: acc.taxableAmount15 + (is15 ? base : 0),
          taxableAmount18: acc.taxableAmount18 + (is18 ? base : 0),
          exemptAmount: acc.exemptAmount + (lineTaxRate <= 0 ? base : 0),
          tax15: acc.tax15 + (is15 ? tax : 0),
          tax18: acc.tax18 + (is18 ? tax : 0),
          total: acc.total + base + tax
        };
      },
      { subtotal: 0, discountTotal: 0, taxableAmount15: 0, taxableAmount18: 0, exemptAmount: 0, tax15: 0, tax18: 0, total: 0 }
    );
  }, [items, products, taxRate]);

  const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const selectedClient = clientsQuery.data?.items.find((client) => String(client.id) === customerId);

  /* ---------------- Captura por escáner / búsqueda ---------------- */
  const captureRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const printAfterSaveRef = useRef(false);
  const [capture, setCapture] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [notesModal, setNotesModal] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [editLineIndex, setEditLineIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!customerOpen) {
      return;
    }
    const handler = (event: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(event.target as Node)) {
        setCustomerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [customerOpen]);

  const filteredClients = (clientsQuery.data?.items ?? []).filter((client) =>
    `${client.name} ${client.rtn ?? ""}`.toLowerCase().includes(clientSearch.trim().toLowerCase())
  );

  const matches = useMemo(() => {
    const term = capture.trim().toLowerCase();
    if (!term) {
      return [];
    }
    return products
      .filter((product) =>
        `${product.name} ${product.code} ${product.barcode ?? ""} ${(product.codes ?? []).map((entry) => entry.code).join(" ")}`
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 8);
  }, [capture, products]);

  const addProduct = useCallback(
    (product: Product) => {
      const line = {
        productId: String(product.id),
        description: product.name,
        quantity: 1,
        unitPrice: Number(product.salePrice),
        lineDiscount: 0
      };
      const emptyIndex = form.getValues("items").findIndex((item) => !item.productId && !item.description?.trim());
      if (emptyIndex >= 0) {
        itemsArray.update(emptyIndex, line);
      } else {
        itemsArray.append(line);
      }
      setCapture("");
      captureRef.current?.focus();
    },
    [form, itemsArray]
  );

  const commitCapture = () => {
    const term = capture.trim().toLowerCase();
    if (!term) {
      return;
    }
    const exact = products.find(
      (product) =>
        product.code.toLowerCase() === term ||
        (product.barcode ?? "").toLowerCase() === term ||
        (product.codes ?? []).some((entry) => entry.code.toLowerCase() === term)
    );
    const target = exact ?? matches[0];
    if (target) {
      addProduct(target);
    }
  };

  const createClientMutation = useMutation({
    mutationFn: () =>
      clientsService.create({
        name: form.getValues("customerName"),
        rtn: form.getValues("customerRtn"),
        phone: form.getValues("customerPhone"),
        address: form.getValues("customerAddress")
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["proforma-form", "clients"] });
      form.setValue("customerId", String(response.item.id));
      form.setValue("useManualCustomer", false);
      setClientSearch("");
      setCustomerOpen(false);
    }
  });

  const selectClient = (client: { id: number; name: string; rtn: string | null; phone: string | null; address: string | null }) => {
    form.setValue("customerId", String(client.id));
    form.setValue("useManualCustomer", false);
    form.setValue("customerName", client.name);
    form.setValue("customerRtn", client.rtn ?? "");
    form.setValue("customerPhone", client.phone ?? "");
    form.setValue("customerAddress", client.address ?? "");
    setClientSearch("");
    setCustomerOpen(false);
  };

  const markManualEdit = () => {
    if (!form.getValues("useManualCustomer")) {
      form.setValue("useManualCustomer", true);
    }
    if (form.getValues("customerId")) {
      form.setValue("customerId", "");
    }
  };

  const createMutation = useMutation({
    mutationFn: async (values: ProformaFormValues) => {
      const payload = {
        proformaDate: values.proformaDate,
        validUntil: values.validUntil || undefined,
        warehouseId: values.warehouseId ? Number(values.warehouseId) : undefined,
        notes: values.notes,
        items: values.items.map((item) => ({
          productId: item.productId ? Number(item.productId) : undefined,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineDiscount: item.lineDiscount
        })),
        ...(() => {
          const trimmedName = values.customerName?.trim();
          if (values.customerId && !values.useManualCustomer) {
            return { customerId: Number(values.customerId) };
          }
          return {
            customer: { name: trimmedName, rtn: values.customerRtn, phone: values.customerPhone, address: values.customerAddress }
          };
        })()
      };

      return proformasService.create(payload);
    },
    onSuccess: (response) => {
      const printAfter = printAfterSaveRef.current;
      const proformaId = response.item.id;
      const proformaNumber = response.item.proformaNumber;

      router.push(`/proformas/detail?id=${proformaId}`);

      if (!printAfter) {
        return;
      }

      void (async () => {
        try {
          const pdf = await proformasService.pdf(proformaId);
          const blob = await pdf.blob();
          saveBlob(blob, `proforma-${proformaNumber}.pdf`);
          // Impresora de carta de este equipo (programa de impresión).
          await printLetter(async () => blob);
        } catch {
          // La impresión/descarga es opcional; la proforma ya quedó guardada.
        }
      })();
    }
  });

  const onSubmit = form.handleSubmit((values) => {
    createMutation.mutate(values);
  });

  if (clientsQuery.isLoading || settingsQuery.isLoading || productsQuery.isLoading || warehousesQuery.isLoading) {
    return <Spinner label="Preparando proforma..." />;
  }

  const pill = "flex h-10 items-center gap-2 rounded-[14px] border border-[rgb(216,225,238)] bg-white px-3 text-sm text-slate-700";
  const hasLines = itemsArray.fields.length > 0;

  const customerNameField = form.register("customerName");
  const customerRtnField = form.register("customerRtn");
  const customerPhoneField = form.register("customerPhone");
  const customerAddressField = form.register("customerAddress");

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      {/* Barra de contexto */}
      <div className="flex flex-col gap-3 rounded-[20px] border border-[rgb(216,225,238)] bg-white/90 px-[18px] py-[14px] shadow-[0_10px_30px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 border-r border-[rgb(216,225,238)] pr-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Nueva proforma</span>
            <span className="text-sm font-semibold text-slate-500">Automático</span>
          </div>

          <label className={pill} title="Fecha en que se emite la proforma">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Emisión<span className="ml-0.5 text-rose-500">*</span></span>
            <input type="date" className="bg-transparent text-sm tabular-nums text-slate-700 outline-none" {...form.register("proformaDate")} />
          </label>

          <label className={pill} title="Fecha hasta la que la proforma es válida para el cliente">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Válida hasta</span>
            <input type="date" className="bg-transparent text-sm tabular-nums text-slate-700 outline-none" {...form.register("validUntil")} />
          </label>

          <label className={pill}>
            <Warehouse className="h-4 w-4 text-slate-400" />
            <select className="bg-transparent text-sm text-slate-700 outline-none" {...form.register("warehouseId")}>
              <option value="">Bodega</option>
              {warehousesQuery.data?.items.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <span className="flex h-10 items-center rounded-full bg-[rgb(241,245,249)] px-4 text-sm font-medium text-slate-600">ISV {taxRate}%</span>

          <button
            type="button"
            onClick={() => setNotesModal(true)}
            className="ml-auto flex h-10 items-center gap-2 rounded-[14px] px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <StickyNote className="h-4 w-4" />
            Observaciones{notes?.trim() ? " ·" : ""}
          </button>
        </div>

        {form.formState.errors.validUntil ? (
          <p className="text-sm text-rose-600">{form.formState.errors.validUntil.message}</p>
        ) : null}

        {/* Cliente: buscador type-to-search + datos editables */}
        <div className="grid gap-3 border-t border-[rgb(226,232,240)] pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[260px] flex-1" ref={customerRef}>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buscar cliente</label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Escribe el nombre o RTN del cliente"
                  value={clientSearch}
                  onChange={(event) => {
                    setClientSearch(event.target.value);
                    setCustomerOpen(true);
                  }}
                  onFocus={() => setCustomerOpen(true)}
                  autoComplete="off"
                />
              </div>
              {customerOpen && clientSearch.trim() ? (
                <div className="absolute left-0 top-[70px] z-40 max-h-64 w-full overflow-auto rounded-2xl border border-[rgb(216,225,238)] bg-white p-1 shadow-[0_22px_48px_rgba(15,23,42,0.16)]">
                  {filteredClients.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-500">Sin coincidencias. Escríbelo abajo para usarlo como cliente nuevo.</p>
                  ) : (
                    filteredClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => selectClient(client)}
                        className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">{client.name}</span>
                          <span className="block truncate text-xs text-slate-500">RTN: {client.rtn ?? "N/D"} · Tel: {client.phone ?? "N/D"}</span>
                        </span>
                        {String(client.id) === customerId ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Datos del cliente como labels editables */}
          <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_1.2fr_auto] md:items-end">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nombre o razón social<span className="ml-0.5 text-rose-500">*</span></label>
              <Input
                placeholder="Nombre del cliente"
                {...customerNameField}
                onChange={(event) => {
                  void customerNameField.onChange(event);
                  markManualEdit();
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">RTN</label>
              <Input
                placeholder="0801-0000-000000"
                className="font-mono"
                {...customerRtnField}
                onChange={(event) => {
                  event.target.value = formatRtn(event.target.value);
                  void customerRtnField.onChange(event);
                  markManualEdit();
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Teléfono</label>
              <Input
                placeholder="Opcional"
                {...customerPhoneField}
                onChange={(event) => {
                  event.target.value = formatPhone(event.target.value);
                  void customerPhoneField.onChange(event);
                  markManualEdit();
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dirección</label>
              <Input
                placeholder="Opcional"
                {...customerAddressField}
                onChange={(event) => {
                  void customerAddressField.onChange(event);
                  markManualEdit();
                }}
              />
            </div>
            {useManualCustomer && !customerId ? (
              <Button
                type="button"
                variant="secondary"
                className="h-11"
                disabled={createClientMutation.isPending || (form.watch("customerName")?.trim().length ?? 0) < 2}
                onClick={() => createClientMutation.mutate()}
              >
                <UserPlus className="mr-1 h-4 w-4" />
                {createClientMutation.isPending ? "Guardando..." : "Guardar en catálogo"}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-xs text-slate-500">
              {customerId
                ? `Cliente del catálogo${selectedClient ? `: ${selectedClient.name}` : ""}. Edita cualquier campo para usar datos solo en esta proforma.`
                : "Selecciona un cliente o escríbelo. Usa “Guardar en catálogo” para conservarlo."}
            </p>
            {form.formState.errors.customerName ? <p className="text-sm text-rose-600">{form.formState.errors.customerName.message}</p> : null}
            {form.formState.errors.customerRtn ? <p className="text-sm text-rose-600">{form.formState.errors.customerRtn.message}</p> : null}
            {createClientMutation.error ? <p className="text-sm text-rose-600">{(createClientMutation.error as Error).message}</p> : null}
          </div>
        </div>
      </div>

      {/* Captura */}
      <div className="flex items-stretch gap-3">
        <div className="relative flex h-[68px] flex-1 items-center gap-3 rounded-[20px] border-2 border-[rgb(15,23,42)] bg-white px-5 shadow-[0_14px_34px_rgba(15,23,42,0.1)]">
          <Search className="h-[26px] w-[26px] text-slate-500" />
          <div className="h-8 w-px bg-slate-200" />
          <input
            ref={captureRef}
            autoFocus
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitCapture();
              }
            }}
            placeholder="Escribe el nombre o código del producto para agregarlo"
            className="h-full flex-1 bg-transparent text-[19px] text-slate-900 outline-none placeholder:text-[17px] placeholder:text-slate-400"
            autoComplete="off"
          />

          {capture.trim() ? (
            <div className="absolute left-0 top-[72px] z-30 w-full overflow-hidden rounded-2xl border border-[rgb(216,225,238)] bg-white shadow-[0_22px_48px_rgba(15,23,42,0.16)]">
              {matches.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">Sin coincidencias.</p>
              ) : (
                matches.map((product, index) => {
                  const stock = getAvailableStock(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addProduct(product);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition",
                        index === 0 ? "bg-[rgb(15,23,42)] text-white" : "text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">{product.name}</span>
                        <span className={cn("block truncate font-mono text-xs", index === 0 ? "text-white/70" : "text-slate-500")}>
                          {product.code}
                          {product.controlsStock ? ` · disp. ${(stock ?? product.stockQuantity).toFixed(2)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(product.salePrice)}</span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Detalle + totales */}
      <div className="overflow-hidden rounded-[28px] border border-[rgb(216,225,238)] bg-white/95 shadow-[0_25px_60px_rgba(15,23,42,0.12)]">
        <div className="px-6 py-5">
          <h2 className="text-2xl font-semibold text-slate-900">Detalle de la proforma</h2>
          <p className="mt-1 text-sm text-slate-500">
            {itemsArray.fields.length} {itemsArray.fields.length === 1 ? "línea" : "líneas"} · {totalUnits.toFixed(2)} unidades
          </p>
        </div>

        {hasLines ? (
          <>
            <div
              className={cn(
                "hidden border-y border-[rgb(226,232,240)] bg-[rgb(248,250,252)] px-[14px] py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 lg:grid",
                GRID
              )}
            >
              <span className="text-center">#</span>
              <span>Producto / descripción</span>
              <span className="text-right">Cantidad</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Descuento</span>
              <span className="text-right">ISV</span>
              <span className="text-right">Importe</span>
              <span className="sr-only">Acción</span>
            </div>

            <div>
              {itemsArray.fields.map((field, index) => {
                const line = items[index];
                const product = line?.productId ? products.find((candidate) => candidate.id === Number(line.productId)) : null;
                const available = product ? getAvailableStock(product.id) : null;
                const quantity = Number(line?.quantity || 0);
                const lineTaxRate = product ? (product.taxable ? Number(product.taxRate) : 0) : taxRate;
                const lineAmount = Math.max(0, quantity * Number(line?.unitPrice || 0) - Number(line?.lineDiscount || 0));
                const exempt = lineTaxRate <= 0;
                const unitPrice = Number(line?.unitPrice || 0);
                const discount = Number(line?.lineDiscount || 0);
                const hasLineError = Boolean(form.formState.errors.items?.[index]);

                return (
                  <div
                    key={field.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditLineIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEditLineIndex(index);
                      }
                    }}
                    className={cn(
                      "grid cursor-pointer grid-cols-1 gap-2 border-b border-[rgb(241,245,249)] px-[14px] py-4 transition lg:gap-3",
                      GRID,
                      exempt ? "bg-[rgb(250,251,253)]" : "bg-white",
                      "hover:bg-[rgb(248,250,252)]",
                      hasLineError && "bg-[rgb(255,241,242)]"
                    )}
                  >
                    <span className="hidden text-center text-[15px] font-semibold tabular-nums text-slate-400 lg:block">{index + 1}</span>

                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-semibold text-slate-900">
                        {line?.description?.trim() || product?.name || "Línea sin descripción"}
                      </p>
                      {product ? (
                        <p className="mt-0.5 font-mono text-xs text-slate-500">
                          {product.code} · {product.unitMeasure}
                          {product.controlsStock ? ` · disp. ${(available ?? product.stockQuantity).toFixed(2)}` : ""}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-slate-400">Línea manual</p>
                      )}
                      {hasLineError ? <p className="mt-0.5 text-xs text-[rgb(190,18,60)]">Revisa esta línea (toca para editar).</p> : null}
                    </div>

                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">Cantidad</span>
                      <span className="text-right text-[17px] tabular-nums text-slate-900">{quantity}</span>
                    </div>
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">Precio</span>
                      <span className="text-right text-[17px] tabular-nums text-slate-900">{formatCurrency(unitPrice)}</span>
                    </div>
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">Descuento</span>
                      <span className={cn("text-right text-[17px] tabular-nums", discount === 0 ? "text-slate-400" : "text-slate-900")}>
                        {formatCurrency(discount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">ISV</span>
                      <span className="text-right text-sm tabular-nums text-slate-500">{lineTaxRate}%</span>
                    </div>
                    <div className="flex items-center justify-between lg:justify-end">
                      <span className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">Importe</span>
                      <span className="text-right text-[17px] font-semibold tabular-nums text-slate-900">{formatCurrency(lineAmount)}</span>
                    </div>
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        aria-label={`Eliminar línea ${index + 1}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          itemsArray.remove(index);
                        }}
                        className="text-slate-300 transition hover:text-[rgb(190,18,60)]"
                      >
                        <Trash2 className="h-[17px] w-[17px]" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 border-y border-[rgb(226,232,240)] bg-[rgb(250,251,253)] px-6 py-16 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm">
              <Package className="h-7 w-7" />
            </span>
            <p className="text-lg font-semibold text-slate-700">Aún no hay productos</p>
            <p className="max-w-sm text-sm text-slate-500">Busca por nombre o código en el campo de arriba y elige un producto para agregarlo.</p>
          </div>
        )}

        {/* Pie de totales */}
        <div className="flex flex-col gap-6 border-t border-[rgb(226,232,240)] bg-[rgb(248,250,252)] px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-x-9 gap-y-3">
            {(
              [
                ["Subtotal", totals.subtotal, "text-slate-900"],
                ["Descuentos", totals.discountTotal, "text-[rgb(190,18,60)]"],
                ["Gravado 15%", totals.taxableAmount15, "text-slate-900"],
                ...(totals.taxableAmount18 > 0 ? [["Gravado 18%", totals.taxableAmount18, "text-slate-900"]] : []),
                ["Exento", totals.exemptAmount, "text-slate-500"],
                ["ISV 15%", totals.tax15, "text-slate-900"],
                ...(totals.tax18 > 0 ? [["ISV 18%", totals.tax18, "text-slate-900"]] : [])
              ] as Array<[string, number, string]>
            ).map(([label, value, color]) => (
              <div key={label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className={cn("text-lg font-semibold tabular-nums", color)}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-start gap-4 lg:items-end">
            <div className="lg:text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total</p>
              <p className="text-[34px] font-bold leading-none tabular-nums text-slate-900">{formatCurrency(totals.total)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant="secondary"
                onClick={() => {
                  printAfterSaveRef.current = false;
                }}
                disabled={createMutation.isPending || createMutation.isSuccess || !hasLines}
                className="h-[54px] rounded-[16px] px-5 text-base"
              >
                {createMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
              {printSetup.letter ? (
                <Button
                  type="submit"
                  onClick={() => {
                    printAfterSaveRef.current = true;
                  }}
                  disabled={createMutation.isPending || createMutation.isSuccess || !hasLines}
                  className="h-[54px] rounded-[16px] px-7 text-base"
                >
                  {createMutation.isPending ? "Guardando..." : "Guardar e imprimir"}
                </Button>
              ) : (
                <PrintSetupNotice kinds={["letter"]} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-slate-500">
          <span className="font-semibold text-slate-600">Total en letras:</span> {amountToWords(totals.total)}
        </p>
        <button type="button" onClick={() => router.push("/proformas")} className="text-xs text-slate-400 transition hover:text-slate-600">
          Cancelar
        </button>
      </div>

      {createMutation.error ? (
        <p className="rounded-[16px] bg-[rgb(255,241,242)] px-4 py-3 text-sm font-medium text-[rgb(190,18,60)]" role="alert">
          {createMutation.error.message}
        </p>
      ) : null}
      {form.formState.errors.items?.message ? (
        <p className="rounded-[16px] bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert">
          {form.formState.errors.items.message}
        </p>
      ) : null}

      {/* Modal observaciones */}
      <Modal open={notesModal} onClose={() => setNotesModal(false)} title="Observaciones">
        <div className="grid gap-4">
          <Textarea rows={5} placeholder="Nota de la proforma" {...form.register("notes")} />
          <div className="flex justify-end">
            <Button type="button" onClick={() => setNotesModal(false)}>
              Listo
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal editar línea */}
      <Modal
        open={editLineIndex !== null}
        onClose={() => setEditLineIndex(null)}
        title={
          editLineIndex !== null
            ? items[editLineIndex]?.description?.trim() ||
              products.find((candidate) => candidate.id === Number(items[editLineIndex]?.productId))?.name ||
              "Editar línea"
            : "Editar línea"
        }
      >
        {editLineIndex !== null
          ? (() => {
              const idx = editLineIndex;
              const line = items[idx];
              const product = line?.productId ? products.find((candidate) => candidate.id === Number(line.productId)) : null;
              const qty = Number(line?.quantity || 0);
              const unit = Number(line?.unitPrice || 0);
              const disc = Number(line?.lineDiscount || 0);
              const rate = product ? (product.taxable ? Number(product.taxRate) : 0) : taxRate;
              const amount = Math.max(0, qty * unit - disc);
              const available = product ? getAvailableStock(product.id) : null;
              const errors = form.formState.errors.items?.[idx];

              return (
                <div className="grid gap-4">
                  {product ? (
                    <p className="font-mono text-xs text-slate-500">
                      {product.code} · {product.unitMeasure}
                      {product.controlsStock ? ` · disponible ${(available ?? product.stockQuantity).toFixed(2)}` : ""}
                    </p>
                  ) : null}

                  <div>
                    <Label htmlFor="edit-description">Descripción</Label>
                    <Input
                      id="edit-description"
                      placeholder={product ? product.name : "Descripción de la línea"}
                      {...form.register(`items.${idx}.description`)}
                    />
                    {errors?.description ? <p className="mt-1 text-sm text-rose-600">{errors.description.message}</p> : null}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label required htmlFor="edit-quantity">Cantidad</Label>
                      <Input id="edit-quantity" min="0" {...quantityInput(product?.unitMeasure)} {...form.register(`items.${idx}.quantity`)} />
                      {errors?.quantity ? <p className="mt-1 text-sm text-rose-600">{errors.quantity.message}</p> : null}
                    </div>
                    <div>
                      <Label required htmlFor="edit-price">Precio (L)</Label>
                      <Input id="edit-price" min="0" {...moneyInput} {...form.register(`items.${idx}.unitPrice`)} />
                      {errors?.unitPrice ? <p className="mt-1 text-sm text-rose-600">{errors.unitPrice.message}</p> : null}
                    </div>
                    <div>
                      <Label htmlFor="edit-discount">Descuento (L)</Label>
                      <Input id="edit-discount" min="0" {...moneyInput} {...form.register(`items.${idx}.lineDiscount`)} />
                      {errors?.lineDiscount ? <p className="mt-1 text-sm text-rose-600">{errors.lineDiscount.message}</p> : null}
                    </div>
                    <div>
                      <Label htmlFor="edit-isv">ISV</Label>
                      <Input id="edit-isv" value={`${rate}%`} readOnly disabled />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="text-sm text-slate-600">Importe de la línea</span>
                    <span className="text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(amount)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-rose-600"
                      onClick={() => {
                        itemsArray.remove(idx);
                        setEditLineIndex(null);
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Quitar producto
                    </Button>
                    <Button type="button" onClick={() => setEditLineIndex(null)}>
                      Listo
                    </Button>
                  </div>
                </div>
              );
            })()
          : null}
      </Modal>
    </form>
  );
}
