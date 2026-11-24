"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, Database, Server } from "lucide-react";
import { useMemo } from "react";

import { DatabaseConnectionForm } from "@/components/forms/database-connection-form";
import { DatabaseStructure } from "@/components/forms/database-structure";
import { DatabaseUpdates } from "@/components/forms/database-updates";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { DATABASE_CLIENTS, systemService, type DatabasePayload } from "@/services/system-service";

/** Conexión a la base de datos del sistema (local, otra PC o en la nube). Solo SUPERADMIN. */
export default function BaseDeDatosPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperadmin = user?.role === "SUPERADMIN";

  const statusQuery = useQuery({ queryKey: ["system", "database"], queryFn: () => systemService.database(), enabled: isSuperadmin });
  const current = statusQuery.data?.settings;

  // Datos actuales en el formulario (la contraseña nunca viaja al navegador).
  const initial = useMemo<DatabasePayload | undefined>(
    () =>
      current
        ? {
            client: current.client ?? "mssql",
            host: current.host,
            port: current.port,
            database: current.database,
            user: current.user,
            password: "",
            sslMode: current.sslMode,
            sslCa: ""
          }
        : undefined,
    [current]
  );

  if (!isSuperadmin) {
    return <Card className="mx-auto max-w-xl p-6 text-center text-slate-600">Solo el Super Administrador puede configurar la base de datos.</Card>;
  }

  if (statusQuery.isLoading) {
    return <Spinner label="Consultando la base de datos..." />;
  }

  const status = statusQuery.data;
  const isLocal = current ? ["localhost", "127.0.0.1"].includes(current.host) : true;

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-6">
      <Card className="p-4 sm:p-6">
        <p className="section-title">Sistema</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">Base de datos</h1>
        <p className="mt-2 text-slate-600">Conexión del sistema a la base de datos: en esta PC, en otra PC de la red o en la nube.</p>

        {status ? (
          <div className={cn("mt-4 flex flex-col gap-3 rounded-2xl px-4 py-4 sm:flex-row sm:items-center", status.connected ? "bg-emerald-50" : "bg-rose-50")}>
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white", status.connected ? "bg-emerald-600" : "bg-rose-600")}>
              {isLocal ? <Server className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-slate-900">
                {status.connected ? "Conectado" : "Sin conexión"} · {current?.database} en {current?.host}:{current?.port}
              </p>
              <p className="text-slate-600">
                {status.connected
                  ? `Usuario ${current?.user} · ${current?.sslMode === "REQUIRED" ? "conexión cifrada" : "sin cifrado"} · ${DATABASE_CLIENTS[current?.client ?? "mssql"].label} ${status.version ?? ""}`
                  : "No se pudo conectar con la base de datos configurada."}
              </p>
              {status.connected && status.pendingMigrations && status.pendingMigrations.length > 0 ? (
                <p className="mt-1 text-amber-800">
                  La base necesita {status.pendingMigrations.length} {status.pendingMigrations.length === 1 ? "actualización" : "actualizaciones"}.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      {status?.connected && status.pendingReview && status.pendingReview.length > 0 ? <DatabaseUpdates reviews={status.pendingReview} /> : null}
      {status?.connected ? <DatabaseStructure /> : null}

      <Card className="p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Cambiar conexión</h2>
            <p className="text-sm text-slate-500">Prueba la conexión antes de guardar.</p>
          </div>
        </div>
        <DatabaseConnectionForm
          initial={initial}
          hasPassword={current?.hasPassword}
          hasSslCa={current?.hasSslCa}
          onTest={(payload) => systemService.testDatabase(payload)}
          onApply={(payload) => systemService.applyDatabase(payload)}
          onApplied={() => void queryClient.invalidateQueries()}
        />
      </Card>
    </section>
  );
}
