"use client";

import { DatabaseZap, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { PendingFeature } from "@/hooks/use-pending-features";

const DISMISSED_KEY = "facturacion:aviso-funciones-pendientes";

function joinNames(features: PendingFeature[]) {
  const names = features.map((feature) => feature.name);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

/** Aviso general: hay una actualización pendiente y qué no está disponible por ahora. */
export function PendingFeaturesBanner({ features }: { features: PendingFeature[] }) {
  const { user } = useAuth();
  const key = features.map((feature) => feature.name).join("|");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(DISMISSED_KEY) === key;
    } catch {
      return false;
    }
  });

  if (features.length === 0 || dismissed) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, key);
    } catch {
      // Sin almacenamiento: se oculta solo en esta pantalla.
    }
    setDismissed(true);
  };

  return (
    <div className="no-print flex items-start gap-3 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Actualización de la base pendiente.</span> Por ahora no está disponible: {joinNames(features)}. El resto del sistema funciona
        normal.{" "}
        {user?.role === "SUPERADMIN" ? (
          <Link href="/base-de-datos" className="font-semibold underline underline-offset-2">
            Aplicar en Base de datos
          </Link>
        ) : (
          "Avisa al administrador para que la aplique."
        )}
      </p>
      <button type="button" onClick={dismiss} className="shrink-0 rounded-full p-1 text-amber-700 hover:bg-amber-100" aria-label="Ocultar aviso">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** En lugar de una pantalla cuya función está desactivada. */
export function PendingFeatureNotice({ feature }: { feature: PendingFeature }) {
  const { user } = useAuth();
  return (
    <Card className="mx-auto mt-6 grid max-w-xl justify-items-center gap-3 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <DatabaseZap className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold text-slate-900">{feature.name} no está disponible todavía</h1>
      <p className="text-sm text-slate-600">
        Esta función necesita una actualización de la base de datos que aún no se aplicó. El resto del sistema se puede usar normalmente.
      </p>
      {user?.role === "SUPERADMIN" ? (
        <Link href="/base-de-datos" className="mt-1 inline-flex h-11 items-center rounded-2xl bg-brand px-5 text-sm font-semibold text-white shadow-lg shadow-brand/20 hover:opacity-90">
          Ir a Base de datos
        </Link>
      ) : (
        <p className="text-sm font-medium text-slate-700">Avisa al administrador para que la aplique.</p>
      )}
    </Card>
  );
}
