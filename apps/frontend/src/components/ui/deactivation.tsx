"use client";

import { Archive, ArchiveRestore, Power } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/hooks/use-auth";

/**
 * Registros desactivados: no se pueden usar y no aparecen en la vista principal.
 * Verlos, desactivar y restaurar es exclusivo de Administrador y Super Administrador
 * (el backend también lo exige).
 */

export function useCanManageDeactivated() {
  const { user } = useAuth();
  return user?.role === "ADMIN" || user?.role === "SUPERADMIN";
}

/** Tipos de registro que se pueden desactivar y su vista aparte (Administración → Desactivados). */
export type DeactivatedType = "productos" | "categorias" | "clientes" | "proveedores" | "bodegas" | "usuarios" | "cajas";

export const DEACTIVATED_TYPES: Array<{ key: DeactivatedType; label: string; singular: string; href: string; permission: string }> = [
  { key: "productos", label: "Productos", singular: "Producto", href: "/products", permission: "products.view" },
  { key: "categorias", label: "Categorías", singular: "Categoría", href: "/categories", permission: "categories.view" },
  { key: "clientes", label: "Clientes", singular: "Cliente", href: "/clients", permission: "clients.view" },
  { key: "proveedores", label: "Proveedores", singular: "Proveedor", href: "/suppliers", permission: "suppliers.view" },
  { key: "bodegas", label: "Bodegas", singular: "Bodega", href: "/warehouses", permission: "warehouses.view" },
  { key: "usuarios", label: "Usuarios", singular: "Usuario", href: "/users", permission: "users.view" },
  { key: "cajas", label: "Cajas", singular: "Caja", href: "/registro-cajas", permission: "caja.manage" }
];

/** Botón "Desactivados" que lleva a la vista aparte (sin contar: no escala con muchos registros). No se muestra a quien no es administrador. */
export function DeactivatedLink({ type, className }: { type: DeactivatedType; className?: string }) {
  const canManage = useCanManageDeactivated();
  const router = useRouter();
  if (!canManage) {
    return null;
  }
  return (
    <Button type="button" variant="secondary" className={className} onClick={() => router.push(`/desactivados?tipo=${type}`)}>
      <Archive className="mr-2 h-4 w-4" />
      Desactivados
    </Button>
  );
}

/**
 * Desactivar (en la vista principal) o Restaurar (en Desactivados), con confirmación.
 * No se muestra a quien no es administrador.
 */
export function DeactivateButton({
  active,
  label,
  pending,
  disabled,
  title,
  onChange
}: {
  active: boolean;
  label: string;
  pending?: boolean;
  disabled?: boolean;
  title?: string;
  onChange: (isActive: boolean) => void;
}) {
  const canManage = useCanManageDeactivated();
  const confirm = useConfirm();
  if (!canManage) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      disabled={pending || disabled}
      title={title}
      className={active ? "text-slate-500 hover:text-rose-600" : "text-emerald-700"}
      onClick={async () => {
        const ok = await confirm(
          active
            ? {
                title: `Desactivar ${label}`,
                message: "No se podrá usar ni aparecerá en la lista. Un administrador puede restaurarlo desde Desactivados.",
                confirmLabel: "Desactivar",
                tone: "danger"
              }
            : {
                title: `Restaurar ${label}`,
                message: "Vuelve a la lista principal y se podrá usar de nuevo.",
                confirmLabel: "Restaurar"
              }
        );
        if (ok) {
          onChange(!active);
        }
      }}
    >
      {active ? <Power className="mr-1 h-4 w-4" /> : <ArchiveRestore className="mr-1 h-4 w-4" />}
      {active ? "Desactivar" : "Restaurar"}
    </Button>
  );
}
