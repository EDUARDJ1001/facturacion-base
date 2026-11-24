"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, RefreshCw, TableProperties, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { systemService, type SchemaReport } from "@/services/system-service";

/**
 * Revisión de solo lectura: qué tablas faltan y cuáles tienen columnas distintas a las
 * que espera esta versión del programa. No cambia nada en la base.
 */
export function DatabaseStructure() {
  const query = useQuery({ queryKey: ["system", "database", "structure"], queryFn: () => systemService.databaseStructure() });
  const report = query.data;

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <TableProperties className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Estructura de la base</h2>
            <p className="text-sm text-slate-500">Compara las tablas de la base con las que necesita esta versión del programa. Solo revisa: no cambia nada.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" type="button" className="shrink-0" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw className={cn("mr-1.5 h-4 w-4", query.isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden />
          {query.isFetching ? "Revisando..." : "Revisar de nuevo"}
        </Button>
      </div>

      <div className="mt-4" aria-live="polite">
        {query.isLoading ? (
          <p className="text-sm text-slate-500">Revisando la estructura...</p>
        ) : query.isError ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            {(query.error as Error).message}
          </p>
        ) : report ? (
          <StructureResult report={report} />
        ) : null}
      </div>
    </Card>
  );
}

function StructureResult({ report }: { report: SchemaReport }) {
  if (!report.available) {
    return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Esta versión del programa no trae la estructura de referencia para comparar.</p>;
  }

  if (report.ok) {
    return (
      <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          La estructura coincide con esta versión: las {report.expectedTables} tablas del sistema existen y sus columnas son las esperadas.
          {report.extraTables.length > 0 ? ` Además hay ${report.extraTables.length} ${report.extraTables.length === 1 ? "tabla" : "tablas"} que no son del sistema.` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          La base no coincide con esta versión del programa
          {report.missingTables.length > 0 ? `: ${report.missingTables.length === 1 ? "falta 1 tabla" : `faltan ${report.missingTables.length} tablas`}` : ""}
          {report.missingTables.length > 0 && report.changedTables.length > 0 ? " y" : report.changedTables.length > 0 ? ":" : ""}
          {report.changedTables.length > 0 ? ` ${report.changedTables.length} ${report.changedTables.length === 1 ? "tabla tiene" : "tablas tienen"} columnas distintas` : ""}.
          {" "}Si hay actualizaciones pendientes, aplicarlas suele resolverlo.
        </p>
      </div>

      {report.missingTables.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Tablas que no existen</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {report.missingTables.map((table) => (
              <li key={table} className="rounded-full bg-rose-50 px-3 py-1 font-mono text-xs text-rose-800">
                {table}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.changedTables.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Tablas modificadas</h3>
          <ul className="mt-2 grid gap-2">
            {report.changedTables.map((table) => (
              <ChangedTable key={table.table} table={table} />
            ))}
          </ul>
        </section>
      ) : null}

      {report.extraTables.length > 0 ? (
        <p className="text-xs text-slate-500">
          Tablas que no son del sistema (no se tocan): <span className="font-mono">{report.extraTables.join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}

function ChangedTable({ table }: { table: SchemaReport["changedTables"][number] }) {
  const [open, setOpen] = useState(false);
  const count = table.missingColumns.length + table.extraColumns.length + table.changedColumns.length;
  const panelId = `tabla-${table.table}`;

  return (
    <li className="rounded-2xl border border-border">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <span className="font-mono font-semibold text-slate-900">{table.table}</span>
          <span className="ml-2 text-slate-500">
            {count} {count === 1 ? "diferencia" : "diferencias"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-500 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="grid gap-1.5 border-t border-border px-4 py-3 text-sm">
          {table.missingColumns.map((column) => (
            <p key={`f-${column}`}>
              <span className="font-mono">{column}</span>: <span className="text-rose-700">falta la columna</span>
            </p>
          ))}
          {table.extraColumns.map((column) => (
            <p key={`s-${column}`}>
              <span className="font-mono">{column}</span>: <span className="text-amber-800">columna que el programa no usa</span>
            </p>
          ))}
          {table.changedColumns.map((column) => (
            <p key={`c-${column.column}`}>
              <span className="font-mono">{column.column}</span>: se espera <span className="font-mono">{column.expected}</span>, en la base es <span className="font-mono">{column.actual}</span>
            </p>
          ))}
        </div>
      ) : null}
    </li>
  );
}
