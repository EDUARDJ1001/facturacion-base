import { execFile } from "child_process";
import fs from "fs";
import path from "path";

import { CONFIG_DIR } from "./config";

/**
 * Impresión con lo que trae Windows (sin SumatraPDF): el PDF se rasteriza con el
 * lector de PDF de Windows (Windows.Data.Pdf) y se imprime con System.Drawing en
 * PowerShell de 64 bits. Sirve para impresoras que SumatraPDF (32 bits) no puede
 * usar, como las del "Modo de impresión protegida" (Microsoft IPP Class Driver).
 */
const SCRIPT = String.raw`
param([string]$Pdf, [string]$Printer, [string]$Mode, [int]$Copies = 1)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTaskOp = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation__BACKTICK__1' })[0]
$asTaskAction = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function Await($op, [Type]$type) { $task = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait() | Out-Null; $task.Result }
function AwaitAction($op) { $asTaskAction.Invoke($null, @($op)).Wait() | Out-Null }

$settings = New-Object System.Drawing.Printing.PrinterSettings
$settings.PrinterName = $Printer
if (-not $settings.IsValid) { throw "La impresora '$Printer' no existe en este equipo." }

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Pdf)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])

# Páginas rasterizadas a 300 ppp (PdfPage.Size viene en DIP = 1/96 de pulgada).
$dpi = 300
$images = New-Object System.Collections.Generic.List[System.Drawing.Image]
for ($i = 0; $i -lt $doc.PageCount; $i++) {
  $page = $doc.GetPage($i)
  $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
  $options.DestinationWidth = [uint32][math]::Round($page.Size.Width * $dpi / 96)
  $options.DestinationHeight = [uint32][math]::Round($page.Size.Height * $dpi / 96)
  $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  AwaitAction ($page.RenderToStreamAsync($stream, $options))
  $source = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream.GetInputStreamAt(0))
  $memory = New-Object System.IO.MemoryStream
  $source.CopyTo($memory)
  $memory.Position = 0
  $images.Add([System.Drawing.Image]::FromStream($memory))
  $page.Dispose()
}

$print = New-Object System.Drawing.Printing.PrintDocument
$print.PrinterSettings = $settings
$print.PrinterSettings.Copies = [int16][math]::Max(1, $Copies)
$print.DocumentName = 'Facturacion'
$print.OriginAtMargins = $false
$print.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
# Sin ventana de progreso.
$print.PrintController = New-Object System.Drawing.Printing.StandardPrintController

$script:index = 0
$print.add_PrintPage({
  param($sender, $e)
  $image = $images[$script:index]
  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  # Tamaño real en centésimas de pulgada (unidad por defecto al imprimir).
  $width = $image.Width / $dpi * 100
  $height = $image.Height / $dpi * 100
  $area = $e.PageSettings.PrintableArea
  if ($Mode -eq 'noscale') {
    $e.Graphics.DrawImage($image, 0, 0, $width, $height)
  } else {
    # Carta: reduce (sin agrandar) para que quepa en el área imprimible.
    $scale = [math]::Min(1, [math]::Min($area.Width / $width, $area.Height / $height))
    $e.Graphics.DrawImage($image, 0, 0, $width * $scale, $height * $scale)
  }
  $script:index++
  $e.HasMorePages = $script:index -lt $images.Count
})
$print.Print()
foreach ($image in $images) { $image.Dispose() }
`.replace(/__BACKTICK__/g, "`"); // IAsyncOperation`1: el acento grave no cabe en la plantilla

const SCRIPT_FILE = path.join(CONFIG_DIR, "print-pdf.ps1");

function ensureScript() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  // BOM: Windows PowerShell 5 lee UTF-8 sin BOM como ANSI.
  const content = `\uFEFF${SCRIPT.trim()}\r\n`;
  if (!fs.existsSync(SCRIPT_FILE) || fs.readFileSync(SCRIPT_FILE, "utf8") !== content) {
    fs.writeFileSync(SCRIPT_FILE, content, "utf8");
  }
}

export function printWithWindows(pdfPath: string, printer: string, mode: "noscale" | "shrink", copies: number) {
  ensureScript();

  return new Promise<void>((resolve, reject) => {
    execFile(
      // 64 bits (Sysnative desde un proceso de 32 bits; System32 si ya es de 64).
      process.arch === "ia32" ? "C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe" : "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT_FILE, "-Pdf", pdfPath, "-Printer", printer, "-Mode", mode, "-Copies", String(copies)],
      { windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          const detail = stderr?.split(/\r?\n/).find((line) => line.trim() && !line.startsWith("At ") && !line.startsWith("+"));
          reject(new Error(detail?.trim() || error.message));
          return;
        }
        resolve();
      }
    );
  });
}
