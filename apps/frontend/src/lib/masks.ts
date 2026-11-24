/**
 * Máscaras de captura (mientras se escribe). El servidor aplica las mismas reglas.
 */

/** RTN 0801-1990-123456 (14 dígitos) o DNI 0801-1990-12345 (13). */
export function formatRtn(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 14);
  return [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8)].filter(Boolean).join("-");
}

export function rtnDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/** Los 4 primeros dígitos son departamento (01 a 18) y municipio (no 00). */
export function validRtnPlace(digits: string) {
  const department = Number(digits.slice(0, 2));
  return department >= 1 && department <= 18 && digits.slice(2, 4) !== "00";
}

/** Teléfono de Honduras 9999-9999; si empieza con +, número de otro país (se deja como se escribe). */
export function formatPhone(value: string | null | undefined) {
  const text = value ?? "";
  if (text.trimStart().startsWith("+")) {
    return text.replace(/[^\d+\s()-]/g, "").slice(0, 20);
  }
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}

/** Misma regla que el servidor: 8 dígitos que empiezan con 2, 3, 7, 8 o 9, o con + y de 8 a 15 dígitos. */
export function validPhone(value: string) {
  const text = value.trim();
  if (!text) return true;
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+504")) return /^[23789]\d{7}$/.test(digits.slice(3));
  if (text.startsWith("+")) return digits.length >= 8 && digits.length <= 15;
  return /^[23789]\d{7}$/.test(digits);
}
