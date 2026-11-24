const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
const DIEZ_DIECINUEVE = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve"];
const DECENAS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function decenas(numero: number): string {
  if (numero < 10) return UNIDADES[numero] ?? "";
  if (numero < 20) return DIEZ_DIECINUEVE[numero - 10] ?? "";
  if (numero < 30) return numero === 20 ? "veinte" : `veinti${decenas(numero - 20)}`;
  const d = Math.floor(numero / 10);
  const u = numero % 10;
  return u === 0 ? DECENAS[d] ?? "" : `${DECENAS[d]} y ${UNIDADES[u]}`;
}

function centenas(numero: number): string {
  if (numero < 100) return decenas(numero);
  if (numero === 100) return "cien";
  const c = Math.floor(numero / 100);
  const r = numero % 100;
  return `${CENTENAS[c]}${r > 0 ? ` ${decenas(r)}` : ""}`.trim();
}

function miles(numero: number): string {
  if (numero < 1000) return centenas(numero);
  const m = Math.floor(numero / 1000);
  const r = numero % 1000;
  return `${m === 1 ? "mil" : `${centenas(m)} mil`}${r > 0 ? ` ${centenas(r)}` : ""}`.trim();
}

function millones(numero: number): string {
  if (numero < 1000000) return miles(numero);
  const m = Math.floor(numero / 1000000);
  const r = numero % 1000000;
  return `${m === 1 ? "un millon" : `${miles(m)} millones`}${r > 0 ? ` ${miles(r)}` : ""}`.trim();
}

export function amountToWords(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const entero = Math.floor(safeValue);
  const decimales = Math.round((safeValue - entero) * 100);
  return `${millones(entero)} lempiras con ${decimales.toString().padStart(2, "0")}/100`.toUpperCase();
}
