"use client";

import { useQuery } from "@tanstack/react-query";

import { API_URL } from "@/lib/api-client";

export interface PendingFeature {
  name: string;
  screens: string[];
}

/**
 * Funciones desactivadas porque a la base le falta su actualización (por ejemplo
 * Bancos). El resto del sistema funciona; estas pantallas muestran un aviso.
 */
export function usePendingFeatures() {
  const query = useQuery({
    queryKey: ["health", "pending-features"],
    queryFn: async (): Promise<PendingFeature[]> => {
      const response = await fetch(`${API_URL}/api/health`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { pendingFeatures?: PendingFeature[] };
      return data.pendingFeatures ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false
  });

  const features = query.data ?? [];
  const featureForPath = (pathname: string) =>
    features.find((feature) => feature.screens.some((screen) => pathname === screen || pathname.startsWith(`${screen}/`))) ?? null;

  return { features, featureForPath };
}
