import path from "path";

import { install, uninstall } from "./installer";
import { INSTALLED_EXE, isPackaged } from "./runtime";

/**
 * Punto de entrada de AgenteImpresion.exe:
 *   - doble clic (fuera de la carpeta de instalación): se instala y se inicia
 *   - --run: corre el agente (lo usa el inicio automático con Windows)
 *   - --uninstall: lo quita (lo usa "Aplicaciones" de Windows)
 *   - --silencioso: se instala sin esperar una tecla (lo usa el instalador de caja)
 * En desarrollo (sin empaquetar) siempre corre el agente.
 */
const VERSION = "1.0.0";
const args = process.argv.slice(2);

function waitForKey(message: string) {
  console.log(message);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.once("data", () => process.exit(0));
  setTimeout(() => process.exit(0), 20000);
}

if (args.includes("--uninstall")) {
  uninstall();
  setTimeout(() => process.exit(0), 1500);
} else if (args.includes("--run") || !isPackaged()) {
  require("./agent");
} else if (path.resolve(process.execPath).toLowerCase() === path.resolve(INSTALLED_EXE).toLowerCase()) {
  // La copia instalada abierta con doble clic: se asegura de estar corriendo.
  require("./agent");
} else if (args.includes("--silencioso")) {
  try {
    // El instalador de caja muestra su propio avance: sin mensajes del agente.
    console.log = () => undefined;
    install(VERSION);
    setTimeout(() => process.exit(0), 1500);
  } catch (error) {
    console.error(`No se pudo instalar: ${(error as Error).message}`);
    process.exit(1);
  }
} else {
  try {
    install(VERSION);
    waitForKey("\nPresiona una tecla para cerrar.");
  } catch (error) {
    console.error(`No se pudo instalar: ${(error as Error).message}`);
    waitForKey("\nPresiona una tecla para cerrar.");
  }
}
