/** Permiso temporal del acceso de técnico (15 minutos, lo da el backend). Solo en esta pestaña. */
const KEY = "facturacion:tecnico";

export const TECHNICIAN_HEADER = "x-tecnico";

export function getTechnicianToken() {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setTechnicianToken(token: string | null) {
  try {
    if (token) window.sessionStorage.setItem(KEY, token);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: el acceso dura solo hasta salir de la pantalla.
  }
}

/** Encabezado con el permiso, si hay uno. */
export function technicianHeaders(): Record<string, string> {
  const token = typeof window === "undefined" ? null : getTechnicianToken();
  return token ? { [TECHNICIAN_HEADER]: token } : {};
}
