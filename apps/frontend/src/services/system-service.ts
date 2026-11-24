import { apiRequest } from "@/lib/api-client";
import { technicianHeaders } from "@/lib/technician";

export type DatabaseClient = "mysql" | "mssql";

export const DATABASE_CLIENTS: Record<DatabaseClient, { label: string; port: number }> = {
  mysql: { label: "MySQL / MariaDB", port: 3306 },
  mssql: { label: "SQL Server", port: 1433 }
};

export interface DatabaseSettings {
  client: DatabaseClient;
  host: string;
  port: number;
  database: string;
  user: string;
  sslMode: "DISABLED" | "REQUIRED";
  hasSslCa: boolean;
  hasPassword: boolean;
}

export interface DatabaseCheck {
  client: DatabaseClient;
  version: string;
  tables: number;
  hasSchema: boolean;
  canInitialize: boolean;
  migrationsTracked: boolean;
  pendingMigrations: string[];
}

/** Actualización de estructura pendiente y si se puede aplicar sin perder datos. */
export interface PendingMigrationReview {
  file: string;
  /** Primera idea del objetivo, para mostrar. */
  title: string;
  summary: string;
  dataChange: string | null;
  /** Motivos por los que no se aplica (vacío = se puede). */
  problems: string[];
}

export interface DatabaseStatus extends Partial<DatabaseCheck> {
  settings: DatabaseSettings;
  connected: boolean;
  error?: string;
  envFile: string;
  pendingReview?: PendingMigrationReview[];
}

export interface DatabasePayload {
  client: DatabaseClient;
  host: string;
  port: number;
  database: string;
  user: string;
  /** Vacío = conserva la contraseña actual. */
  password?: string;
  sslMode: "DISABLED" | "REQUIRED";
  sslCa?: string;
}

/** Revisión de solo lectura de la estructura de la base contra esta versión. */
export interface SchemaReport {
  available: boolean;
  ok: boolean;
  expectedTables: number;
  missingTables: string[];
  changedTables: Array<{
    table: string;
    missingColumns: string[];
    extraColumns: string[];
    changedColumns: Array<{ column: string; expected: string; actual: string }>;
  }>;
  extraTables: string[];
}

export const systemService = {
  database: () => apiRequest<DatabaseStatus>("/api/system/database"),
  databaseStructure: () => apiRequest<SchemaReport>("/api/system/database/structure"),
  testDatabase: (payload: DatabasePayload) =>
    apiRequest<DatabaseCheck & { ok: boolean }>("/api/system/database/test", { method: "POST", body: JSON.stringify(payload) }),
  /** Aplica las actualizaciones pendientes, solo si ninguna puede perder datos. */
  migrateDatabase: () =>
    apiRequest<{ applied: string[]; pending: string[]; blocked: PendingMigrationReview[] }>("/api/system/database/migrate", { method: "POST" }),
  applyDatabase: (payload: DatabasePayload & { initialize?: boolean }) =>
    apiRequest<DatabaseCheck & { settings: DatabaseSettings }>("/api/system/database", { method: "PUT", body: JSON.stringify(payload) }),

  // Sin sesión y desde la misma PC: configuración inicial, recuperación cuando la base
  // configurada no responde, o acceso de técnico (permiso en el encabezado).
  setupStatus: () =>
    apiRequest<{ configured: boolean; connected: boolean; local: boolean; technician: boolean; settings?: DatabaseSettings }>("/api/setup/status", {
      headers: technicianHeaders()
    }),
  setupTest: (payload: DatabasePayload) =>
    apiRequest<DatabaseCheck & { ok: boolean }>("/api/setup/test", { method: "POST", body: JSON.stringify(payload), headers: technicianHeaders() }),
  setupApply: (payload: DatabasePayload & { initialize?: boolean }) =>
    apiRequest<DatabaseCheck & { settings: DatabaseSettings }>("/api/setup/apply", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: technicianHeaders()
    }),
  technicianLogin: (clave: string) => apiRequest<{ token: string }>("/api/setup/tecnico", { method: "POST", body: JSON.stringify({ clave }) })
};
