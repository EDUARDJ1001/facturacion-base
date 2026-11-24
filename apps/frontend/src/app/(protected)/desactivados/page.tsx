"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, ArrowLeft, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DEACTIVATED_TYPES, useCanManageDeactivated, type DeactivatedType } from "@/components/ui/deactivation";
import { Input } from "@/components/ui/input";
import { Pagination as PaginationControls } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatDate } from "@/lib/utils";
import { cajaService } from "@/services/caja-service";
import { clientsService } from "@/services/clients-service";
import { productsService } from "@/services/products-service";
import { suppliersService } from "@/services/suppliers-service";
import { usersService } from "@/services/users-service";
import { warehousesService } from "@/services/warehouses-service";
import type { Pagination } from "@/types/api";

interface DeactivatedItem {
  id: number;
  title: string;
  detail: string;
  updatedAt: string | null;
}

interface PageQuery {
  search: string;
  page: number;
  pageSize: number;
}

interface PageResult {
  items: DeactivatedItem[];
  pagination: Pagination;
}

/** Convierte una página del servidor al formato de esta vista. */
function mapPage<T>(result: { items: T[]; pagination: Pagination }, toItem: (item: T) => DeactivatedItem): PageResult {
  return { items: result.items.map(toItem), pagination: result.pagination };
}

function inactiveParams(query: PageQuery, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), status: "inactive", ...extra });
  if (query.search) params.set("search", query.search);
  return params;
}

/** Cómo leer y restaurar cada tipo de registro. */
const SOURCES: Record<DeactivatedType, { load: (query: PageQuery) => Promise<PageResult>; restore: (id: number) => Promise<unknown> }> = {
  productos: {
    load: async (query) =>
      mapPage(await productsService.list(inactiveParams(query, { type: "all" })), (item) => ({
        id: item.id,
        title: item.name,
        detail: `Código ${item.code}${item.type === "SERVICIO" ? " · Servicio" : ""}`,
        updatedAt: item.updatedAt
      })),
    restore: (id) => productsService.updateStatus(id, true)
  },
  categorias: {
    load: async (query) =>
      mapPage(await productsService.listCategories(inactiveParams(query)), (item) => ({ id: item.id, title: item.name, detail: "Categoría de productos", updatedAt: item.updatedAt })),
    restore: (id) => productsService.updateCategoryStatus(id, true)
  },
  clientes: {
    load: async (query) =>
      mapPage(await clientsService.list(inactiveParams(query)), (item) => ({
        id: item.id,
        title: item.name,
        detail: item.rtn ? `RTN ${item.rtn}` : item.code ? `Código ${item.code}` : "Sin RTN",
        updatedAt: item.updatedAt
      })),
    restore: (id) => clientsService.updateStatus(id, true)
  },
  proveedores: {
    load: async (query) =>
      mapPage(await suppliersService.list(inactiveParams(query)), (item) => ({
        id: item.id,
        title: item.name,
        detail: item.rtn ? `RTN ${item.rtn}` : "Sin RTN",
        updatedAt: item.updatedAt
      })),
    restore: (id) => suppliersService.updateStatus(id, true)
  },
  bodegas: {
    load: async (query) =>
      mapPage(await warehousesService.list(inactiveParams(query)), (item) => ({ id: item.id, title: item.name, detail: `Código ${item.code}`, updatedAt: item.updatedAt })),
    restore: (id) => warehousesService.updateStatus(id, true)
  },
  usuarios: {
    load: async (query) =>
      mapPage(await usersService.list(inactiveParams(query)), (item) => ({
        id: item.id,
        title: item.fullName,
        detail: `${item.username} · ${item.role}`,
        updatedAt: item.updatedAt
      })),
    restore: (id) => usersService.updateStatus(id, true)
  },
  cajas: {
    load: async (query) => {
      const all = (await cajaService.registers()).items
        .filter((item) => !item.isActive && (!query.search || item.name.toLowerCase().includes(query.search.toLowerCase())))
        .map((item) => ({ id: item.id, title: item.name, detail: "Caja", updatedAt: null }));
      const start = (query.page - 1) * query.pageSize;
      return { items: all.slice(start, start + query.pageSize), pagination: { page: query.page, pageSize: query.pageSize, total: all.length } };
    },
    restore: (id) => cajaService.updateRegister(id, { isActive: true })
  }
};

function DeactivatedRecords() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const canManage = useCanManageDeactivated();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const available = useMemo(() => DEACTIVATED_TYPES.filter((type) => can(type.permission)), [can]);
  const requested = params.get("tipo") as DeactivatedType | null;
  const current = available.find((type) => type.key === requested) ?? available[0];

  const itemsQuery = useQuery({
    queryKey: ["deactivated", current?.key, search, page, pageSize],
    queryFn: () => SOURCES[current!.key].load({ search, page, pageSize }),
    enabled: Boolean(canManage && current)
  });

  const restoreMutation = useMutation({
    mutationFn: (item: DeactivatedItem) => SOURCES[current!.key].restore(item.id),
    onSuccess: (_data, item) => {
      toast.success(`${item.title} restaurado.`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message)
  });

  if (!canManage) {
    return <Card className="mx-auto max-w-xl p-6 text-center text-slate-600">Solo un administrador puede ver y restaurar registros desactivados.</Card>;
  }

  if (!current) {
    return <Card className="mx-auto max-w-xl p-6 text-center text-slate-600">No tienes acceso a ningún tipo de registro.</Card>;
  }

  const items = itemsQuery.data?.items ?? [];

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Administración</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Registros desactivados</h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              No se pueden usar ni aparecen en las listas. Sus documentos anteriores se conservan. Restaurar los devuelve a su lista.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(current.href)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ir a {current.label.toLowerCase()}
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {available.map((type) => (
            <button
              key={type.key}
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
                router.replace(`/desactivados?tipo=${type.key}`);
              }}
              className={cn(
                "h-10 rounded-2xl border px-4 text-sm font-medium transition",
                type.key === current.key ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div className="relative mt-4 max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-10" placeholder={`Buscar en ${current.label.toLowerCase()} desactivados`} value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">{current.singular}</th>
              <th className="px-4 py-3">Detalle</th>
              <th className="px-4 py-3">Desactivado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {itemsQuery.isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10">
                  <Spinner label="Cargando..." />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">
                  No hay {current.label.toLowerCase()} desactivados{search ? " con esa búsqueda" : ""}.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td data-label={current.singular} className="px-4 py-4 font-semibold text-slate-900">{item.title}</td>
                  <td data-label="Detalle" className="px-4 py-4 text-slate-600">{item.detail}</td>
                  <td data-label="Desactivado" className="px-4 py-4 text-slate-600">{item.updatedAt ? formatDate(item.updatedAt) : "N/D"}</td>
                  <td data-label="Acciones" className="px-4 py-4">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={restoreMutation.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Restaurar ${item.title}`,
                            message: "Vuelve a su lista y se podrá usar de nuevo.",
                            confirmLabel: "Restaurar"
                          });
                          if (ok) restoreMutation.mutate(item);
                        }}
                      >
                        <ArchiveRestore className="mr-1 h-4 w-4" />
                        Restaurar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </TBody>
        </Table>
      </TableWrapper>

      <PaginationControls
        pagination={itemsQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </section>
  );
}

export default function DeactivatedPage() {
  return (
    <Suspense fallback={<Spinner label="Cargando..." />}>
      <DeactivatedRecords />
    </Suspense>
  );
}
