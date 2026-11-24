import type { InventoryMovement } from "@/types/api";

/** Nombre claro de cada tipo de movimiento del kardex. */
export const MOVEMENT_LABELS: Record<string, string> = {
  STOCK_INICIAL: "Existencia inicial",
  ENTRADA: "Entrada de mercadería",
  SALIDA: "Salida",
  AJUSTE_POSITIVO: "Ajuste de aumento",
  AJUSTE_NEGATIVO: "Ajuste de disminución",
  VENTA: "Venta",
  ANULACION_VENTA: "Anulación de venta"
};

export function movementLabel(type: string) {
  return MOVEMENT_LABELS[type] ?? type;
}

/** true si el movimiento aumentó la existencia. */
export function movementIsIn(movement: Pick<InventoryMovement, "stockBefore" | "stockAfter">) {
  return movement.stockAfter >= movement.stockBefore;
}

/** Con quién fue el movimiento: proveedor en entradas, cliente en ventas. */
export function movementParty(movement: InventoryMovement) {
  if (movement.supplierName) return `Proveedor: ${movement.supplierName}`;
  if (movement.customerName) return `Cliente: ${movement.customerName}`;
  return null;
}

/** Documento que originó el movimiento (factura, entrada o nota). */
export function movementReference(movement: InventoryMovement) {
  if (movement.invoiceNumber) return `Factura ${movement.invoiceNumber}`;
  if (movement.entryDocumentNumber) return `Entrada ${movement.entryDocumentNumber}`;
  if (movement.entryId) return `Entrada #${movement.entryId}`;
  return movement.notes ?? "Movimiento manual";
}
