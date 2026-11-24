import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

import { APP_NAME, INSTALL_DIR, INSTALLED_EXE, sumatraPdfPath } from "./runtime";

/**
 * Instalación del .exe con doble clic: se copia a %LOCALAPPDATA%, queda iniciando
 * oculto con Windows, aparece en "Aplicaciones" para desinstalarlo y se inicia.
 */

const LAUNCHER = path.join(INSTALL_DIR, "iniciar-agente.vbs");
const UNINSTALL_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FacturacionPrintAgent";

function startupShortcut() {
  const appData = process.env.APPDATA ?? "";
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Facturacion - Agente de impresion.lnk");
}

function powershell(script: string) {
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: true,
    stdio: "ignore"
  });
}

/** Detiene la copia instalada si está corriendo (no la que ejecuta la instalación). */
function stopInstalled() {
  try {
    powershell(
      `Get-CimInstance Win32_Process -Filter "Name = '${APP_NAME}.exe'" | Where-Object { $_.ExecutablePath -eq '${INSTALLED_EXE.replace(/'/g, "''")}' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
    );
  } catch {
    // No estaba corriendo.
  }
}

function registerUninstall(version: string) {
  const values: Array<[string, string, string]> = [
    ["DisplayName", "REG_SZ", "Agente de impresión (Facturación)"],
    ["DisplayVersion", "REG_SZ", version],
    ["Publisher", "REG_SZ", "Facturación"],
    ["InstallLocation", "REG_SZ", INSTALL_DIR],
    ["DisplayIcon", "REG_SZ", INSTALLED_EXE],
    ["UninstallString", "REG_SZ", `"${INSTALLED_EXE}" --uninstall`],
    ["NoModify", "REG_DWORD", "1"],
    ["NoRepair", "REG_DWORD", "1"]
  ];

  for (const [name, type, data] of values) {
    execFileSync("reg.exe", ["add", UNINSTALL_KEY, "/v", name, "/t", type, "/d", data, "/f"], { windowsHide: true, stdio: "ignore" });
  }
}

/** Inicia la copia instalada oculta (sin ventana de consola). */
export function launchInstalled() {
  spawn("wscript.exe", [LAUNCHER], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

export function install(version: string) {
  console.log("Instalando el agente de impresión...");
  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  stopInstalled();

  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(INSTALLED_EXE).toLowerCase()) {
    fs.copyFileSync(process.execPath, INSTALLED_EXE);
  }

  // Extrae SumatraPDF (actualiza la copia si ya existía).
  fs.rmSync(path.join(INSTALL_DIR, "SumatraPDF.exe"), { force: true });
  sumatraPdfPath();

  fs.writeFileSync(LAUNCHER, `Set shell = CreateObject("WScript.Shell")\r\nshell.Run """${INSTALLED_EXE}"" --run", 0, False\r\n`, "latin1");

  const shortcut = startupShortcut().replace(/'/g, "''");
  powershell(
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${shortcut}'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '"${LAUNCHER.replace(/'/g, "''")}"'; $s.WorkingDirectory = '${INSTALL_DIR.replace(/'/g, "''")}'; $s.Save()`
  );

  registerUninstall(version);
  launchInstalled();

  console.log("");
  console.log("Listo. El agente de impresión quedó instalado y se inicia con Windows.");
  console.log("En el sistema abre Sistema > Impresoras y presiona volver a buscar.");
}

export function uninstall() {
  stopInstalled();
  fs.rmSync(startupShortcut(), { force: true });

  try {
    execFileSync("reg.exe", ["delete", UNINSTALL_KEY, "/f"], { windowsHide: true, stdio: "ignore" });
  } catch {
    // Ya no estaba registrado.
  }

  // El .exe en uso no se puede borrar a sí mismo: se elimina la carpeta después de salir.
  spawn("cmd.exe", ["/c", `timeout /t 2 /nobreak >nul & rmdir /s /q "${INSTALL_DIR}"`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }).unref();

  console.log("Agente de impresión desinstalado. La configuración de impresoras se conserva.");
}
