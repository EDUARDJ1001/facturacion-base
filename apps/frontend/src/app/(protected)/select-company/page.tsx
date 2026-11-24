"use client";

import { Building2, DatabaseZap, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";

import { NewCompanyModal } from "./new-company-modal";

export default function SelectCompanyPage() {
  const router = useRouter();
  const { companies, user, reloadProfile } = useAuth();
  const { activeCompany, selectCompany } = useCompany();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  // Motivo por el que no se pudo entrar (p. ej. la base necesita actualizarse).
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const toast = useToast();
  const isSuperadmin = user?.role === "SUPERADMIN";

  return (
    <section className="grid gap-6 py-6 sm:gap-8 sm:py-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="section-title">Empresa activa</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">Selecciona con cuál empresa vas a trabajar</h1>
          <p className="mt-4 text-slate-600">
            Cada empresa tiene su propia configuración fiscal, series, clientes, inventario y facturas.
          </p>
        </div>
        {isSuperadmin ? (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva empresa
          </Button>
        ) : null}
      </div>

      {blockedMessage ? (
        <Card className="flex flex-col gap-4 border-amber-200 p-4 sm:flex-row sm:items-center sm:p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <DatabaseZap className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">No se puede entrar todavía</p>
            <p className="mt-1 text-sm text-slate-600">{blockedMessage}</p>
          </div>
          {isSuperadmin ? (
            <Link href="/base-de-datos" className="shrink-0">
              <Button type="button">Revisar base de datos</Button>
            </Link>
          ) : null}
        </Card>
      ) : null}

      {companies.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Building2 className="h-7 w-7" />
          </span>
          <p className="text-lg font-semibold text-slate-900">Todavía no hay empresas</p>
          <p className="max-w-md text-sm text-slate-500">
            {isSuperadmin
              ? "Crea la primera empresa para empezar a facturar."
              : "Tu usuario no tiene empresas asignadas. Pide acceso a un administrador."}
          </p>
          {isSuperadmin ? (
            <Button type="button" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear empresa
            </Button>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {companies.map((company) => (
          <Card key={company.id} className="overflow-hidden p-0">
            <div className="h-2 w-full" style={{ background: company.primaryColor ?? "#0f172a" }} />
            <div className="p-4 sm:p-6">
              <div className="flex items-start justify-center gap-4">
                <div className="text-center">
                  <p className="section-title">{company.code}</p>
                  {company.logoUrl ? (
                    <div className="mt-4 mx-auto flex w-fit justify-center rounded-[24px] border border-border bg-white px-5 py-4 shadow-sm">
                      <img
                        src={company.logoUrl}
                        alt={`Logo de ${company.commercialName}`}
                        className="h-14 w-auto max-w-[180px] object-contain"
                      />
                    </div>
                  ) : null}
                  <h2 className="mt-4 text-xl font-semibold text-slate-900 sm:text-2xl">{company.commercialName}</h2>
                  <p className="mt-2 text-sm text-slate-600">{company.legalName}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 rounded-[24px] bg-slate-50 p-4 text-sm text-slate-600">
                <p>RTN: {company.rtn}</p>
              </div>

              <Button
                className="mt-6 w-full"
                variant={activeCompany?.id === company.id ? "secondary" : "primary"}
                type="button"
                disabled={busyId === company.id}
                onClick={async () => {
                  setBusyId(company.id);
                  try {
                    await selectCompany(company.id);
                    setBlockedMessage(null);
                    router.push("/dashboard");
                  } catch (error) {
                    setBlockedMessage((error as Error).message);
                    toast.error((error as Error).message);
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                {busyId === company.id ? "Entrando..." : activeCompany?.id === company.id ? "Empresa actual" : "Trabajar con esta empresa"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <NewCompanyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (company) => {
          setCreating(false);
          await reloadProfile();
          // Entra a la empresa nueva y lleva directo a registrar el CAI.
          await selectCompany(company.id);
          router.push("/settings");
        }}
      />
    </section>
  );
}
