"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Spinner } from "@/components/ui/spinner";

import { InventoryScreen } from "../inventory-screen";

/** Inventario → Movimientos (kardex). `?productId=` abre el kardex de un producto. */
function MovementsWithParams() {
  const params = useSearchParams();
  const productId = params.get("productId") ?? "";
  return <InventoryScreen key={productId} view="movements" productId={productId} />;
}

export default function InventoryMovementsPage() {
  return (
    <Suspense fallback={<Spinner label="Cargando movimientos..." />}>
      <MovementsWithParams />
    </Suspense>
  );
}
