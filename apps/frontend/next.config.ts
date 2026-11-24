import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Versión de escritorio: NEXT_OUTPUT=export genera archivos estáticos en `out/`,
// que sirve el backend local de la aplicación.
const desktopExport = process.env.NEXT_OUTPUT === "export";

// `next dev` usa su propia carpeta (.next-dev). `next build` (web o escritorio) trabaja
// siempre en .next: al exportar, Next la fuerza aunque se configure otra. Si el modo
// desarrollo compartiera .next, cada compilación le pisaría los archivos y las
// pantallas fallarían ("__webpack_modules__[moduleId] is not a function") o cargarían
// código de otra pantalla.
export default function nextConfig(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    distDir: desktopExport ? "out" : phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    ...(desktopExport ? { output: "export" as const } : {}),
    images: {
      unoptimized: true
    },
    allowedDevOrigins: ["192.168.1.125"]
  };
}
