"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Spinner } from "@/components/ui/spinner";
import { PAGE_SIZE_DEFAULT, Pagination } from "@/components/ui/pagination";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { warehousesService } from "@/services/warehouses-service";
import type { Warehouse } from "@/types/api";

const warehouseSchema = z.object({
  code: z.string().min(1, "El código es obligatorio."),
  name: z.string().min(2, "El nombre es obligatorio."),
  address: z.string().optional(),
  isDefault: z.boolean(),
  isActive: z.boolean()
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

const emptyValues: WarehouseFormValues = {
  code: "",
  name: "",
  address: "",
  isDefault: false,
  isActive: true
};

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // La vista principal solo muestra activos; los desactivados están en Administración → Desactivados.
  const status = "active";
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  // Páginas de 50 como máximo; al cambiar un filtro se vuelve a la primera.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  useEffect(() => setPage(1), [search]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status });
    if (search) value.set("search", search);
    return value;
  }, [search, status, page, pageSize]);

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", params.toString()],
    placeholderData: keepPreviousData,
    queryFn: () => warehousesService.list(params)
  });

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: emptyValues
  });

  useEffect(() => {
    if (!editingWarehouse) {
      form.reset(emptyValues);
      return;
    }

    form.reset({
      code: editingWarehouse.code,
      name: editingWarehouse.name,
      address: editingWarehouse.address ?? "",
      isDefault: Boolean(editingWarehouse.isDefault),
      isActive: Boolean(editingWarehouse.isActive)
    });
  }, [editingWarehouse, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: WarehouseFormValues) => {
      if (editingWarehouse) {
        return warehousesService.update(editingWarehouse.id, values);
      }

      return warehousesService.create(values);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      setModalOpen(false);
      setEditingWarehouse(null);
      form.reset(emptyValues);
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ warehouse, isActive }: { warehouse: Warehouse; isActive: boolean }) => warehousesService.updateStatus(warehouse.id, isActive),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["warehouses"] })
  });

  if (warehousesQuery.isLoading) {
    return <Spinner label="Cargando bodegas..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Bodegas</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Ubicaciones de inventario</h1>
            <p className="mt-3 text-slate-600">Define bodegas por empresa y marca una como predeterminada para facturación.</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditingWarehouse(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nueva bodega
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_220px]">
          <Input placeholder="Buscar por nombre, código o dirección" value={search} onChange={(event) => setSearch(event.target.value)} />
          <DeactivatedLink type="bodegas" />
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">Bodega</th>
              <th className="px-4 py-3">Dirección</th>
              <th className="px-4 py-3">Uso</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {warehousesQuery.data?.items.map((warehouse) => (
              <tr key={warehouse.id}>
                <td data-label="Bodega" className="px-4 py-4">
                  <p className="font-semibold text-slate-900">{warehouse.name}</p>
                  <p className="text-sm text-slate-500">{warehouse.code}</p>
                </td>
                <td data-label="Dirección" className="px-4 py-4 text-slate-600">{warehouse.address ?? "Sin dirección"}</td>
                <td data-label="Uso" className="px-4 py-4">
                  {warehouse.isDefault ? (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Predeterminada</span>
                  ) : (
                    <span className="text-slate-500">Operativa</span>
                  )}
                </td>
                <td data-label="Acciones" className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    {warehouse.isActive ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setEditingWarehouse(warehouse);
                          setModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    ) : null}
                    <DeactivateButton active={Boolean(warehouse.isActive)} label={warehouse.name} pending={statusMutation.isPending} onChange={(isActive) => statusMutation.mutate({ warehouse, isActive })} />
                  </div>
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      </TableWrapper>
      <Pagination
        pagination={warehousesQuery.data?.pagination}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingWarehouse(null);
        }}
        title={editingWarehouse ? "Editar bodega" : "Nueva bodega"}
      >
        <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => saveMutation.mutateAsync(values))}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label required htmlFor="code">Código</Label>
              <Input id="code" {...form.register("code")} />
              {form.formState.errors.code ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.code.message}</p> : null}
            </div>
            <div>
              <Label required htmlFor="name">Nombre</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.name.message}</p> : null}
            </div>
          </div>
          <div>
            <Label htmlFor="address">Dirección</Label>
            <Textarea id="address" {...form.register("address")} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" {...form.register("isDefault")} />
              Predeterminada
            </label>
            <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" {...form.register("isActive")} />
              Activa
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editingWarehouse ? "Actualizar" : "Crear bodega"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
