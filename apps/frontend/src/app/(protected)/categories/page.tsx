"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DeactivateButton, DeactivatedLink } from "@/components/ui/deactivation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { productsService } from "@/services/products-service";
import type { ProductCategory } from "@/types/api";

const categorySchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio."),
  description: z.string().optional(),
  isActive: z.boolean()
});

type CategoryFormValues = z.infer<typeof categorySchema>;

const emptyCategory: CategoryFormValues = {
  name: "",
  description: "",
  isActive: true
};

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // La vista principal solo muestra activos; los desactivados están en Administración → Desactivados.
  const status = "active";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status });
    if (search) value.set("search", search);
    return value;
  }, [page, pageSize, search, status]);

  const categoriesQuery = useQuery({
    queryKey: ["product-categories", params.toString()],
    queryFn: () => productsService.listCategories(params)
  });

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: emptyCategory
  });

  useEffect(() => {
    if (!editingCategory) {
      form.reset(emptyCategory);
      return;
    }

    form.reset({
      name: editingCategory.name,
      description: editingCategory.description ?? "",
      isActive: Boolean(editingCategory.isActive)
    });
  }, [editingCategory, form]);

  const saveMutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      editingCategory ? productsService.updateCategory(editingCategory.id, values) : productsService.createCategory(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      setModalOpen(false);
      setEditingCategory(null);
      form.reset(emptyCategory);
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ category, isActive }: { category: ProductCategory; isActive: boolean }) =>
      productsService.updateCategoryStatus(category.id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });

  if (categoriesQuery.isLoading) {
    return <Spinner label="Cargando categorías..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Categorías</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Clasificación del catálogo</h1>
            <p className="mt-3 text-slate-600">
              Las categorías agrupan los productos y sirven para filtrarlos. No se imprimen en la factura.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditingCategory(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva categoría
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_180px]">
          <Input
            placeholder="Buscar por nombre o descripción"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <DeactivatedLink type="categorias" />
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {categoriesQuery.data?.items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                  No hay categorías que coincidan con el filtro.
                </td>
              </tr>
            ) : null}
            {categoriesQuery.data?.items.map((category) => (
              <tr key={category.id}>
                <td data-label="Categoría" className="px-4 py-4">
                  <p className="font-semibold text-slate-900">{category.name}</p>
                </td>
                <td data-label="Descripción" className="px-4 py-4 text-slate-600">
                  {category.description ?? "Sin descripción"}
                </td>
                <td data-label="Acciones" className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    {category.isActive ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setEditingCategory(category);
                          setModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    ) : null}
                    <DeactivateButton active={Boolean(category.isActive)} label={category.name} pending={statusMutation.isPending} onChange={(isActive) => statusMutation.mutate({ category, isActive })} />
                  </div>
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      </TableWrapper>

      <Pagination
        pagination={categoriesQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingCategory(null);
        }}
        title={editingCategory ? "Editar categoría" : "Nueva categoría"}
      >
        <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => saveMutation.mutateAsync(values))}>
          <div>
            <Label required htmlFor="categoryName">Nombre</Label>
            <Input id="categoryName" {...form.register("name")} />
            {form.formState.errors.name ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.name.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="categoryDescription">Descripción</Label>
            <Textarea id="categoryDescription" {...form.register("description")} />
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" {...form.register("isActive")} />
            Activa
          </label>

          {saveMutation.error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{(saveMutation.error as Error).message}</p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editingCategory ? "Actualizar" : "Crear categoría"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
