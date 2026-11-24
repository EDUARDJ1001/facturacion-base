import fs from "fs";
import os from "os";
import path from "path";

/**
 * Entorno de ejecución del agente: en desarrollo (tsx/node) o empaquetado como
 * AgenteImpresion.exe (Node Single Executable Application).
 */

export const APP_NAME = "AgenteImpresion";

/** Carpeta de instalación del .exe (por usuario, sin permisos de administrador). */
export const INSTALL_DIR = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "FacturacionPrintAgent");
export const INSTALLED_EXE = path.join(INSTALL_DIR, `${APP_NAME}.exe`);

type SeaModule = { isSea: () => boolean; getAsset: (key: string) => ArrayBuffer };

function seaModule(): SeaModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("node:sea") as SeaModule;
  } catch {
    return null;
  }
}

/** ¿Corre como .exe empaquetado? */
export function isPackaged() {
  return seaModule()?.isSea() ?? false;
}

/**
 * Ruta de SumatraPDF. Empaquetado: va dentro del .exe y se extrae a la carpeta de
 * instalación la primera vez. En desarrollo: undefined (pdf-to-printer usa el suyo).
 */
export function sumatraPdfPath(): string | undefined {
  const sea = seaModule();

  if (!sea?.isSea()) {
    return undefined;
  }

  const target = path.join(INSTALL_DIR, "SumatraPDF.exe");

  if (!fs.existsSync(target)) {
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
    fs.writeFileSync(target, Buffer.from(sea.getAsset("SumatraPDF.exe")));
  }

  return target;
}
