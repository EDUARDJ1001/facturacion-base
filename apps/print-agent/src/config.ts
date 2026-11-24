import fs from "fs";
import os from "os";
import path from "path";

/**
 * Configuración de ESTE equipo. Vive en el perfil de Windows (no en el navegador),
 * así sobrevive aunque se borren los datos del navegador.
 */
export interface AgentConfig {
  /** Impresora para tickets (80 mm); null = sin configurar. */
  ticketPrinter: string | null;
  /** Impresora para documentos carta; null = sin configurar. */
  letterPrinter: string | null;
  /** Orígenes extra (además de localhost y la LAN privada), p. ej. https://facturas.midominio.com */
  allowedOrigins: string[];
}

const DEFAULT_CONFIG: AgentConfig = { ticketPrinter: null, letterPrinter: null, allowedOrigins: [] };

export const CONFIG_DIR = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "FacturacionPrintAgent");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export function loadConfig(): AgentConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<AgentConfig>;
    return {
      ticketPrinter: typeof raw.ticketPrinter === "string" && raw.ticketPrinter ? raw.ticketPrinter : null,
      letterPrinter: typeof raw.letterPrinter === "string" && raw.letterPrinter ? raw.letterPrinter : null,
      allowedOrigins: Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins.filter((item): item is string => typeof item === "string") : []
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: AgentConfig) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}
