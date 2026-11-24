"use client";

import { ArrowLeftRight, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";

export function AppHeader() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { activeCompany, clearCompany } = useCompany();

  return (
    <header
      className="no-print sticky top-0 z-20 flex flex-col gap-4 border-b border-white/50 px-4 py-3 backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-4"
      style={{
        background: "linear-gradient(135deg, rgba(var(--brand), 0.08), rgba(var(--brand-alt), 0.04))"
      }}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {activeCompany?.logoUrl ? (
          <div className="hidden rounded-[22px] border border-white/60 bg-white/90 px-4 py-3 shadow-sm sm:flex">
            <img
              src={activeCompany.logoUrl}
              alt={`Logo de ${activeCompany.commercialName}`}
              className="h-10 w-auto max-w-[150px] object-contain"
            />
          </div>
        ) : null}
        <div className="min-w-0">
          <Badge>{activeCompany?.code ?? "Sin empresa"}</Badge>
          <h1 className="mt-2 truncate text-xl font-semibold text-slate-900 sm:text-2xl">{activeCompany?.commercialName ?? "Selecciona una empresa"}</h1>
          <p className="truncate text-sm text-slate-600">{user?.fullName ?? "Sin sesión"}</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            clearCompany();
            router.push("/select-company");
          }}
          type="button"
          className="px-3 sm:px-5"
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Cambiar empresa</span>
          <span className="ml-2 sm:hidden">Empresa</span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          type="button"
          className="px-3 sm:px-5"
        >
          <LogOut className="h-4 w-4" />
          <span className="ml-2">Salir</span>
        </Button>
      </div>
    </header>
  );
}
