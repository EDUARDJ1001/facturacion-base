"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Boxes, ChevronDown, Coins, ImageIcon, Plus } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";

import { integerInput, moneyInput, quantityInput } from "@/lib/number-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { hasAtMostTwoDecimals, isCountableUnit, MAX_QUANTITY, MAX_UNIT_COST, todayInHonduras } from "@/lib/inventory-rules";
import { movementIsIn, movementLabel, movementParty, movementReference } from "@/lib/kardex";
import { formatQuantity } from "@/lib/product-units";
import { formatCurrency, formatDate } from "@/lib/utils";
import { inventoryService } from "@/services/inventory-service";
import { productsService } from "@/services/products-service";
import { suppliersService } from "@/services/suppliers-service";
import { warehousesService } from "@/services/warehouses-service";
import type { Product, ProductStock } from "@/types/api";

const today = todayInHonduras();
const quantityFormatter = new Intl.NumberFormat("es-HN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const quantityField = z.coerce
  .number({ invalid_type_error: "Ingresa una cantidad válida." })
  .positive("La cantidad debe ser mayor que 0.")
  .max(MAX_QUANTITY, "La cantidad es demasiado alta.")
  .refine(hasAtMostTwoDecimals, "Máximo 2 decimales.");

const costField = z.coerce
  .number({ invalid_type_error: "Ingresa un costo válido." })
  .min(0, "El costo no puede ser negativo.")
  .max(MAX_UNIT_COST, "El costo es demasiado alto.")
  .refine(hasAtMostTwoDecimals, "Máximo 2 decimales.");

/** Unidades contables (UND, PCS, CAJA…) solo admiten cantidades enteras. */
function wholeQuantityIssue(product: Product | undefined, quantity: number) {
  return product && isCountableUnit(product.unitMeasure) && !Number.isInteger(quantity)
    ? `${product.name} se mide en ${product.unitMeasure}: usa un número entero.`
    : null;
}

function buildEntrySchema(productsById: Map<number, Product>) {
  return z
    .object({
      warehouseId: z.string().min(1, "Selecciona una bodega."),
      entryDate: z.string().min(1, "Selecciona la fecha.").refine((value) => value <= todayInHonduras(), "La fecha no puede ser futura."),
      supplierId: z.string().optional(),
      documentNumber: z.string().trim().max(80, "Máximo 80 caracteres.").optional(),
      notes: z.string().trim().max(2000, "Máximo 2000 caracteres.").optional(),
      items: z
        .array(
          z.object({
            productId: z.string().min(1, "Selecciona un producto."),
            quantity: quantityField,
            unitCost: costField.refine((value) => value > 0, "El costo debe ser mayor que 0.")
          })
        )
        .min(1, "Agrega al menos un producto.")
        .max(200, "Máximo 200 líneas por entrada.")
    })
    .superRefine((value, ctx) => {
      const seen = new Set<string>();
      value.items.forEach((item, index) => {
        if (item.productId && seen.has(item.productId)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Producto repetido: suma las cantidades en una sola línea.", path: ["items", index, "productId"] });
        }
        seen.add(item.productId);
        const issue = wholeQuantityIssue(productsById.get(Number(item.productId)), item.quantity);
        if (issue) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ["items", index, "quantity"] });
        }
      });
    });
}

function buildAdjustmentSchema(productsById: Map<number, Product>, currentStock: number | null) {
  return z
    .object({
      warehouseId: z.string().min(1, "Selecciona una bodega."),
      productId: z.string().min(1, "Selecciona un producto."),
      adjustmentType: z.enum(["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO", "STOCK_INICIAL"]),
      quantity: quantityField,
      unitCost: costField.optional(),
      notes: z.string().trim().min(5, "Describe el motivo (mínimo 5 caracteres).").max(255, "Máximo 255 caracteres.")
    })
    .superRefine((value, ctx) => {
      const issue = wholeQuantityIssue(productsById.get(Number(value.productId)), value.quantity);
      if (issue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ["quantity"] });
      }
      if (value.adjustmentType === "AJUSTE_NEGATIVO" && currentStock !== null && value.quantity > currentStock) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `No puedes sacar más de lo que hay (${quantityFormatter.format(currentStock)}).`,
          path: ["quantity"]
        });
      }
      if (value.adjustmentType === "STOCK_INICIAL" && !(Number(value.unitCost) > 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El stock inicial requiere un costo mayor que 0.", path: ["unitCost"] });
      }
    });
}

