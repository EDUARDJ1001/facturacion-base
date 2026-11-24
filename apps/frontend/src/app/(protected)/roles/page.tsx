"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { rolesService } from "@/services/roles-service";

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { can, reloadProfile } = useAuth();
  const canEdit = can("roles.edit");

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: () => rolesService.list() });
  const catalogQuery = useQuery({ queryKey: ["roles", "catalog"], queryFn: () => rolesService.catalog() });

  const roles = useMemo(() => rolesQuery.data?.items ?? [], [rolesQuery.data?.items]);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;

  useEffect(() => {
    const first = roles[0];
    if (!selectedRoleId && first) {
      setSelectedRoleId(first.id);
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (selectedRole) {
      setChecked(new Set(selectedRole.permissions));
    }
  }, [selectedRole]);

  const saveMutation = useMutation({
    mutationFn: () => rolesService.setPermissions(selectedRole!.id, Array.from(checked)),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      setFeedback({ tone: "ok", message: response.message });
      // Refresca permisos propios por si el admin editó su propio rol.
      await reloadProfile();
    },
    onError: (error: Error) => setFeedback({ tone: "error", message: error.message })
  });

  if (rolesQuery.isLoading || catalogQuery.isLoading) {
    return <Spinner label="Cargando roles y permisos..." />;
  }

  const readOnly = !canEdit || Boolean(selectedRole?.isSuperadmin);

  function toggle(key: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <p className="section-title">Administración</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Roles y permisos</h1>
        <p className="mt-3 text-slate-600">
          Define a qué vistas entra cada rol y qué acciones puede hacer. El backend valida siempre; esto controla el acceso real.
        </p>

        {feedback ? (
          <div
            className={
              feedback.tone === "ok"
                ? "mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                : "mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800"
            }
            role="status"
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {roles.map((role) => (
            <Button
              key={role.id}
              type="button"
              size="sm"
              variant={selectedRole?.id === role.id ? "primary" : "secondary"}
              onClick={() => setSelectedRoleId(role.id)}
            >
              {role.name}
            </Button>
          ))}
        </div>
        {selectedRole?.description ? <p className="mt-3 text-sm text-slate-500">{selectedRole.description}</p> : null}
        {selectedRole?.isSuperadmin ? (
          <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            SUPERADMIN tiene todos los permisos y no se puede modificar.
          </p>
        ) : null}
        {!canEdit && !selectedRole?.isSuperadmin ? (
          <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Solo lectura: no tienes permiso para editar roles.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalogQuery.data?.groups.map((group) => (
          <Card key={group.resource} className="p-4 sm:p-5">
            <p className="text-sm font-semibold text-slate-900">{group.label}</p>
            <div className="mt-3 grid gap-2">
              {group.permissions.map((permission) => (
                <label
                  key={permission.key}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2 text-sm ${readOnly ? "text-slate-500" : "text-slate-700"} bg-slate-50`}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(permission.key)}
                    disabled={readOnly}
                    onChange={() => toggle(permission.key)}
                  />
                  {permission.label}
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {canEdit && !selectedRole?.isSuperadmin ? (
        <div className="flex justify-end">
          <Button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()} className="sm:min-w-48">
            {saveMutation.isPending ? "Guardando..." : `Guardar permisos de ${selectedRole?.name ?? ""}`}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
