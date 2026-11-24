"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Database, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { integerInput } from "@/lib/number-input";
import { DATABASE_CLIENTS, type DatabaseCheck, type DatabaseClient, type DatabasePayload } from "@/services/system-service";

function CheckResult({ check }: { check: DatabaseCheck }) {
  return (
    <div className="grid gap-2 text-sm">
      <p className="flex items-center gap-2 text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Conexión correcta · {DATABASE_CLIENTS[check.client]?.label ?? ""} {check.version}
      </p>
      {check.hasSchema ? (
        <p className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Ya tiene el sistema instalado (usuarios y empresas).
        </p>
      ) : check.canInitialize ? (
        <p className="flex items-center gap-2 text-amber-700">
          <Database className="h-4 w-4 shrink-0" />
          Base vacía: al conectar se preparará con todo lo necesario para el sistema.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-rose-700">
          <XCircle className="h-4 w-4 shrink-0" />
          Esa base tiene otras tablas y no es del sistema. Usa una base vacía o la que ya usa el sistema.
        </p>
      )}
      {check.hasSchema && check.pendingMigrations.length > 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
          La base necesita {check.pendingMigrations.length} {check.pendingMigrations.length === 1 ? "actualización" : "actualizaciones"}; se aplican al conectar.
        </p>
      ) : null}
    </div>
  );
}

const EMPTY: DatabasePayload = { client: "mssql", host: "", port: 1433, database: "", user: "", password: "", sslMode: "DISABLED", sslCa: "" };

/**
 * Datos de conexión a la base: probar y guardar. Lo usan "Conectar base de datos"
 * (configuración inicial) y Sistema > Base de datos (SUPERADMIN).
 */
