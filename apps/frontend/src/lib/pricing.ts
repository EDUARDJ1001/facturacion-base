/**
 * Cálculos de precio e ISV con el mismo redondeo que usa la factura
 * (backend: invoices.service, ISV por línea redondeado a 2 decimales).
 * El precio del producto siempre se guarda SIN ISV.
 */

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** ISV de un precio sin ISV. */
export function taxOf(base: number, rate: number) {
  return round2((base * rate) / 100);
}

/** Lo que paga el cliente por 1 unidad. */
export function totalWithTax(base: number, rate: number) {
  return round2(base + taxOf(base, rate));
}

/**
 * Precio sin ISV a partir del precio final que paga el cliente. Busca, alrededor
 * de la división exacta, el valor que al sumarle el ISV da justo el precio final;
 * si ninguno lo da (por redondeo), el más cercano.
 */
export function baseFromFinal(final: number, rate: number) {
  if (!rate || final <= 0) {
    return round2(Math.max(final, 0));
  }
  const approx = round2(final / (1 + rate / 100));
  let best = approx;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let step = -3; step <= 3; step += 1) {
    const candidate = round2(approx + step / 100);
    if (candidate < 0) continue;
    const diff = Math.abs(totalWithTax(candidate, rate) - final);
    if (diff < bestDiff - 1e-9) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

const PRICE_MODE_KEY = "facturacion:product-price-includes-tax";

/** Preferencia de este equipo: escribir el precio con ISV incluido. */
export function getPriceIncludesTax() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(PRICE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPriceIncludesTax(value: boolean) {
  try {
    window.localStorage.setItem(PRICE_MODE_KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento disponible: solo dura mientras la pantalla esté abierta.
  }
}
