/**
 * Dónde está la clave privada para firmar versiones (solo en la PC que publica):
 * %USERPROFILE%\.facturacion\clave-actualizaciones.pem
 */
import os from "os";
import path from "path";

/** Clave privada para firmar versiones (fuera del repositorio, protegida con contraseña). */
export function privateKeyFile() {
  return process.env.FACTURACION_CLAVE_ACTUALIZACIONES ?? path.join(os.homedir(), ".facturacion", "clave-actualizaciones.pem");
}
