/**
 * Ubica el compilador de Inno Setup 6 (ISCC.exe). Solo hace falta en la PC donde se
 * generan los instaladores; las PCs que instalan no necesitan nada.
 */
import fs from "node:fs";
import path from "node:path";

export function findInnoCompiler() {
  const candidates = [
    process.env.INNO_SETUP_ISCC,
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Inno Setup 6", "ISCC.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Inno Setup 6", "ISCC.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Inno Setup 6", "ISCC.exe")
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("No se encontró Inno Setup 6. Instálalo desde https://jrsoftware.org/isdl.php (o indica la ruta de ISCC.exe en INNO_SETUP_ISCC).");
  }
  return found;
}