export function DatabaseConnectionForm({
  initial,
  hasPassword = false,
  hasSslCa = false,
  onTest,
  onApply,
  onApplied,
  applyLabel = "Guardar y conectar"
}: {
  initial?: DatabasePayload;
  hasPassword?: boolean;
  hasSslCa?: boolean;
  onTest: (payload: DatabasePayload) => Promise<DatabaseCheck>;
  onApply: (payload: DatabasePayload & { initialize: boolean }) => Promise<{ settings: { database: string; host: string } }>;
  onApplied?: () => void;
  applyLabel?: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<DatabasePayload>(initial ?? EMPTY);
  const [check, setCheck] = useState<DatabaseCheck | null>(null);

  // Datos actuales (la contraseña nunca viaja al navegador).
  useEffect(() => {
    if (initial) {
      setForm(initial);
    }
  }, [initial]);

  const update = (patch: Partial<DatabasePayload>) => {
    setForm((current) => ({ ...current, ...patch }));
    setCheck(null);
  };

  const testMutation = useMutation({
    mutationFn: () => onTest(form),
    onSuccess: (data) => {
      setCheck(data);
      toast.success("Conexión correcta.");
    },
    onError: (error: Error) => {
      setCheck(null);
      toast.error(error.message);
    }
  });

  const applyMutation = useMutation({
    mutationFn: (initialize: boolean) => onApply({ ...form, initialize }),
    onSuccess: (data) => {
      toast.success(`El sistema ahora usa la base ${data.settings.database} en ${data.settings.host}.`);
      setCheck(null);
      onApplied?.();
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const canSubmit = Boolean(form.host.trim() && form.database.trim() && form.user.trim() && form.port > 0);
  const canApply = canSubmit && Boolean(check?.hasSchema || check?.canInitialize);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        testMutation.mutate();
      }}
    >
      <div>
        <Label required htmlFor="dbClient">Tipo de base de datos</Label>
        <select
          id="dbClient"
          className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm md:w-80"
          value={form.client}
          onChange={(event) => {
            const client = event.target.value as DatabaseClient;
            // Si el puerto es el habitual del otro motor, se cambia al de este.
            const port = form.port === DATABASE_CLIENTS[form.client].port ? DATABASE_CLIENTS[client].port : form.port;
            update({ client, port });
          }}
        >
          {(Object.keys(DATABASE_CLIENTS) as DatabaseClient[]).map((client) => (
            <option key={client} value={client}>
              {DATABASE_CLIENTS[client].label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Label required htmlFor="dbHost">Servidor</Label>
          <Input
            id="dbHost"
            className="font-mono"
            value={form.host}
            onChange={(event) => update({ host: event.target.value })}
            placeholder="Nombre o IP del equipo, por ejemplo SERVIDOR\SQLEXPRESS"
            autoComplete="off"
          />
        </div>
        <div>
          <Label required htmlFor="dbPort">Puerto</Label>
          <Input id="dbPort" {...integerInput} value={form.port} onChange={(event) => update({ port: Number(event.target.value) })} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label required htmlFor="dbName">Base de datos</Label>
          <Input id="dbName" value={form.database} onChange={(event) => update({ database: event.target.value })} placeholder="facturacion" autoComplete="off" />
        </div>
        <div>
          <Label required htmlFor="dbUser">Usuario</Label>
          <Input id="dbUser" value={form.user} onChange={(event) => update({ user: event.target.value })} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="dbPassword">Contraseña</Label>
          <Input
            id="dbPassword"
            type="password"
            value={form.password ?? ""}
            onChange={(event) => update({ password: event.target.value })}
            placeholder={hasPassword ? "Guardada (sin cambios)" : ""}
            autoComplete="new-password"
          />
          {hasPassword ? (
            <p className="mt-1.5 text-xs text-slate-500">Hay una contraseña guardada en esta PC; por seguridad no se muestra. Déjalo vacío para conservarla.</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <Label htmlFor="dbSsl">Conexión cifrada</Label>
          <select
            id="dbSsl"
            className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
            value={form.sslMode}
            onChange={(event) => update({ sslMode: event.target.value as DatabasePayload["sslMode"] })}
          >
            <option value="DISABLED">No (red local)</option>
            <option value="REQUIRED">Sí (base en la nube)</option>
          </select>
        </div>
        {form.sslMode === "REQUIRED" ? (
          <div>
            <Label htmlFor="dbCa">Certificado del proveedor (opcional)</Label>
            <Textarea
              id="dbCa"
              rows={4}
              className="font-mono text-xs"
              value={form.sslCa ?? ""}
              onChange={(event) => update({ sslCa: event.target.value })}
              placeholder={hasSslCa ? "Se conserva el certificado actual" : "Pega aquí el certificado, si tu proveedor lo pide"}
            />
            {hasSslCa ? (
              <p className="mt-1.5 text-xs text-slate-500">Hay un certificado guardado en esta PC. Déjalo vacío para conservarlo o pega uno nuevo para reemplazarlo.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {check ? (
        <div className="rounded-2xl border border-slate-200 px-4 py-3">
          <CheckResult check={check} />
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" type="submit" disabled={!canSubmit || testMutation.isPending}>
          {testMutation.isPending ? "Probando..." : "Probar conexión"}
        </Button>
        <Button
          type="button"
          disabled={!canApply || applyMutation.isPending}
          title={!check ? "Primero prueba la conexión" : undefined}
          onClick={async () => {
            const initialize = Boolean(check && !check.hasSchema && check.canInitialize);
            const ok = await confirm({
              title: initialize ? "Preparar base nueva" : "Conectar base de datos",
              message: initialize
                ? `Se crearán en ${form.database} todas las tablas del sistema y el usuario inicial "superadmin" con contraseña "Admin123!" (cámbiala al entrar).`
                : `El sistema empezará a usar ${form.database} en ${form.host}.`,
              confirmLabel: initialize ? "Preparar y conectar" : "Conectar"
            });
            if (ok) {
              applyMutation.mutate(initialize);
            }
          }}
        >
          {applyMutation.isPending ? "Conectando..." : applyLabel}
        </Button>
      </div>
      {!check ? <p className="text-right text-xs text-slate-500">Prueba la conexión antes de guardar.</p> : null}
    </form>
  );
}
