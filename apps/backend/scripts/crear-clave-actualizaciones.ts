/**
 * Clave para firmar las versiones del programa (actualizaciones sin reinstalar).
 *
 *   npm run clave:actualizaciones                      crea la clave (si falta) o la abre
 *   npm run clave:actualizaciones -- --cambiar         cambia la contraseña (también vencida)
 *   Opcional: --meses N  o  --vence MM/AA              vencimiento de la contraseña (12 meses)
 *
 * La privada queda cifrada en %USERPROFILE%\.facturacion\clave-actualizaciones.pem y la
 * pública se escribe en src/updates/public-key.ts (va dentro del programa).
 * Si se crea una clave nueva, las cajas ya instaladas solo aceptan versiones firmadas con
 * ella después de reinstalarlas con un instalador nuevo.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { privateKeyFile } from "./lib/key-paths";
import { changePassword, ensureProtectedKey, expiryFromArgs } from "./lib/protected-key";

const PUBLIC_FILE = path.resolve(__dirname, "../src/updates/public-key.ts");
const LABEL = "actualizaciones";

function writePublic(key: crypto.KeyObject) {
  const pem = crypto.createPublicKey(key).export({ type: "spki", format: "pem" }).toString();
  fs.writeFileSync(
    PUBLIC_FILE,
    [
      "/**",
      " * Clave pública de las actualizaciones (la privada solo está en la PC que publica).",
      " * Generada con: npm run clave:actualizaciones",
      " * Vacía = todavía no se creó: no se pueden instalar actualizaciones.",
      " */",
      `export const UPDATES_PUBLIC_KEY = ${JSON.stringify(pem)};`,
      ""
    ].join("\n")
  );
}

async function main() {
  const file = privateKeyFile();
  const expiry = expiryFromArgs(process.argv.slice(2));
  if (process.argv.includes("--cambiar")) {
    await changePassword([{ file, label: LABEL }], expiry);
    console.log("Contraseña cambiada. La clave es la misma: las cajas no notan nada.");
    return;
  }
  const { key, status } = await ensureProtectedKey(file, LABEL, expiry);
  writePublic(key);
  console.log(status === "created" ? "Clave de actualizaciones creada." : "Clave de actualizaciones lista.");
  console.log(`  Privada: ${file} (cifrada)`);
  console.log(`  Pública: ${PUBLIC_FILE}`);
  if (status === "created") console.log("Guarda una copia del archivo .pem y la contraseña en un lugar seguro.");
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => process.stdin.pause());
