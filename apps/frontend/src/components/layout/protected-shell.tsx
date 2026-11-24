"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { usePendingFeatures } from "@/hooks/use-pending-features";
import { AppHeader } from "@/components/layout/app-header";
import { AppMobileNav, AppSidebar } from "@/components/layout/app-sidebar";
import { PendingFeatureNotice, PendingFeaturesBanner } from "@/components/layout/pending-features";
import { Spinner } from "@/components/ui/spinner";

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, user } = useAuth();
  const { activeCompany, isHydrating } = useCompany();
  const { features: pendingFeatures, featureForPath } = usePendingFeatures();
  // Pantalla de una función desactivada por una actualización pendiente: se muestra el aviso.
  const pendingHere = featureForPath(pathname);
  const selectingCompany = pathname.startsWith("/select-company");
  // Si la base necesita una actualización no se puede entrar a ninguna empresa: el
  // SUPERADMIN revisa la base sin empresa activa.
  const databaseWithoutCompany = !activeCompany && user?.role === "SUPERADMIN" && pathname.startsWith("/base-de-datos");

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && !isHydrating && user && !activeCompany && !selectingCompany && !databaseWithoutCompany) {
      router.replace("/select-company");
    }
  }, [activeCompany, databaseWithoutCompany, isHydrating, isLoading, router, selectingCompany, user]);

  if (isLoading || isHydrating || !user) {
    return <Spinner label="Preparando tu espacio de trabajo..." />;
  }

  if (selectingCompany) {
    return <main className="grid-shell">{children}</main>;
  }

  if (databaseWithoutCompany) {
    return (
      <main className="grid-shell py-6">
        <Link href="/select-company" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          Volver a empresas
        </Link>
        {children}
      </main>
    );
  }

  if (!activeCompany) {
    return <Spinner label="Cargando empresa activa..." />;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <AppSidebar />
      <div className="min-w-0 pb-24 lg:pb-0">
        <AppHeader />
        <main className="grid-shell">
          {pendingFeatures.length > 0 ? (
            <div className="mb-6">
              <PendingFeaturesBanner features={pendingFeatures} />
            </div>
          ) : null}
          {pendingHere ? <PendingFeatureNotice feature={pendingHere} /> : children}
        </main>
      </div>
      <AppMobileNav />
    </div>
  );
}