const entrySchema = buildEntrySchema(new Map());
const adjustmentSchema = buildAdjustmentSchema(new Map(), null);

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs text-rose-600">{message}</p> : null;
}

type EntryValues = z.infer<typeof entrySchema>;
type AdjustmentValues = z.infer<typeof adjustmentSchema>;
export type InventoryView = "stocks" | "entries" | "movements";

const VIEW_TEXT: Record<InventoryView, { title: string; description: string }> = {
  stocks: { title: "Existencias", description: "Stock actual por producto y bodega, con su costo." },
  entries: { title: "Entradas", description: "Compras y recepciones de mercadería por bodega." },
  movements: { title: "Movimientos", description: "Historial de entradas, ventas y ajustes por bodega." }
};

const emptyEntry: EntryValues = {
  warehouseId: "",
  entryDate: today,
  supplierId: "",
  documentNumber: "",
  notes: "",
  items: [{ productId: "", quantity: 1, unitCost: 0 }]
};

const emptyAdjustment: AdjustmentValues = {
  warehouseId: "",
  productId: "",
  adjustmentType: "AJUSTE_POSITIVO",
  quantity: 1,
  unitCost: 0,
  notes: ""
};

/** Inventario: Existencias, Entradas o Movimientos (cada una es su propia sección del menú). */
export function InventoryScreen({ view, productId: initialProductId = "" }: { view: InventoryView; productId?: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  // Movimientos de un solo producto = su kardex.
  const [productFilter, setProductFilter] = useState(initialProductId);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [pages, setPages] = useState<Record<InventoryView, number>>({ stocks: 1, entries: 1, movements: 1 });
  const [pageSizes, setPageSizes] = useState<Record<InventoryView, number>>({ stocks: 50, entries: 50, movements: 50 });
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  // Con "Todas las bodegas": producto desplegado para ver su existencia por bodega.
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [previewImage, setPreviewImage] = useState<{ name: string; url: string } | null>(null);
  const [failedImageProductIds, setFailedImageProductIds] = useState<Set<number>>(new Set());

  const stockParams = useMemo(() => {
    const value = new URLSearchParams({ page: String(pages.stocks), pageSize: String(pageSizes.stocks) });
    if (search) value.set("search", search);
    if (warehouseId) value.set("warehouseId", warehouseId);
    if (lowStockOnly) value.set("lowStock", "true");
    return value;
  }, [lowStockOnly, pageSizes.stocks, pages.stocks, search, warehouseId]);

  const entriesParams = useMemo(() => {
    const value = new URLSearchParams({ page: String(pages.entries), pageSize: String(pageSizes.entries) });
    if (warehouseId) value.set("warehouseId", warehouseId);
    return value;
  }, [pageSizes.entries, pages.entries, warehouseId]);

  const movementsParams = useMemo(() => {
    const value = new URLSearchParams({ page: String(pages.movements), pageSize: String(pageSizes.movements) });
    if (warehouseId) value.set("warehouseId", warehouseId);
    if (productFilter) value.set("productId", productFilter);
    return value;
  }, [pageSizes.movements, pages.movements, productFilter, warehouseId]);

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", "inventory"],
    queryFn: () => warehousesService.list(new URLSearchParams({ page: "1", pageSize: "100", status: "active" }))
  });

  const productsQuery = useQuery({
    queryKey: ["products", "inventory"],
    queryFn: () => productsService.list(new URLSearchParams({ page: "1", pageSize: "100", status: "active", type: "PRODUCTO" })),
    retry: false
  });

  const stocksQuery = useQuery({
    queryKey: ["inventory", "stocks", stockParams.toString()],
    queryFn: () => inventoryService.stocks(stockParams),
    enabled: view === "stocks"
  });

  const entriesQuery = useQuery({
    queryKey: ["inventory", "entries", entriesParams.toString()],
    queryFn: () => inventoryService.entries(entriesParams),
    enabled: view === "entries"
  });

  const movementsQuery = useQuery({
    queryKey: ["inventory", "movements", movementsParams.toString()],
    queryFn: () => inventoryService.movements(movementsParams),
    enabled: view === "movements"
  });

  // Reglas que dependen de datos (unidad del producto, existencia actual): se leen al validar.
  const productsByIdRef = useRef<Map<number, Product>>(new Map());
  const currentStockRef = useRef<number | null>(null);

  const entryResolver: Resolver<EntryValues> = (values, context, options) =>
    zodResolver(buildEntrySchema(productsByIdRef.current))(values, context, options);
  const adjustmentResolver: Resolver<AdjustmentValues> = (values, context, options) =>
    zodResolver(buildAdjustmentSchema(productsByIdRef.current, currentStockRef.current))(values, context, options);

  const entryForm = useForm<EntryValues>({
    resolver: entryResolver,
    defaultValues: emptyEntry
  });

  const adjustmentForm = useForm<AdjustmentValues>({
    resolver: adjustmentResolver,
    defaultValues: emptyAdjustment
  });

  const entryItems = useFieldArray({
    control: entryForm.control,
    name: "items"
  });

  const stockProducts = useMemo(() => productsQuery.data?.items.filter((product) => Boolean(product.controlsStock)) ?? [], [productsQuery.data?.items]);
  productsByIdRef.current = new Map(stockProducts.map((product) => [product.id, product]));

  // Existencia actual del producto en la bodega elegida en el ajuste.
  const adjustWarehouseId = adjustmentForm.watch("warehouseId");
  const adjustProductId = adjustmentForm.watch("productId");
  const adjustType = adjustmentForm.watch("adjustmentType");
  const adjustQuantity = Number(adjustmentForm.watch("quantity")) || 0;
  const adjustProduct = productsByIdRef.current.get(Number(adjustProductId));
  const currentStockQuery = useQuery({
    queryKey: ["inventory", "product-warehouses", adjustProductId],
    queryFn: () => inventoryService.productWarehouses(Number(adjustProductId)),
    enabled: adjustmentModalOpen && Boolean(adjustProductId),
    select: (data) => data.items.find((item) => item.warehouseId === Number(adjustWarehouseId))?.stockQuantity ?? 0
  });

  const breakdownQuery = useQuery({
    queryKey: ["inventory", "product-warehouses", String(expandedProductId)],
    queryFn: () => inventoryService.productWarehouses(expandedProductId as number),
    enabled: expandedProductId !== null && !warehouseId
  });
  currentStockRef.current = currentStockQuery.data ?? null;
  const resultingStock =
    currentStockQuery.data === undefined ? null : adjustType === "AJUSTE_NEGATIVO" ? currentStockQuery.data - adjustQuantity : currentStockQuery.data + adjustQuantity;
  const productImagesById = useMemo(() => {
    return new Map(productsQuery.data?.items.map((product) => [product.id, product.imageUrl] as const) ?? []);
  }, [productsQuery.data?.items]);
  const stockSummary = stocksQuery.data?.summary ?? { totalItems: 0, totalCost: 0 };

  const invalidateInventory = () => {
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const setViewPage = (targetView: InventoryView, page: number) => {
    setPages((currentPages) => ({ ...currentPages, [targetView]: page }));
  };

  const resetViewPage = (targetView: InventoryView) => {
    setViewPage(targetView, 1);
  };

  const resetAllPages = () => {
    setPages({ stocks: 1, entries: 1, movements: 1 });
  };

  const setViewPageSize = (targetView: InventoryView, pageSize: number) => {
    setPageSizes((currentPageSizes) => ({ ...currentPageSizes, [targetView]: pageSize }));
    setViewPage(targetView, 1);
  };

  const supplierOptionsQuery = useQuery({
    queryKey: ["inventory", "supplier-options"],
    queryFn: () => inventoryService.supplierOptions(),
    enabled: entryModalOpen
  });
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", rtn: "" });
  const createSupplierMutation = useMutation({
    mutationFn: () => suppliersService.create({ name: newSupplier.name.trim(), rtn: newSupplier.rtn.trim() }),
    onSuccess: async (response) => {
      await supplierOptionsQuery.refetch();
      entryForm.setValue("supplierId", String(response.item.id));
      setNewSupplier({ name: "", rtn: "" });
      setNewSupplierOpen(false);
      toast.success(`Proveedor ${response.item.name} agregado.`);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const entryMutation = useMutation({
    mutationFn: async (values: EntryValues) =>
      inventoryService.createEntry({
        warehouseId: Number(values.warehouseId),
        entryDate: values.entryDate,
        supplierId: values.supplierId ? Number(values.supplierId) : null,
        documentNumber: values.documentNumber,
        notes: values.notes,
        items: values.items.map((item) => ({
          productId: Number(item.productId),
          quantity: item.quantity,
          unitCost: item.unitCost
        }))
      }),
    onSuccess: () => {
      invalidateInventory();
      setEntryModalOpen(false);
      entryForm.reset(emptyEntry);
      toast.success("Entrada aplicada.");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const adjustmentMutation = useMutation({
    mutationFn: async (values: AdjustmentValues) =>
      inventoryService.createAdjustment({
        warehouseId: Number(values.warehouseId),
        productId: Number(values.productId),
        adjustmentType: values.adjustmentType,
        quantity: values.quantity,
        unitCost: values.unitCost,
        notes: values.notes
      }),
    onSuccess: () => {
      invalidateInventory();
      setAdjustmentModalOpen(false);
      adjustmentForm.reset(emptyAdjustment);
      toast.success("Ajuste aplicado.");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const openAdjustmentForStock = (stock: ProductStock, targetWarehouseId?: number) => {
    adjustmentForm.reset({
      warehouseId: targetWarehouseId ? String(targetWarehouseId) : stock.warehouseId ? String(stock.warehouseId) : warehouseId,
      productId: String(stock.productId),
      adjustmentType: "AJUSTE_POSITIVO",
      quantity: 1,
      unitCost: stock.costPrice,
      notes: ""
    });
    setAdjustmentModalOpen(true);
  };

  const productUnitById = new Map((productsQuery.data?.items ?? []).map((product) => [product.id, product.unitMeasure] as const));
  const selectedKardexProduct = productFilter ? productsQuery.data?.items.find((product) => String(product.id) === productFilter) ?? null : null;

  if (warehousesQuery.isLoading || productsQuery.isLoading || stocksQuery.isLoading) {
    return <Spinner label="Cargando inventario..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Inventario</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">{VIEW_TEXT[view].title}</h1>
            <p className="mt-3 text-slate-600">{VIEW_TEXT[view].description}</p>
          </div>
          <div className="grid gap-3 sm:flex sm:flex-wrap">
            {can("inventory.adjust") && view !== "entries" ? (
              <Button variant="secondary" type="button" onClick={() => setAdjustmentModalOpen(true)}>
                <ArrowDownUp className="mr-2 h-4 w-4" />
                Ajuste
              </Button>
            ) : null}
            {can("inventory.adjust") && view !== "movements" ? (
              <Button type="button" onClick={() => setEntryModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva entrada
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className={`mt-6 grid gap-4 ${view === "stocks" ? "md:grid-cols-[1fr_240px_180px]" : view === "movements" ? "md:grid-cols-[minmax(0,320px)_240px]" : "md:grid-cols-[240px]"}`}
        >
          {view === "movements" ? (
            <select
              className="h-11 rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none"
              value={productFilter}
              onChange={(event) => {
                setProductFilter(event.target.value);
                resetViewPage("movements");
              }}
            >
              <option value="">Todos los productos</option>
              {productsQuery.data?.items
                .filter((product) => Boolean(product.controlsStock) || String(product.id) === productFilter)
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.code})
                  </option>
                ))}
            </select>
          ) : null}
          {view === "stocks" ? (
            <Input
              placeholder="Buscar producto"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetViewPage("stocks");
              }}
            />
          ) : null}
          <select
            className="h-11 rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none"
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              resetAllPages();
            }}
          >
            <option value="">Todas las bodegas</option>
            {warehousesQuery.data?.items.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
          {view === "stocks" ? (
            <label className="flex h-11 items-center gap-3 rounded-2xl bg-slate-50 px-4 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(event) => {
                  setLowStockOnly(event.target.checked);
                  resetViewPage("stocks");
                }}
              />
              Bajo mínimo
            </label>
          ) : null}
        </div>
      </Card>

      {view === "stocks" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Boxes className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-500">Total de artículos en existencia</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{quantityFormatter.format(stockSummary.totalItems)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Coins className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-500">Costo total de existencia</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(stockSummary.totalCost)}</p>
                </div>
              </div>
            </Card>
          </div>
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Bodega</th>
                  <th className="px-4 py-3">Existencia</th>
                  <th className="px-4 py-3">Mínimo</th>
                  <th className="px-4 py-3">Costo</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </THead>
              <TBody>
                {stocksQuery.data?.items.map((stock) => {
                  const lowStock = stock.stockQuantity <= stock.minStock;
                  const stockImageUrl = stock.imageUrl ?? productImagesById.get(stock.productId) ?? null;
                  const shouldShowImage = Boolean(stockImageUrl) && !failedImageProductIds.has(stock.productId);

                  const expanded = !warehouseId && expandedProductId === stock.productId;

                  return (
                    <Fragment key={`${stock.productId}-${stock.warehouseId ?? "all"}`}>
                    <tr>
                      <td data-label="Producto" className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-slate-50 text-slate-400 transition hover:border-brand/40 hover:ring-4 hover:ring-brand/10"
                            onClick={() => stockImageUrl && setPreviewImage({ name: stock.productName, url: stockImageUrl })}
                            disabled={!stockImageUrl}
                            aria-label={stockImageUrl ? `Ver imagen de ${stock.productName}` : `Sin imagen para ${stock.productName}`}
                          >
                            {shouldShowImage && stockImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={stockImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={() => {
                                  setFailedImageProductIds((currentIds) => new Set(currentIds).add(stock.productId));
                                }}
                              />
                            ) : (
                              <ImageIcon className="h-5 w-5" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{stock.productName}</p>
                            <p className="text-sm text-slate-500">{stock.productCode} · {stock.categoryName ?? "Sin categoría"}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="Bodega" className="px-4 py-4 text-slate-600">{stock.warehouseName ?? "Todas"}</td>
                      <td data-label="Existencia" className="px-4 py-4">
                        <span className={lowStock ? "font-semibold text-rose-700" : "font-semibold text-slate-900"}>
                          {stock.stockQuantity.toFixed(2)} {stock.unitMeasure}
                        </span>
                      </td>
                      <td data-label="Mínimo" className="px-4 py-4 text-slate-600">{stock.minStock.toFixed(2)}</td>
                      <td data-label="Costo" className="px-4 py-4 text-slate-600">{formatCurrency(stock.costPrice)}</td>
                      <td data-label="Acciones" className="px-4 py-4 text-right">
                        {warehouseId ? (
                          <Button size="sm" variant="secondary" type="button" onClick={() => openAdjustmentForStock(stock)}>
                            Ajustar
                          </Button>
                        ) : (
                          // Total de todas las bodegas: se ajusta por bodega, no sobre el total.
                          <Button
                            size="sm"
                            variant={expanded ? "primary" : "secondary"}
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpandedProductId(expanded ? null : stock.productId)}
                          >
                            Por bodega
                            <ChevronDown className={`ml-1 h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="bg-slate-50/70">
                        <td colSpan={6} className="px-4 pb-4 pt-1">
                          {breakdownQuery.isLoading ? (
                            <p className="py-3 text-sm text-slate-500">Cargando bodegas...</p>
                          ) : (
                            <div className="grid gap-2">
                              {breakdownQuery.data?.items.map((item) => (
                                <div
                                  key={item.warehouseId}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5"
                                >
                                  <div className="text-sm">
                                    <span className="font-medium text-slate-800">{item.warehouseName}</span>
                                    {item.isDefault ? <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Predeterminada</span> : null}
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                                      {item.stockQuantity.toFixed(2)} {stock.unitMeasure}
                                    </span>
                                    {can("inventory.adjust") ? (
                                      <Button size="sm" variant="secondary" type="button" onClick={() => openAdjustmentForStock(stock, item.warehouseId)}>
                                        Ajustar
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
          <Pagination pagination={stocksQuery.data?.pagination} onPageChange={(page) => setViewPage("stocks", page)} onPageSizeChange={(pageSize) => setViewPageSize("stocks", pageSize)} />
        </>
      ) : null}

      {view === "entries" ? (
        <>
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Bodega</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Líneas</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                </tr>
              </THead>
              <TBody>
                {entriesQuery.data?.items.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Fecha" className="px-4 py-4 text-slate-600">{formatDate(entry.entryDate)}</td>
                    <td data-label="Bodega" className="px-4 py-4 font-medium text-slate-900">{entry.warehouseName}</td>
                    <td data-label="Proveedor" className="px-4 py-4 text-slate-600">{entry.supplierName ?? "Sin proveedor"}</td>
                    <td data-label="Documento" className="px-4 py-4 text-slate-600">{entry.documentNumber ?? `Entrada #${entry.id}`}</td>
                    <td data-label="Líneas" className="px-4 py-4 text-slate-600">{entry.itemCount}</td>
                    <td data-label="Costo" className="px-4 py-4 text-right font-semibold text-slate-900">{formatCurrency(entry.totalCost)}</td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
          <Pagination pagination={entriesQuery.data?.pagination} onPageChange={(page) => setViewPage("entries", page)} onPageSizeChange={(pageSize) => setViewPageSize("entries", pageSize)} />
        </>
      ) : null}

      {view === "movements" ? (
        <>
          {selectedKardexProduct ? (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">Kardex de</p>
                <p className="text-lg font-semibold text-slate-900">
                  {selectedKardexProduct.name} <span className="font-mono text-sm font-normal text-slate-500">{selectedKardexProduct.code}</span>
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-slate-500">Existencia</p>
                  <p className="font-semibold tabular-nums text-slate-900">
                    {formatQuantity(selectedKardexProduct.stockQuantity, selectedKardexProduct.unitMeasure)} {selectedKardexProduct.unitMeasure}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Costo actual</p>
                  <p className="font-semibold tabular-nums text-slate-900">{formatCurrency(selectedKardexProduct.costPrice)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Movimientos</p>
                  <p className="font-semibold tabular-nums text-slate-900">{movementsQuery.data?.pagination.total ?? 0}</p>
                </div>
              </div>
            </Card>
          ) : null}
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  {selectedKardexProduct ? null : <th className="px-4 py-3">Producto</th>}
                  <th className="px-4 py-3">Movimiento</th>
                  <th className="px-4 py-3">Bodega</th>
                  <th className="px-4 py-3 text-right">Entra</th>
                  <th className="px-4 py-3 text-right">Sale</th>
                  <th className="px-4 py-3 text-right">Queda</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3">Usuario</th>
                </tr>
              </THead>
              <TBody>
                {movementsQuery.data?.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                      Sin movimientos con estos filtros.
                    </td>
                  </tr>
                ) : null}
                {movementsQuery.data?.items.map((movement) => {
                  const unit = productUnitById.get(movement.productId) ?? "UND";
                  const isIn = movementIsIn(movement);
                  return (
                    <tr key={movement.id}>
                      <td data-label="Fecha" className="px-4 py-4 text-slate-600">
                        {new Date(movement.createdAt).toLocaleString("es-HN", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      {selectedKardexProduct ? null : (
                        <td data-label="Producto" className="px-4 py-4">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => {
                              setProductFilter(String(movement.productId));
                              resetViewPage("movements");
                            }}
                          >
                            <p className="font-semibold text-slate-900 hover:text-brand">{movement.productName}</p>
                            <p className="text-sm text-slate-500">{movement.productCode}</p>
                          </button>
                        </td>
                      )}
                      <td data-label="Movimiento" className="px-4 py-4">
                        <p className="font-medium text-slate-900">{movementLabel(movement.movementType)}</p>
                        <p className="text-sm text-slate-500">{movementReference(movement)}</p>
                        {movementParty(movement) ? <p className="text-sm text-slate-500">{movementParty(movement)}</p> : null}
                      </td>
                      <td data-label="Bodega" className="px-4 py-4 text-slate-600">{movement.warehouseName}</td>
                      <td data-label="Entra" className="px-4 py-4 text-right font-semibold tabular-nums text-emerald-700">
                        {isIn ? formatQuantity(movement.quantity, unit) : ""}
                      </td>
                      <td data-label="Sale" className="px-4 py-4 text-right font-semibold tabular-nums text-rose-600">
                        {isIn ? "" : formatQuantity(movement.quantity, unit)}
                      </td>
                      <td data-label="Queda" className="px-4 py-4 text-right tabular-nums text-slate-900">
                        {formatQuantity(movement.stockAfter, unit)}
                      </td>
                      <td data-label="Costo" className="px-4 py-4 text-right tabular-nums text-slate-600">
                        {movement.unitCost ? formatCurrency(movement.unitCost) : "N/D"}
                      </td>
                      <td data-label="Usuario" className="px-4 py-4 text-slate-600">{movement.createdByName}</td>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
          <Pagination pagination={movementsQuery.data?.pagination} onPageChange={(page) => setViewPage("movements", page)} onPageSizeChange={(pageSize) => setViewPageSize("movements", pageSize)} />
        </>
      ) : null}

      <Modal open={entryModalOpen} onClose={() => setEntryModalOpen(false)} title="Nueva entrada" className="max-w-4xl">
        <form className="grid gap-4" onSubmit={entryForm.handleSubmit((values) => entryMutation.mutate(values))}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="entryWarehouse">Bodega</Label>
              <select id="entryWarehouse" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...entryForm.register("warehouseId")}>
                <option value="">Selecciona</option>
                {warehousesQuery.data?.items.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <FieldError message={entryForm.formState.errors.warehouseId?.message} />
            </div>
            <div>
              <Label required htmlFor="entryDate">Fecha</Label>
              <Input id="entryDate" type="date" max={today} {...entryForm.register("entryDate")} />
              <FieldError message={entryForm.formState.errors.entryDate?.message} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="entrySupplier">Proveedor</Label>
                {can("suppliers.create") && !newSupplierOpen ? (
                  <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setNewSupplierOpen(true)}>
                    Nuevo proveedor
                  </button>
                ) : null}
              </div>
              {newSupplierOpen ? (
                <div className="grid gap-2 rounded-2xl border border-border bg-slate-50 p-3">
                  <Input placeholder="Nombre del proveedor" value={newSupplier.name} onChange={(event) => setNewSupplier((current) => ({ ...current, name: event.target.value }))} />
                  <Input placeholder="RTN (opcional)" inputMode="numeric" value={newSupplier.rtn} onChange={(event) => setNewSupplier((current) => ({ ...current, rtn: event.target.value }))} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNewSupplierOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={createSupplierMutation.isPending || newSupplier.name.trim().length < 2}
                      onClick={() => createSupplierMutation.mutate()}
                    >
                      {createSupplierMutation.isPending ? "Guardando..." : "Agregar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <select id="entrySupplier" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...entryForm.register("supplierId")}>
                  <option value="">Sin proveedor</option>
                  {supplierOptionsQuery.data?.items.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.rtn ? ` · RTN ${supplier.rtn}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label htmlFor="documentNumber">Documento</Label>
              <Input id="documentNumber" maxLength={80} {...entryForm.register("documentNumber")} />
              <FieldError message={entryForm.formState.errors.documentNumber?.message} />
            </div>
          </div>

          <div className="grid gap-3">
            {entryItems.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-[20px] bg-slate-50 p-4 lg:grid-cols-[2fr_1fr_1fr_auto] sm:rounded-[24px]">
                <div>
                  <Label required htmlFor={`items.${index}.productId`}>Producto</Label>
                  <select id={`items.${index}.productId`} className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...entryForm.register(`items.${index}.productId`)}>
                    <option value="">Selecciona</option>
                    {stockProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <FieldError message={entryForm.formState.errors.items?.[index]?.productId?.message} />
                </div>
                <div>
                  <Label required htmlFor={`items.${index}.quantity`}>Cantidad</Label>
                  <Input id={`items.${index}.quantity`} min="0" {...quantityInput(productUnitById.get(Number(entryForm.watch(`items.${index}.productId`))))} {...entryForm.register(`items.${index}.quantity`)} />
                  <FieldError message={entryForm.formState.errors.items?.[index]?.quantity?.message} />
                </div>
                <div>
                  <Label required htmlFor={`items.${index}.unitCost`}>Costo unitario</Label>
                  <Input id={`items.${index}.unitCost`} min="0" {...moneyInput} {...entryForm.register(`items.${index}.unitCost`)} />
                  <FieldError message={entryForm.formState.errors.items?.[index]?.unitCost?.message} />
                </div>
                <div className="flex items-end justify-end">
                  <Button type="button" variant="ghost" disabled={entryItems.fields.length === 1} onClick={() => entryItems.remove(index)}>
                    Quitar
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="secondary" onClick={() => entryItems.append({ productId: "", quantity: 1, unitCost: 0 })}>
            Agregar línea
          </Button>

          <div>
            <Label htmlFor="entryNotes">Notas</Label>
            <Textarea id="entryNotes" maxLength={2000} {...entryForm.register("notes")} />
            <FieldError message={entryForm.formState.errors.notes?.message} />
            <FieldError message={entryForm.formState.errors.items?.root?.message ?? entryForm.formState.errors.items?.message} />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setEntryModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={entryMutation.isPending}>
              {entryMutation.isPending ? "Aplicando..." : "Aplicar entrada"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(previewImage)} onClose={() => setPreviewImage(null)} title={previewImage?.name ?? "Imagen del producto"} className="max-w-2xl">
        {previewImage ? (
          <div className="grid gap-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewImage.url} alt={previewImage.name} className="max-h-[70vh] w-full object-contain" />
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setPreviewImage(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={adjustmentModalOpen} onClose={() => setAdjustmentModalOpen(false)} title="Ajuste de inventario">
        <form className="grid gap-4" onSubmit={adjustmentForm.handleSubmit((values) => adjustmentMutation.mutate(values))}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="adjustWarehouse">Bodega</Label>
              <select id="adjustWarehouse" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...adjustmentForm.register("warehouseId")}>
                <option value="">Selecciona</option>
                {warehousesQuery.data?.items.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <FieldError message={adjustmentForm.formState.errors.warehouseId?.message} />
            </div>
            <div>
              <Label required htmlFor="adjustProduct">Producto</Label>
              <select id="adjustProduct" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...adjustmentForm.register("productId")}>
                <option value="">Selecciona</option>
                {stockProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <FieldError message={adjustmentForm.formState.errors.productId?.message} />
            </div>
            <div>
              <Label required htmlFor="adjustmentType">Tipo</Label>
              <select id="adjustmentType" className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none" {...adjustmentForm.register("adjustmentType")}>
                <option value="AJUSTE_POSITIVO">Ajuste positivo</option>
                <option value="AJUSTE_NEGATIVO">Ajuste negativo</option>
                <option value="STOCK_INICIAL">Stock inicial</option>
              </select>
              {adjustType === "STOCK_INICIAL" ? (
                <p className="mt-1.5 text-xs text-slate-500">Solo para productos sin movimientos en esta bodega.</p>
              ) : null}
            </div>
            <div>
              <Label required htmlFor="adjustQuantity">Cantidad{adjustProduct ? ` (${adjustProduct.unitMeasure})` : ""}</Label>
              <Input id="adjustQuantity" min="0" {...quantityInput(adjustProduct?.unitMeasure)} {...adjustmentForm.register("quantity")} />
              <FieldError message={adjustmentForm.formState.errors.quantity?.message} />
            </div>
            <div>
              <Label required={adjustType === "STOCK_INICIAL"} htmlFor="adjustCost">Costo unitario</Label>
              <Input
                id="adjustCost"
                min="0"
                {...moneyInput}
                disabled={adjustType === "AJUSTE_NEGATIVO"}
                {...adjustmentForm.register("unitCost")}
              />
              {adjustType === "AJUSTE_NEGATIVO" ? <p className="mt-1.5 text-xs text-slate-500">Se usa el costo actual del producto.</p> : null}
              <FieldError message={adjustmentForm.formState.errors.unitCost?.message} />
            </div>
          </div>
          {adjustWarehouseId && adjustProductId ? (
            <div className="grid gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2">
              <p className="text-slate-500">
                Existencia actual:{" "}
                <span className="font-semibold text-slate-900">
                  {currentStockQuery.isLoading ? "…" : `${quantityFormatter.format(currentStockQuery.data ?? 0)} ${adjustProduct?.unitMeasure ?? ""}`}
                </span>
              </p>
              <p className="text-slate-500">
                Después del ajuste:{" "}
                <span className={`font-semibold ${resultingStock !== null && resultingStock < 0 ? "text-rose-600" : "text-slate-900"}`}>
                  {resultingStock === null ? "…" : `${quantityFormatter.format(resultingStock)} ${adjustProduct?.unitMeasure ?? ""}`}
                </span>
              </p>
            </div>
          ) : null}
          <div>
            <Label required htmlFor="adjustNotes">Motivo</Label>
            <Textarea id="adjustNotes" maxLength={255} placeholder="Ej.: conteo físico, producto dañado, merma" {...adjustmentForm.register("notes")} />
            <FieldError message={adjustmentForm.formState.errors.notes?.message} />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setAdjustmentModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={adjustmentMutation.isPending}>
              {adjustmentMutation.isPending ? "Aplicando..." : "Aplicar ajuste"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
