/**
 * Genera instaladores/InstalarCaja-<versión>.exe con Inno Setup 6 (installer/caja.iss).
 *
 * Lleva el sistema completo (dist-exe/Facturacion del backend) y el agente de impresión;
 * instala en C:\Facturacion para todos los usuarios de la PC.
 *
 * Requisito (solo en la PC donde se compila): Inno Setup 6 instalado.
 * Uso: npm run build:caja-installer   (desde la raíz)
 *      npm run build:caja-installer --workspace print-agent -- --rapido
 *        reutiliza Facturacion/ y AgenteImpresion.exe ya compilados
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findInnoCompiler } from "../../../scripts/inno.mjs";

const agentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(agentDir, "../..");
const backendDir = path.join(rootDir, "apps", "backend");
const appDir = path.join(backendDir, "dist-exe", "Facturacion");
const agentExe = path.join(agentDir, "dist-exe", "AgenteImpresion.exe");
const version = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version ?? "1.0.0";
const outputDir = path.join(rootDir, "instaladores");
// En PowerShell npm se queda con "--": la opción llega como npm_config_rapido.
const quick = process.argv.includes("--rapido") || process.env.npm_config_rapido === "true";

function build(script, cwd, label) {
  console.log(`== Compilando ${label}...`);
  const result = spawnSync(process.execPath, [script], { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`No se pudo compilar ${label}.`);
  }
}

/** Facturacion.exe (lanzador) y la versión firmada del programa (scripts/build-exe.ts del backend). */
function buildBackend() {
  console.log("== Compilando Facturacion.exe...");
  const result = spawnSync("npm", ["run", "build:exe", "--workspace", "backend"], { cwd: rootDir, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error("No se pudo compilar Facturacion.exe.");
  }
}

const iscc = findInnoCompiler();

if (!quick || !fs.existsSync(path.join(appDir, "Facturacion.exe"))) {
  buildBackend();
}
if (!quick || !fs.existsSync(agentExe)) {
  build(path.join(agentDir, "scripts", "build-exe.mjs"), agentDir, "AgenteImpresion.exe");
}

console.log("\n== Creando el instalador con Inno Setup...");
fs.mkdirSync(outputDir, { recursive: true });
const result = spawnSync(
  iscc,
  ["/Q", `/DAppVersion=${version}`, `/DSourceApp=${appDir}`, `/DAgentExe=${agentExe}`, `/DOutputDir=${outputDir}`, path.join(agentDir, "installer", "caja.iss")],
  { stdio: "inherit" }
);
if (result.status !== 0) {
  throw new Error("Inno Setup no pudo crear el instalador.");
}

const target = path.join(outputDir, `InstalarCaja-${version}.exe`);
console.log(`\nListo: ${target} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
