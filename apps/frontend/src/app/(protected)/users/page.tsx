"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Mail, Pencil, Plus, Power, Search, ShieldCheck, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { isStrongPassword, PasswordField } from "@/components/forms/password-field";
import { DeactivatedLink, useCanManageDeactivated } from "@/components/ui/deactivation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { PAGE_SIZE_DEFAULT, Pagination } from "@/components/ui/pagination";
import { Table, TableWrapper, TBody, THead } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { usersService } from "@/services/users-service";
import type { ManagedUser } from "@/types/api";

/** Espacios repetidos fuera. */
const clean = (value: string) => value.trim().replace(/\s+/g, " ");

// Mismas reglas y largos que el servidor.
const userSchema = z.object({
  fullName: z.string().transform(clean).pipe(z.string().min(3, "Escribe el nombre completo (mínimo 3 letras).").max(150, "Máximo 150 caracteres.")),
  username: z
    .string()
    .trim()
    .min(3, "El usuario debe tener al menos 3 caracteres.")
    .max(50, "Máximo 50 caracteres.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Sin espacios: solo letras, números, punto, guion y guion bajo."),
  email: z.string().trim().toLowerCase().max(150, "Máximo 150 caracteres.").email("Escribe un correo válido, por ejemplo nombre@empresa.com."),
  password: z.string().optional(),
  roleId: z.coerce.number().int().positive("Elige el rol del usuario.")
});

type UserFormInput = z.input<typeof userSchema>;
type UserFormValues = z.output<typeof userSchema>;

const emptyValues: UserFormInput = { fullName: "", username: "", email: "", password: "", roleId: 0 };

const ROLE_LABELS: Record<string, string> = { SUPERADMIN: "Superadministrador", ADMIN: "Administrador", CAJERO: "Cajero" };
const ROLE_STYLES: Record<string, string> = {
  SUPERADMIN: "bg-violet-100 text-violet-800",
  ADMIN: "bg-sky-100 text-sky-800",
  CAJERO: "bg-amber-100 text-amber-800"
};
const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

