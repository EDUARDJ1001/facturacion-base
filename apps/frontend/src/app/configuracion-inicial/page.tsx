"use client";

import { useQuery } from "@tanstack/react-query";
import { Database, DatabaseZap, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { DatabaseConnectionForm } from "@/components/forms/database-connection-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { setTechnicianToken } from "@/lib/technician";
import { systemService, type DatabasePayload } from "@/services/system-service";

/**
 * Conexión a la base de datos sin iniciar sesión:
 *   - Configuración inicial: el sistema aún no tiene base de datos.
 *   - Recuperación: la base configurada no responde; se corrigen los datos (con los
 *     actuales ya escritos, salvo la contraseña) o se espera a que vuelva.
 *   - Técnico (Ctrl + Shift + F9 y clave): cambiar la conexión aunque la base responda.
 * Con la base respondiendo (y sin acceso de técnico) se lleva al inicio de sesión.
 */
export default function ConfiguracionInicialPage() {
  const router = useRouter();
  const statusQuery = useQuery({ queryKey: ["setup", "status"], queryFn: () => systemService.setupStatus(), retry: false });
  const status = statusQuery.data;
  const technician = Boolean(status?.technician);
  const recovering = Boolean(status?.configured) && !technician;
  const current = status?.settings;
  const leave = Boolean(status?.configured && status.connected && !technician);

  // La base responde (o ya se configuró en otra pestaña): al inicio de sesión.
  useEffect(() => {
    if (leave) {
      router.replace("/login");
    }
  }, [router, leave]);

  const initial = useMemo<DatabasePayload | undefined>(
    () =>
      current
        ? { client: current.client, host: current.host, port: current.port, database: current.database, user: current.user, password: "", sslMode: current.sslMode, sslCa: "" }
        : undefined,
    [current]
  );

  if (statusQuery.isLoading || leave) {
    return <Spinner label={recovering ? "Revisando la conexión..." : "Preparando..."} />;
  }

  const Icon = recovering ? DatabaseZap : Database;
  const finish = () => {
    setTechnicianToken(null);
    window.location.replace("/login");
  };

  return (
    <main className="flex min-h-dvh items-start justify-center bg-slate-50 p-4 sm:items-center sm:p-8">
      <Card className="w-full max-w-3xl p-5 sm:p-8">
        <div className="flex items-start gap-4">
          <span className={recovering ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white" : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white"}>
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="section-title">{technician ? "Acceso de técnico" : recovering ? "Sin conexión" : "Configuración inicial"}</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
              {technician ? "Conexión a la base de datos" : recovering ? "Cambiar conexión a la base de datos" : "Conectar base de datos"}
            </h1>
            <p className="mt-2 text-slate-600">
              {technician
                ? `Conexión de esta PC. ${status?.connected ? "La base responde." : "La base no responde."} El acceso vence en 15 minutos.`
                : recovering
                  ? "El sistema no puede conectarse con la base de datos configurada. Si cambió el servidor, el usuario o la contraseña, corrige los datos. Si solo se cayó la conexión, espera y reintenta."
                  : "Escribe los datos de la base de datos que usará el sistema (los mismos en todas las cajas). Si la base está vacía, se preparará automáticamente."}
            </p>
          </div>
        </div>

        {status && !status.local ? (
          <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            La conexión a la base de datos solo se puede cambiar desde la PC donde está instalado el sistema.
          </p>
        ) : (
          <>
            {recovering || (technician && current) ? (
              <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-slate-600">
                  Conexión actual: <span className="font-semibold text-slate-900">{current?.database}</span> en {current?.host}:{current?.port}. Deja la contraseña vacía para
                  conservar la guardada.
                </p>
                <Button variant="secondary" size="sm" type="button" className="shrink-0" disabled={statusQuery.isFetching} onClick={() => void statusQuery.refetch()}>
                  <RefreshCw className={statusQuery.isFetching ? "mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" : "mr-2 h-4 w-4"} aria-hidden />
                  {statusQuery.isFetching ? "Revisando..." : "Reintentar conexión"}
                </Button>
              </div>
            ) : null}

            <div className="mt-6">
              <DatabaseConnectionForm
                initial={initial}
                hasPassword={current?.hasPassword}
                hasSslCa={current?.hasSslCa}
                onTest={(payload) => systemService.setupTest(payload)}
                onApply={(payload) => systemService.setupApply(payload)}
                onApplied={finish}
                applyLabel={status?.configured ? "Guardar y conectar" : "Guardar y continuar"}
              />
            </div>
          </>
        )}

        {status?.configured ? (
          <p className="mt-6 text-center text-sm">
            <Link href="/login" onClick={() => setTechnicianToken(null)} className="font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900">
              Volver al inicio de sesión
            </Link>
          </p>
        ) : null}
      </Card>
    </main>
  );
}
