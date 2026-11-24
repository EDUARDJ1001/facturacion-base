"use client";

import { useQueryClient } from "@tanstack/react-query";
import { DatabaseZap, Download, RefreshCw, ServerOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { API_URL, CONNECTION_EVENT, goToSetup, type ConnectionProblem } from "@/lib/api-client";
import { updatesService } from "@/services/updates-service";

/** Con conexión se revisa de vez en cuando; sin conexión, seguido para avisar apenas vuelva. */
const CHECK_OK_MS = 30_000;
const CHECK_DOWN_MS = 5_000;
const CHECK_TIMEOUT_MS = 8_000;

/** Versión del programa con la que se cargaron estas pantallas. */
let loadedVersion: string | null = null;

/** Si el programa se actualizó (otra versión responde), se recargan las pantallas. */
function reloadIfUpdated(version: string | undefined) {
  if (!version) {
    return;
  }
  if (loadedVersion && loadedVersion !== version) {
    window.location.reload();
    return;
  }
  loadedVersion = version;
}

/** Versión de esta caja frente a la base y versión nueva publicada (de /api/health). */
interface UpdateInfo {
  outdated: boolean;
  updateAvailable: string | null;
}

let lastUpdateInfo: UpdateInfo = { outdated: false, updateAvailable: null };

async function checkConnection(): Promise<ConnectionProblem | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/health`, { cache: "no-store", signal: controller.signal });
    const data = (await response.json().catch(() => ({}))) as {
      configured?: boolean;
      version?: string;
      outdated?: boolean;
      updateAvailable?: string | null;
    };
    reloadIfUpdated(data.version);
    lastUpdateInfo = { outdated: Boolean(data.outdated), updateAvailable: data.updateAvailable ?? null };
    if (response.ok) {
      return null;
    }
    // Sin base configurada no es una caída: se lleva a la pantalla "Conectar base de datos".
    if (data.configured === false) {
      goToSetup();
      return null;
    }
    return "database";
  } catch {
    return "server";
  } finally {
    window.clearTimeout(timer);
  }
}

const MESSAGES: Record<ConnectionProblem, { title: string; text: string }> = {
  database: {
    title: "Sin conexión con la base de datos",
    text: "No se pueden cargar ni guardar datos. El sistema vuelve a intentarlo solo y te avisará cuando se recupere."
  },
  server: {
    title: "Sin conexión con el servidor del sistema",
    text: "Revisa que el equipo del servidor esté encendido y conectado a la red. El sistema vuelve a intentarlo solo."
  }
};

/**
 * Aviso general cuando no hay conexión con la base de datos (o con el servidor).
 * Aparece por la revisión periódica o apenas una operación falla por ese motivo,
 * y desaparece solo cuando la conexión vuelve (recargando los datos en pantalla).
 */
export function ConnectionMonitor() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const pathname = usePathname();
  const [problem, setProblem] = useState<ConnectionProblem | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>(lastUpdateInfo);
  const problemRef = useRef<ConnectionProblem | null>(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    const result = await checkConnection();
    setChecking(false);
    setUpdateInfo(lastUpdateInfo);
    const previous = problemRef.current;
    problemRef.current = result;
    setProblem(result);
    if (previous && !result) {
      toast.success("Conexión restablecida.");
      void queryClient.invalidateQueries();
    }
  }, [queryClient, toast]);

  // Revisión periódica: más seguida mientras no hay conexión.
  const timerRef = useRef<number | undefined>(undefined);
  const scheduleRef = useRef<(delay: number) => void>(() => undefined);
  scheduleRef.current = (delay: number) => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      await runCheck();
      scheduleRef.current(problemRef.current ? CHECK_DOWN_MS : CHECK_OK_MS);
    }, delay);
  };

  useEffect(() => {
    scheduleRef.current(0);
    return () => window.clearTimeout(timerRef.current);
  }, []);

  // Una operación falló por falta de conexión: se avisa de inmediato y se revisa seguido.
  useEffect(() => {
    const onProblem = (event: Event) => {
      const detail = (event as CustomEvent<ConnectionProblem>).detail;
      if (!problemRef.current) {
        problemRef.current = detail;
        setProblem(detail);
        scheduleRef.current(CHECK_DOWN_MS);
      }
    };
    const onOnline = () => scheduleRef.current(0);
    window.addEventListener(CONNECTION_EVENT, onProblem);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener(CONNECTION_EVENT, onProblem);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // En la pantalla de conexión el aviso sobra: ahí mismo se corrige.
  if (pathname?.startsWith("/configuracion-inicial")) {
    return null;
  }

  if (!problem) {
    if (updateInfo.outdated) {
      return <OutdatedNotice updateAvailable={updateInfo.updateAvailable} />;
    }
    if (updateInfo.updateAvailable && (user?.role === "ADMIN" || user?.role === "SUPERADMIN")) {
      return <NewVersionNotice version={updateInfo.updateAvailable} />;
    }
    return null;
  }

  const message = MESSAGES[problem];
  const Icon = problem === "database" ? DatabaseZap : ServerOff;

  return (
    <div className="no-print fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-3 sm:px-4" role="alert" aria-live="assertive">
      <div className="flex w-full max-w-3xl flex-col gap-3 rounded-[20px] border border-rose-200 bg-white px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{message.title}</p>
            <p className="mt-0.5 text-sm text-slate-600">{message.text}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 sm:justify-end">
          {problem === "database" ? (
            // Sin base no se puede iniciar sesión: la conexión se corrige fuera del sistema.
            <Link href="/configuracion-inicial" className="grid flex-1 sm:flex-none">
              <Button variant="secondary" size="sm" type="button">
                Cambiar conexión
              </Button>
            </Link>
          ) : null}
          <Button size="sm" type="button" className="flex-1 sm:flex-none" disabled={checking} onClick={() => scheduleRef.current(0)}>
            <RefreshCw className={checking ? "mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" : "mr-2 h-4 w-4"} aria-hidden />
            {checking ? "Revisando..." : "Reintentar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Caja desactualizada: la base ya tiene una versión más nueva y el sistema no deja
 * operar. Se actualiza con un clic (sin iniciar sesión, desde esta PC).
 */
function OutdatedNotice({ updateAvailable }: { updateAvailable: string | null }) {
  const toast = useToast();
  const [updating, setUpdating] = useState(false);

  const update = async () => {
    setUpdating(true);
    try {
      await updatesService.required();
      // El sistema se reinicia; las pantallas se recargan solas al volver con la versión nueva.
    } catch (error) {
      setUpdating(false);
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="no-print fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-3 sm:px-4" role="alert" aria-live="assertive">
      <div className="flex w-full max-w-3xl flex-col gap-3 rounded-[20px] border border-amber-200 bg-white px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.18)] sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Download className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{updating ? "Actualizando esta caja..." : "Esta caja necesita actualizarse"}</p>
            <p className="mt-0.5 text-sm text-slate-600">
              {updating
                ? "Se descarga la versión nueva y el sistema se reinicia. La pantalla se recarga sola; no cierres el programa."
                : updateAvailable
                  ? `Otra caja ya actualizó la base de datos. Instala la versión ${updateAvailable} para seguir trabajando.`
                  : "Otra caja ya actualizó la base de datos. Instala la versión nueva con el instalador para seguir trabajando."}
            </p>
          </div>
        </div>
        {updateAvailable ? (
          <Button size="sm" type="button" className="shrink-0" disabled={updating} onClick={() => void update()}>
            {updating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {updating ? "Actualizando..." : "Actualizar ahora"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const DISMISSED_KEY = "facturacion:version-nueva-vista";

/** Aviso discreto para administradores: hay una versión nueva (instalarla es opcional). */
function NewVersionNotice({ version }: { version: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISSED_KEY) === version;
    } catch {
      return false;
    }
  });

  if (dismissed) {
    return null;
  }

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, version);
    } catch {
      // Sin almacenamiento: se oculta solo en esta pantalla.
    }
    setDismissed(true);
  };

  return (
    <div className="no-print fixed bottom-4 right-4 z-[55] w-[calc(100%-2rem)] max-w-sm rounded-[20px] border border-border bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.18)]" role="status">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Versión {version} disponible</p>
          <p className="mt-0.5 text-sm text-slate-600">Puedes instalarla en esta caja cuando te convenga.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/actualizaciones" onClick={dismiss}>
              <Button size="sm" type="button">Ver novedades</Button>
            </Link>
            <Button size="sm" variant="ghost" type="button" onClick={dismiss}>
              Más tarde
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
