/**
 * Genera dist-exe/AgenteImpresion.exe (Node Single Executable Application):
 *   1. empaqueta el agente en un solo .cjs (esbuild)
 *   2. crea el blob SEA con SumatraPDF como recurso interno
 *   3. copia node.exe y le inyecta el blob (postject)
 * Uso: npm run build:exe --workspace print-agent   (o desde la raíz: npm run build:print-agent-exe)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-exe");
const bundle = path.join(out, "agent.cjs");
const blob = path.join(out, "sea-prep.blob");
const exe = path.join(out, "AgenteImpresion.exe");

const sumatra = path.join(path.dirname(require.resolve("pdf-to-printer")), "SumatraPDF-3.4.6-32.exe");
if (!fs.existsSync(sumatra)) {
  throw new Error(`No se encontró SumatraPDF en ${sumatra}`);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log("1/3 Empaquetando el agente...");
await build({
  entryPoints: [path.join(root, "src", "main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: bundle,
  logLevel: "warning"
});

console.log("2/3 Creando el ejecutable...");
const seaConfig = path.join(out, "sea-config.json");
fs.writeFileSync(
  seaConfig,
  JSON.stringify(
    {
      main: bundle,
      output: blob,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      assets: { "SumatraPDF.exe": sumatra }
    },
    null,
    2
  )
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

fs.copyFileSync(process.execPath, exe);

console.log("3/3 Inyectando el agente en AgenteImpresion.exe...");
const postject = path.join(path.dirname(require.resolve("postject/package.json")), "dist", "cli.js");
execFileSync(
  process.execPath,
  [postject, exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"],
  { stdio: "inherit" }
);

for (const file of [bundle, blob, seaConfig]) {
  fs.rmSync(file, { force: true });
}

const size = (fs.statSync(exe).size / 1024 / 1024).toFixed(1);
console.log(`\nListo: ${exe} (${size} MB)`);
