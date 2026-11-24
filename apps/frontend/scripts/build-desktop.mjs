/**
 * Compila el frontend para la versión de escritorio: archivos estáticos en `out/`
 * que sirve el backend local de cada caja (mismo origen: la API va en rutas relativas).
 * La versión web (`npm run build` / `next start`) no cambia.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = require.resolve("next/dist/bin/next");

const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT: "export", NEXT_PUBLIC_API_URL: "" }
});

process.exit(result.status ?? 1);
