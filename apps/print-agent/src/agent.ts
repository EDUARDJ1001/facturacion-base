import fs from "fs";
import http from "http";
import os from "os";
import path from "path";

import { print } from "pdf-to-printer";

import { CONFIG_DIR, loadConfig, saveConfig, type AgentConfig } from "./config";
import { printWithWindows } from "./print-windows";
import { listPrinters } from "./printers";
import { sumatraPdfPath } from "./runtime";

/**
 * Agente local de impresión.
 *
 * Corre en cada PC de caja y solo escucha en 127.0.0.1: el navegador de ESTE
 * equipo le envía el PDF y el agente lo imprime sin diálogo en la impresora de
 * Windows asignada (tickets o carta). Así cada PC usa sus propias impresoras
 * (USB, red/IP, compartidas), sin pasar por el backend.
 */

const VERSION = "1.0.0";
const HOST = "127.0.0.1";
const PORT = Number(process.env.PRINT_AGENT_PORT ?? 17777);
const MAX_PDF_BYTES = 25 * 1024 * 1024;

type Kind = "ticket" | "letter";

// Mismo criterio que el backend (apps/backend/src/utils/local-origin.ts): localhost, IPs
// privadas, nombres de equipo sin dominio y dominios locales (.local, .lan...), más los
// orígenes configurados. Un sitio de internet no puede usar ninguno de estos orígenes.
const PRIVATE_IPV4 = /^(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
const LOCAL_SUFFIXES = [".local", ".lan", ".home", ".internal", ".home.arpa", ".localdomain"];

function isLocalNetworkOrigin(origin: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "[::1]" ||
    PRIVATE_IPV4.test(host) ||
    /^[a-z0-9-]+$/.test(host) ||
    LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

function originAllowed(origin: string | undefined, config: AgentConfig) {
  if (!origin) {
    // Peticiones sin Origin (curl, scripts locales): solo pueden venir de este equipo.
    return true;
  }

  const extra = (process.env.PRINT_AGENT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return isLocalNetworkOrigin(origin) || config.allowedOrigins.includes(origin) || extra.includes(origin);
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("El documento es demasiado grande."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function printPdf(pdf: Buffer, printer: string, kind: Kind, copies: number) {
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("El documento recibido no es un PDF.");
  }

  const file = path.join(os.tmpdir(), `facturacion-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(file, pdf);

  // Ticket: tamaño real (80 mm). Carta: reduce si la impresora tiene márgenes.
  const scale = kind === "ticket" ? "noscale" : "shrink";

  try {
    try {
      await print(file, { printer, silent: true, copies, scale, sumatraPdfPath: sumatraPdfPath() });
    } catch (sumatraError) {
      // SumatraPDF (32 bits) no puede con algunas impresoras, p. ej. las del "Modo de
      // impresión protegida" de Windows (Microsoft IPP Class Driver): se reintenta
      // con el lector de PDF e impresión de Windows (64 bits).
      console.warn(`[print-agent] SumatraPDF falló con "${printer}", se usa la impresión de Windows: ${(sumatraError as Error).message}`);
      await printWithWindows(file, printer, scale, copies);
    }
  } finally {
    fs.promises.unlink(file).catch(() => undefined);
  }
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const config = loadConfig();
  const origin = req.headers.origin;

  if (!originAllowed(origin, config)) {
    send(res, 403, { message: "Origen no permitido por el agente de impresión." });
    return;
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Chrome (Private Network Access): permite que una página de la red/internet hable con localhost.
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/status") {
    send(res, 200, {
      ok: true,
      version: VERSION,
      hostname: os.hostname(),
      ticketPrinter: config.ticketPrinter,
      letterPrinter: config.letterPrinter
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/printers") {
    send(res, 200, { items: await listPrinters() });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/config") {
    const body = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8") || "{}") as {
      ticketPrinter?: string | null;
      letterPrinter?: string | null;
    };
    const installed = new Set((await listPrinters()).map((printer) => printer.name));
    const next: AgentConfig = { ...config };

    for (const key of ["ticketPrinter", "letterPrinter"] as const) {
      if (body[key] === undefined) {
        continue;
      }
      const value = body[key] || null;
      if (value && !installed.has(value)) {
        send(res, 400, { message: `La impresora "${value}" no está instalada en este equipo.` });
        return;
      }
      next[key] = value;
    }

    saveConfig(next);
    send(res, 200, { ok: true, ticketPrinter: next.ticketPrinter, letterPrinter: next.letterPrinter });
    return;
  }

  if (req.method === "POST" && url.pathname === "/print") {
    const kind: Kind = url.searchParams.get("kind") === "letter" ? "letter" : "ticket";
    // ?printer= solo para "Imprimir prueba" en una impresora aún no asignada.
    const printer = url.searchParams.get("printer") || (kind === "ticket" ? config.ticketPrinter : config.letterPrinter);
    const copies = Math.min(Math.max(Number(url.searchParams.get("copies") ?? 1) || 1, 1), 5);

    if (!printer) {
      send(res, 409, { message: kind === "ticket" ? "Este equipo no tiene impresora de tickets configurada." : "Este equipo no tiene impresora de carta configurada." });
      return;
    }

    const pdf = await readBody(req, MAX_PDF_BYTES);
    await printPdf(pdf, printer, kind, copies);
    send(res, 200, { ok: true, printer });
    return;
  }

  send(res, 404, { message: "Ruta no encontrada." });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error: Error) => {
    console.error(`[print-agent] ${req.method} ${req.url}: ${error.message}`);
    if (!res.headersSent) {
      send(res, 500, { message: error.message || "Error inesperado del agente de impresión." });
    }
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[print-agent] El puerto ${PORT} ya está en uso (¿el agente ya está corriendo?).`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`[print-agent] v${VERSION} escuchando en http://${HOST}:${PORT} · configuración en ${CONFIG_DIR}`);
});