/** "Hace 5 min", "Ayer"... con la fecha completa aparte (para el título al pasar el mouse). */
function lastAccess(value: string | null) {
  if (!value) return { text: "Nunca ha entrado", full: undefined };
  const date = new Date(value);
  const full = date.toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return { text: "Ahora mismo", full };
  if (minutes < 60) return { text: `Hace ${minutes} min`, full };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { text: `Hace ${hours} h`, full };
  const days = Math.round(hours / 24);
  if (days === 1) return { text: "Ayer", full };
  if (days < 30) return { text: `Hace ${days} días`, full };
  return { text: date.toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }), full };
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1.5 text-sm text-rose-600" role="alert">
      {message}
    </p>
  ) : null;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { user: currentUser, companies } = useAuth();
  const canManageDeactivated = useCanManageDeactivated();

  // Búsqueda: se consulta 300 ms después de dejar de escribir.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([]);
  const [initialCompanies, setInitialCompanies] = useState<number[]>([]);
  const [passwordTarget, setPasswordTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Páginas de 50 como máximo; al cambiar la búsqueda se vuelve a la primera.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  useEffect(() => setPage(1), [search]);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status: "active" });
    if (search) value.set("search", search);
    return value;
  }, [search, page, pageSize]);

  const usersQuery = useQuery({
    queryKey: ["users", params.toString()],
    placeholderData: keepPreviousData,
    queryFn: () => usersService.list(params)
  });
  const rolesQuery = useQuery({ queryKey: ["users", "roles"], queryFn: () => usersService.roles() });

  const form = useForm<UserFormInput, unknown, UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: emptyValues,
    // Cada campo se revisa al salir de él (no mientras se escribe).
    mode: "onTouched"
  });
  const roleId = Number(form.watch("roleId"));
  const passwordValue = form.watch("password") ?? "";
  const selectedRole = rolesQuery.data?.items.find((role) => role.id === roleId);
  const editingSelf = Boolean(editingUser && currentUser?.sub === editingUser.id);

  const openForm = (target: ManagedUser | null) => {
    setEditingUser(target);
    const companyIds = target ? target.companies.map((company) => company.id) : companies.length === 1 ? [companies[0]!.id] : [];
    form.reset(
      target ? { fullName: target.fullName, username: target.username, email: target.email, password: "", roleId: target.roleId } : emptyValues
    );
    setSelectedCompanies(companyIds);
    setInitialCompanies(companyIds);
    saveMutation.reset();
    setModalOpen(true);
  };

  const companiesChanged =
    selectedCompanies.length !== initialCompanies.length || selectedCompanies.some((id) => !initialCompanies.includes(id));

  const closeForm = async () => {
    if ((form.formState.isDirty || companiesChanged) && !saveMutation.isPending) {
      const discard = await confirm({
        title: "Descartar cambios",
        message: "Hay cambios sin guardar en este usuario. Si cierras, se pierden.",
        confirmLabel: "Descartar",
        cancelLabel: "Seguir editando",
        tone: "danger"
      });
      if (!discard) return;
    }
    setModalOpen(false);
    setEditingUser(null);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const saveMutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      const payload = { username: values.username, email: values.email, fullName: values.fullName, roleId: values.roleId, companyIds: selectedCompanies };
      return editingUser ? usersService.update(editingUser.id, payload) : usersService.create({ ...payload, password: values.password });
    },
    onSuccess: (response) => {
      void invalidate();
      setModalOpen(false);
      setEditingUser(null);
      toast.success(response.message);
    }
    // El error se muestra dentro de la ventana, junto al botón.
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => usersService.updateStatus(id, isActive),
    onSuccess: (response) => {
      void invalidate();
      toast.success(response.message);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => usersService.updatePassword(id, password),
    onSuccess: () => {
      toast.success(`Contraseña cambiada. Comunícale la nueva contraseña a ${passwordTarget?.fullName ?? "el usuario"}.`);
      setPasswordTarget(null);
      setNewPassword("");
    }
  });

  const onSubmit = form.handleSubmit((values) => {
    if (!editingUser && !isStrongPassword(values.password ?? "")) {
      form.setError("password", { message: "La contraseña no cumple los requisitos de abajo." }, { shouldFocus: true });
      return;
    }
    saveMutation.mutate(values);
  });

  const deactivate = async (target: ManagedUser) => {
    const ok = await confirm({
      title: `Desactivar a ${target.fullName}`,
      message: "Pierde el acceso al sistema y deja de aparecer en la lista. No se borra nada: sus facturas y movimientos conservan su autor, y se puede restaurar desde Desactivados.",
      confirmLabel: "Desactivar",
      tone: "danger"
    });
    if (ok) statusMutation.mutate({ id: target.id, isActive: false });
  };

  const toggleCompany = (companyId: number) =>
    setSelectedCompanies((current) => (current.includes(companyId) ? current.filter((id) => id !== companyId) : [...current, companyId]));
  const allSelected = companies.length > 0 && companies.every((company) => selectedCompanies.includes(company.id));

  if (usersQuery.isLoading) {
    return <Spinner label="Cargando usuarios..." />;
  }

  const items = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.pagination.total ?? 0;

  return (
    <section className="grid gap-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-title">Usuarios</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Usuarios del sistema</h1>
            <p className="mt-3 max-w-2xl text-slate-600">Da de alta al personal, elige su rol y las empresas donde puede trabajar.</p>
          </div>
          <Button type="button" onClick={() => openForm(null)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Nuevo usuario
          </Button>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              type="search"
              aria-label="Buscar usuarios"
              placeholder="Buscar por nombre, usuario o correo"
              className="pl-11 pr-11"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-700"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <DeactivatedLink className="w-fit" type="usuarios" />
        </div>
      </Card>

      <TableWrapper>
        <Table>
          <THead>
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Empresas</th>
              <th className="px-4 py-3">Último acceso</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-12 text-center" colSpan={5}>
                  {search ? (
                    <div className="grid justify-items-center gap-3">
                      <p className="text-slate-600">No hay usuarios que coincidan con “{search}”.</p>
                      <Button variant="secondary" size="sm" type="button" onClick={() => setSearchInput("")}>
                        Limpiar búsqueda
                      </Button>
                    </div>
                  ) : (
                    <div className="grid justify-items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <UserPlus className="h-6 w-6" aria-hidden />
                      </span>
                      <p className="text-slate-600">Todavía no hay otros usuarios.</p>
                      <Button size="sm" type="button" onClick={() => openForm(null)}>
                        Crear el primer usuario
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ) : null}

            {items.map((item) => {
              const isSelf = currentUser?.sub === item.id;
              const access = lastAccess(item.lastLoginAt);

              return (
                <tr key={item.id}>
                  <td data-label="Usuario" className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600" aria-hidden>
                        {initials(item.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {item.fullName}
                          {isSelf ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Tú</span> : null}
                        </p>
                        <p className="font-mono text-sm text-slate-600">{item.username}</p>
                        <p className="flex items-center gap-1 truncate text-sm text-slate-500">
                          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {item.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Rol" className="px-4 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", ROLE_STYLES[item.role] ?? "bg-slate-200 text-slate-700")}>
                      {roleLabel(item.role)}
                    </span>
                  </td>
                  <td data-label="Empresas" className="px-4 py-4 text-slate-600">
                    {item.companies.length === 0 ? (
                      <span className="text-sm text-amber-800">Sin empresas: no podrá trabajar</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {item.companies.map((company) => (
                          <span key={company.id} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {company.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td data-label="Último acceso" className="px-4 py-4 text-sm text-slate-600" title={access.full}>
                    {access.text}
                  </td>
                  <td data-label="Acciones" className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="secondary" size="sm" type="button" onClick={() => openForm(item)}>
                        <Pencil className="mr-1.5 h-4 w-4" aria-hidden />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="w-10 px-0"
                        title="Cambiar contraseña"
                        aria-label={`Cambiar contraseña de ${item.fullName}`}
                        onClick={() => {
                          passwordMutation.reset();
                          setNewPassword("");
                          setPasswordTarget(item);
                        }}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden />
                      </Button>
                      {canManageDeactivated && !isSelf ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="w-10 px-0 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                          title="Desactivar"
                          aria-label={`Desactivar a ${item.fullName}`}
                          disabled={statusMutation.isPending}
                          onClick={() => void deactivate(item)}
                        >
                          <Power className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </TableWrapper>
      {total > 0 ? (
        <Pagination
          pagination={usersQuery.data?.pagination}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      ) : null}

      {/* Crear o editar */}
      <Modal open={modalOpen} onClose={() => void closeForm()} eyebrow={editingUser ? "Editar usuario" : "Nuevo usuario"} title={editingUser ? editingUser.fullName : "Datos del usuario"}>
        <form className="grid gap-5" onSubmit={onSubmit} noValidate>
          <fieldset className="grid gap-4 md:grid-cols-2">
            <legend className="sr-only">Datos personales y de acceso</legend>
            <div className="md:col-span-2">
              <Label required htmlFor="fullName">Nombre completo</Label>
              <Input id="fullName" autoFocus autoComplete="off" maxLength={150} aria-invalid={Boolean(form.formState.errors.fullName)} {...form.register("fullName")} />
              <FieldError message={form.formState.errors.fullName?.message} />
            </div>
            <div>
              <Label required htmlFor="username">Usuario</Label>
              <Input id="username" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={50} className="font-mono" aria-invalid={Boolean(form.formState.errors.username)} aria-describedby="username-ayuda" {...form.register("username")} />
              {form.formState.errors.username ? (
                <FieldError message={form.formState.errors.username.message} />
              ) : (
                <p id="username-ayuda" className="mt-1.5 text-xs text-slate-500">Con este nombre entra al sistema. Sin espacios.</p>
              )}
            </div>
            <div>
              <Label required htmlFor="email">Correo</Label>
              <Input id="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" maxLength={150} aria-invalid={Boolean(form.formState.errors.email)} {...form.register("email")} />
              <FieldError message={form.formState.errors.email?.message} />
            </div>
          </fieldset>

          {!editingUser ? (
            <div>
              <Label required htmlFor="password">Contraseña inicial</Label>
              <PasswordField
                id="password"
                value={passwordValue}
                invalid={Boolean(form.formState.errors.password)}
                onChange={(event) => form.setValue("password", event.target.value, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
                onGenerate={(password) => form.setValue("password", password, { shouldDirty: true, shouldValidate: true })}
              />
              <FieldError message={form.formState.errors.password?.message} />
            </div>
          ) : null}

          <div>
            <Label required htmlFor="roleId">Rol</Label>
            <select
              id="roleId"
              className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-slate-50"
              disabled={editingSelf}
              aria-invalid={Boolean(form.formState.errors.roleId)}
              aria-describedby="rol-ayuda"
              {...form.register("roleId")}
            >
              <option value={0}>Elige un rol</option>
              {rolesQuery.data?.items.map((role) => (
                <option key={role.id} value={role.id}>
                  {roleLabel(role.name)}
                </option>
              ))}
            </select>
            {form.formState.errors.roleId ? (
              <FieldError message={form.formState.errors.roleId.message} />
            ) : (
              <p id="rol-ayuda" className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {editingSelf
                    ? "No puedes cambiar tu propio rol; pídeselo a otro administrador."
                    : selectedRole?.description
                      ? `${selectedRole.description}. `
                      : "El rol define qué puede hacer en el sistema. "}
                  {!editingSelf ? (
                    <Link href="/roles" className="font-medium text-slate-700 underline underline-offset-2">
                      Ver permisos de cada rol
                    </Link>
                  ) : null}
                </span>
              </p>
            )}
          </div>

          <fieldset>
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-semibold text-slate-800">Empresas donde puede trabajar</legend>
              {companies.length > 1 ? (
                <button
                  type="button"
                  className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
                  onClick={() => setSelectedCompanies(allSelected ? [] : companies.map((company) => company.id))}
                >
                  {allSelected ? "Quitar todas" : "Marcar todas"}
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {companies.map((company) => {
                const checked = selectedCompanies.includes(company.id);
                return (
                  <label
                    key={company.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                      checked ? "border-brand/50 bg-brand/5 text-slate-900" : "border-border text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={checked} onChange={() => toggleCompany(company.id)} />
                    <span>{company.commercialName}</span>
                  </label>
                );
              })}
            </div>
            <p className={cn("mt-1.5 text-xs", selectedCompanies.length === 0 ? "text-amber-800" : "text-slate-500")}>
              {selectedCompanies.length === 0
                ? "Sin empresas, el usuario podrá iniciar sesión pero no podrá trabajar en ninguna."
                : `${selectedCompanies.length} de ${companies.length} ${companies.length === 1 ? "empresa" : "empresas"}.`}
            </p>
          </fieldset>

          {saveMutation.error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {saveMutation.error.message}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" type="button" onClick={() => void closeForm()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : editingUser ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cambiar contraseña */}
      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => {
          setPasswordTarget(null);
          setNewPassword("");
        }}
        eyebrow="Cambiar contraseña"
        title={passwordTarget?.fullName ?? "Contraseña"}
        className="max-w-lg"
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (passwordTarget && isStrongPassword(newPassword)) passwordMutation.mutate({ id: passwordTarget.id, password: newPassword });
          }}
        >
          <p className="text-sm text-slate-600">La contraseña anterior deja de funcionar de inmediato. Comunícale la nueva al usuario.</p>
          <div>
            <Label required htmlFor="newPassword">Nueva contraseña</Label>
            <PasswordField id="newPassword" autoFocus value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onGenerate={setNewPassword} />
          </div>
          {passwordMutation.error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {passwordMutation.error.message}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setPasswordTarget(null);
                setNewPassword("");
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={passwordMutation.isPending || !isStrongPassword(newPassword)}>
              {passwordMutation.isPending ? "Guardando..." : "Cambiar contraseña"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
