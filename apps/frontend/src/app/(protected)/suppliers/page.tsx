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
import { isValidRtn, RTN_MESSAGE } from "@/lib/sale-rules";
import { suppliersService } from "@/services/suppliers-service";
import type { Supplier } from "@/types/api";

const supplierSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio.").max(180, "Máximo 180 caracteres."),
  rtn: z.string().trim().optional().refine((value) => isValidRtn(value), RTN_MESSAGE),
  email: z.string().trim().max(150, "Máximo 150 caracteres.").email("Correo inválido.").optional().or(z.literal("")),
  phone: z.string().trim().max(40, "Máximo 40 caracteres.").optional(),
  address: z.string().trim().max(255, "Máximo 255 caracteres.").optional()
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

const emptySupplier: SupplierFormValues = { name: "", rtn: "", email: "", phone: "", address: "" };

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // La vista principal solo muestra activos; los desactivados están en Administración → Desactivados.
  const status = "active";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status });
    if (search) value.set("search", search);
    return value;
  }, [page, pageSize, search, status]);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", params.toString()],
    queryFn: () => suppliersService.list(params)
  });

  const form = useForm<SupplierFormValues>({ resolver: zodResolver(supplierSchema), defaultValues: emptySupplier });

  useEffect(() => {
    if (!editing) {
      form.reset(emptySupplier);
      return;
    }

    form.reset({
      name: editing.name,
      rtn: editing.rtn ?? "",
      email: editing.email ?? "",
      phone: editing.phone ?? "",
      address: editing.address ?? ""
    });
  }, [editing, form]);

  const saveMutation = useMutation({
    mutationFn: (values: SupplierFormValues) =>
      editing ? suppliersService.update(editing.id, values) : suppliersService.create(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setModalOpen(false);
      setEditing(null);
      form.reset(emptySupplier);
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ supplier, isActive }: { supplier: Supplier; isActive: boolean }) =>
      suppliersService.updateStatus(supplier.id, isActive),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suppliers"] })
  });

  if (suppliersQuery.isLoading) {
    return <Spinner label="Cargando proveedores..." />;
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Proveedores</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Catálogo de proveedores</h1>
            <p className="mt-3 text-slate-600">Maestro de proveedores para las cuentas por pagar.</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo proveedor
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_180px]">
          <Input
            placeholder="Buscar por nombre, RTN o código"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <DeactivatedLink type="proveedores" />
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">RTN</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {suppliersQuery.data?.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                  No hay proveedores registrados.
                </td>
              </tr>
            ) : null}
            {suppliersQuery.data?.items.map((supplier) => (
              <tr key={supplier.id}>
                <td data-label="Proveedor" className="px-4 py-4">
                  <p className="font-semibold text-slate-900">{supplier.name}</p>
                  <p className="text-sm text-slate-500">{supplier.code}</p>
                </td>
                <td data-label="RTN" className="px-4 py-4 tabular-nums text-slate-600">{supplier.rtn ?? "N/D"}</td>
                <td data-label="Contacto" className="px-4 py-4 text-slate-600">
                  <p>{supplier.phone ?? "N/D"}</p>
                  <p className="text-sm text-slate-500">{supplier.email ?? ""}</p>
                </td>
                <td data-label="Acciones" className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    {supplier.isActive ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setEditing(supplier);
                          setModalOpen(true);
                        }}
                      >
                        Editar
                      </Button>
                    ) : null}
                    <DeactivateButton active={Boolean(supplier.isActive)} label={supplier.name} pending={statusMutation.isPending} onChange={(isActive) => statusMutation.mutate({ supplier, isActive })} />
                  </div>
                </td>
              </tr>
            ))}
          </TBody>
        </Table>
      </TableWrapper>

      <Pagination
        pagination={suppliersQuery.data?.pagination}
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
          setEditing(null);
        }}
        title={editing ? "Editar proveedor" : "Nuevo proveedor"}
      >
        <form className="grid gap-4" onSubmit={form.handleSubmit(async (values) => saveMutation.mutateAsync(values))}>
          <div>
            <Label required htmlFor="name">Nombre</Label>
            <Input id="name" {...form.register("name")} />
            {form.formState.errors.name ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.name.message}</p> : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="rtn">RTN</Label>
              <Input id="rtn" inputMode="numeric" className="font-mono" placeholder="14 dígitos" {...form.register("rtn")} />
              {form.formState.errors.rtn ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.rtn.message}</p> : null}
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...form.register("phone")} />
              {form.formState.errors.phone ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.phone.message}</p> : null}
            </div>
          </div>
          <div>
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.email.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="address">Dirección</Label>
            <Textarea id="address" {...form.register("address")} />
            {form.formState.errors.address ? <p className="mt-2 text-sm text-rose-600">{form.formState.errors.address.message}</p> : null}
          </div>

          {saveMutation.error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{(saveMutation.error as Error).message}</p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editing ? "Actualizar" : "Crear proveedor"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
