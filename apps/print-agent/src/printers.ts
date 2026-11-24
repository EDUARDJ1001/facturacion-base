import { execFile } from "child_process";

export interface InstalledPrinter {
  name: string;
  isDefault: boolean;
  offline: boolean;
  /** Puerto de Windows: USB001, COM1, IP_192.168.1.50, \\PC2\Ticket, ... */
  port: string | null;
  /** usb | red | serial | compartida | virtual | otra */
  connection: string;
  driver: string | null;
}

interface Win32Printer {
  Name: string;
  Default: boolean;
  WorkOffline: boolean;
  PrinterStatus: number | null;
  PortName: string | null;
  DriverName: string | null;
  Network: boolean;
}

function connectionOf(printer: Win32Printer) {
  const port = (printer.PortName ?? "").toUpperCase();

  if (printer.Network || port.startsWith("\\\\")) {
    return "compartida";
  }
  // TMUSB / ESDPRT: puertos USB propios de los drivers de Epson.
  if (port.startsWith("USB") || port.startsWith("TMUSB") || port.startsWith("ESDPRT")) {
    return "usb";
  }
  if (port.startsWith("COM")) {
    return "serial";
  }
  if (port.startsWith("IP_") || port.startsWith("WSD") || /^\d{1,3}(\.\d{1,3}){3}/.test(port)) {
    return "red";
  }
  if (port.startsWith("PORTPROMPT") || port.startsWith("NUL") || port.startsWith("FILE") || port.includes("PDF") || port.startsWith("SHRFAX")) {
    return "virtual";
  }
  return "otra";
}

/** Impresoras instaladas en Windows en este equipo (las mismas que ve cualquier programa). */
export function listPrinters(): Promise<InstalledPrinter[]> {
  const script =
    "Get-CimInstance -ClassName Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus,PortName,DriverName,Network | ConvertTo-Json -Compress";

  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(new Error(`No se pudieron leer las impresoras de Windows: ${error.message}`));
          return;
        }

        const raw = stdout.trim();
        if (!raw) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(raw) as Win32Printer | Win32Printer[];
          const list = Array.isArray(parsed) ? parsed : [parsed];
          resolve(
            list
              .map((printer) => ({
                name: printer.Name,
                isDefault: Boolean(printer.Default),
                // PrinterStatus 7 = Offline en Win32_Printer.
                offline: Boolean(printer.WorkOffline) || printer.PrinterStatus === 7,
                port: printer.PortName ?? null,
                connection: connectionOf(printer),
                driver: printer.DriverName ?? null
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        } catch (parseError) {
          reject(new Error(`Respuesta inesperada al listar impresoras: ${(parseError as Error).message}`));
        }
      }
    );
  });
}
