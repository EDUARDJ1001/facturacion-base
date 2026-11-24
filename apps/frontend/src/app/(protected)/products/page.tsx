"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, ImageIcon, Layers, PackageSearch, Pencil, Plus, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DeactivateButton, DeactivatedLink } from "@/components/ui/deactivation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { formatQuantity } from "@/lib/product-units";
import { formatCurrency } from "@/lib/utils";
import { productsService } from "@/services/products-service";
import type { Product } from "@/types/api";

import { ProductFormModal } from "./product-form";

export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  // La vista principal solo muestra activos; los desactivados están en Administración → Desactivados.
  const status = "active";
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status, type });
    if (search) value.set("search", search);
    if (category !== "all") value.set("categoryId", category);
    return value;
  }, [category, page, pageSize, search, status, type]);

  const productsQuery = useQuery({
    queryKey: ["products", params.toString()],
    queryFn: () => productsService.list(params)
  });

  const categoriesQuery = useQuery({
    queryKey: ["product-categories"],
    queryFn: () => productsService.listCategories(new URLSearchParams({ page: "1", pageSize: "100", status: "active" }))
  });

  const statusMutation = useMutation({
    mutationFn: ({ product, isActive }: { product: Product; isActive: boolean }) => productsService.updateStatus(product.id, isActive),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["products"] })
  });

  if (productsQuery.isLoading || categoriesQuery.isLoading) {
    return <Spinner label="Cargando catálogo de productos..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Productos</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Catálogo de productos y servicios</h1>
            <p className="mt-3 text-slate-600">
              Controla precios, impuestos, categorías y mínimos de stock por empresa.
              {typeof productsQuery.data?.pagination.total === "number" ? (
                <span className="ml-1 font-medium text-slate-700">{productsQuery.data.pagination.total} en total.</span>
              ) : null}
            </p>
          </div>
          <div className="grid gap-3 sm:flex sm:flex-wrap">
            {can("categories.view") ? (
              <Button type="button" variant="secondary" onClick={() => router.push("/categories")}>
                <Layers className="mr-2 h-4 w-4" />
                Categorías
              </Button>
            ) : null}
            {can("products.create") ? (
              <Button
                type="button"
                onClick={() => {
                  setEditingProduct(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nuevo producto
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_180px_180px_180px]">
          <Input
            placeholder="Buscar por nombre, código o barra"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="h-11 rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todas las categorías</option>
            {categoriesQuery.data?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="PRODUCTO">Productos</option>
            <option value="SERVICIO">Servicios</option>
          </select>
          <DeactivatedLink type="productos" />
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {productsQuery.data?.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-16">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <PackageSearch className="h-7 w-7" />
                    </span>
                    <p className="text-base font-semibold text-slate-700">Sin productos</p>
                    <p className="max-w-sm text-sm text-slate-500">
                      No hay productos que coincidan con la búsqueda o los filtros. Ajusta los filtros o crea un producto nuevo.
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}
            {productsQuery.data?.items.map((product) => {
              const lowStock = Boolean(product.controlsStock) && product.stockQuantity <= product.minStock;

              return (
                <tr key={product.id} className={product.isActive ? "" : "opacity-70"}>
                  <td data-label="Producto" className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-slate-50 text-slate-400 transition hover:border-brand/40 hover:ring-4 hover:ring-brand/10"
                        onClick={() => product.imageUrl && setPreviewProduct(product)}
                        disabled={!product.imageUrl}
                        aria-label={product.imageUrl ? `Ver imagen de ${product.name}` : `Sin imagen para ${product.name}`}
                      >
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{product.name}</p>
                        <p className="mt-0.5 flex items-center gap-2 font-mono text-xs text-slate-500">
                          {product.code}
                          {product.type === "SERVICIO" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-sans text-[11px] font-medium text-slate-600">Servicio</span> : null}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Categoría" className={`px-4 py-4 ${product.categoryName ? "text-slate-600" : "text-slate-400"}`}>{product.categoryName ?? "Sin categoría"}</td>
                  <td data-label="Precio" className="px-4 py-4 text-right font-semibold tabular-nums text-slate-900">
                    {formatCurrency(product.salePrice)}
                  </td>
                  <td data-label="Stock" className="px-4 py-4 text-right">
                    {product.type === "PRODUCTO" && product.controlsStock ? (
                      // En el mínimo o por debajo: el número en rojo (sin etiqueta).
                      <span className={`whitespace-nowrap font-semibold tabular-nums ${lowStock ? "text-rose-700" : "text-slate-800"}`} title={lowStock ? "En el mínimo o por debajo" : undefined}>
                        {formatQuantity(product.stockQuantity, product.unitMeasure)} <span className="text-xs font-normal text-slate-400">{product.unitMeasure}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">No aplica</span>
                    )}
                  </td>
                  <td data-label="Acciones" className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      {product.type === "PRODUCTO" && product.controlsStock && can("inventory.view") ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          title="Kardex del producto"
                          onClick={() => router.push(`/inventory/movements?productId=${product.id}`)}
                        >
                          <History className="mr-1 h-4 w-4" />
                          Kardex
                        </Button>
                      ) : null}
                      {can("products.edit") ? (
                        <>
                          {product.isActive ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => {
                                setEditingProduct(product);
                                setModalOpen(true);
                              }}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                          ) : null}
                          <DeactivateButton active={Boolean(product.isActive)} label={product.name} pending={statusMutation.isPending} onChange={(isActive) => statusMutation.mutate({ product, isActive })} />
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">Solo lectura</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </TableWrapper>

      <Pagination
        pagination={productsQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />

      <ProductFormModal
        open={modalOpen}
        product={editingProduct}
        onClose={() => {
          setModalOpen(false);
          setEditingProduct(null);
        }}
      />

      <Modal open={Boolean(previewProduct)} onClose={() => setPreviewProduct(null)} title={previewProduct?.name ?? "Imagen del producto"} className="max-w-2xl">
        {previewProduct?.imageUrl ? (
          <div className="grid gap-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewProduct.imageUrl} alt={previewProduct.name} className="max-h-[70vh] w-full object-contain" />
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setPreviewProduct(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
