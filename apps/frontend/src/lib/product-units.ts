import { isCountableUnit, isServiceUnit } from "@/lib/inventory-rules";

/**
 * Unidades de medida sugeridas. La unidad define si el producto se vende por
 * piezas enteras (UND, CAJA...) o admite decimales (KG, LT...), igual en
 * facturas, entradas, ajustes y kardex.
 */
export const PRODUCT_UNITS: Array<{ value: string; label: string }> = [
  { value: "UND", label: "Unidad" },
  { value: "PAR", label: "Par" },
  { value: "CAJA", label: "Caja" },
  { value: "PAQ", label: "Paquete" },
  { value: "DOC", label: "Docena" },
  { value: "JUEGO", label: "Juego" },
  { value: "ROLLO", label: "Rollo" },
  { value: "BOLSA", label: "Bolsa" },
  { value: "BOTELLA", label: "Botella" },
  { value: "KG", label: "Kilogramo" },
  { value: "LB", label: "Libra" },
  { value: "G", label: "Gramo" },
  { value: "LT", label: "Litro" },
  { value: "ML", label: "Mililitro" },
  { value: "GAL", label: "Galón" },
  { value: "MT", label: "Metro" },
  { value: "PIE", label: "Pie" },
  { value: "M2", label: "Metro cuadrado" },
  { value: "SERV", label: "Servicio" },
  { value: "HORA", label: "Hora" },
  { value: "DIA", label: "Día" },
  { value: "MES", label: "Mes" },
  { value: "VISITA", label: "Visita" }
];

/** Unidades que ofrece la pantalla según el tipo: servicio (por servicio o tiempo) o producto (el resto). */
export function unitsForType(type: "PRODUCTO" | "SERVICIO") {
  return PRODUCT_UNITS.filter((item) => (type === "SERVICIO" ? isServiceUnit(item.value) : !isServiceUnit(item.value)));
}

export function unitLabel(unit: string) {
  const code = unit.trim().toUpperCase();
  return PRODUCT_UNITS.find((item) => item.value === code)?.label ?? code;
}

/** "Se vende por piezas enteras" o "Admite decimales". */
export function unitRule(unit: string) {
  return isCountableUnit(unit) ? "Solo cantidades enteras" : "Admite decimales (hasta 2)";
}

/** Cantidad según la unidad: entera para piezas, con 2 decimales para medidas. */
export function formatQuantity(value: number, unit: string) {
  return isCountableUnit(unit) ? String(Math.round(value)) : value.toFixed(2);
}
