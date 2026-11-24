import { apiRequest } from "@/lib/api-client";

export interface InstalledVersion {
  version: string;
  date: string | null;
  notes: string;
  current: boolean;
}

export interface UpdatesStatus {
  /** Solo la versión de escritorio (caja) se actualiza desde aquí. */
  supported: boolean;
  configured: boolean;
  current: string;
  available: { version: string; date: string; notes: string; size: number; needsInstaller: boolean } | null;
  checkedAt: string | null;
  error: string | null;
  busy: "descargando" | "instalando" | "reiniciando" | null;
  installed: InstalledVersion[];
}

export const updatesService = {
  status: () => apiRequest<UpdatesStatus>("/api/system/updates"),
  check: () => apiRequest<UpdatesStatus>("/api/system/updates/check", { method: "POST" }),
  apply: () => apiRequest<{ version: string }>("/api/system/updates/apply", { method: "POST" }),
  /** Caja bloqueada por estar desactualizada: sin sesión, desde la misma PC. */
  required: () => apiRequest<{ version: string }>("/api/system/updates/required", { method: "POST" })
};
