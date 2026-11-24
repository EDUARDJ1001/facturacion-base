/** Reglas de las pantallas de venta (las mismas que valida el backend). */

/** Máximo de líneas por factura, proforma o cotización. */
export const MAX_SALE_LINES = 60;

export const RTN_MESSAGE = "El RTN debe tener 14 dígitos (o 13 si es un DNI).";

/** RTN (14) o DNI (13): vacío o solo dígitos, se aceptan guiones y espacios al escribirlo. */
export function isValidRtn(value?: string | null) {
  const digits = (value ?? "").replace(/[\s-]/g, "");
  return digits === "" || /^\d{13,14}$/.test(digits);
}

/** "Consumidor final" sin RTN: el cliente genérico de la empresa. */
export function isGenericCustomerName(name?: string | null, rtn?: string | null) {
  const normalized = (name ?? "").trim().toLowerCase();
  return (normalized === "" || normalized === "consumidor final") && !(rtn ?? "").trim();
}
