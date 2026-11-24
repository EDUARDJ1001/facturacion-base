# ============================================================
# Instala el agente local de impresión en ESTE equipo (sin permisos de admin).
#
#   1. Compila apps/print-agent
#   2. Lo copia a %LOCALAPPDATA%\FacturacionPrintAgent\app e instala su dependencia
#   3. Lo registra para iniciar oculto con Windows (carpeta Inicio del usuario)
#   4. Lo arranca ahora
#
# Requisito: Node.js 18+ instalado en el equipo.
# Uso (desde la raíz del proyecto):  npm run install:print-agent
# Desinstalar:                       powershell -File scripts/install-print-agent.ps1 -Uninstall
# ============================================================
param(
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$installDir = Join-Path $env:LOCALAPPDATA "FacturacionPrintAgent\app"
$launcher = Join-Path $env:LOCALAPPDATA "FacturacionPrintAgent\start-print-agent.vbs"
$startupLink = Join-Path ([Environment]::GetFolderPath("Startup")) "Facturacion - Agente de impresion.lnk"

function Stop-Agent {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*FacturacionPrintAgent*agent.js*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

if ($Uninstall) {
  Stop-Agent
  Remove-Item $startupLink -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $env:LOCALAPPDATA "FacturacionPrintAgent") -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Agente de impresión desinstalado. La configuración de impresoras (%APPDATA%\FacturacionPrintAgent) se conserva."
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "Node.js no está instalado en este equipo. Instálalo desde https://nodejs.org y vuelve a ejecutar."
}

Write-Host "Compilando agente..."
Push-Location $root
npm run build --workspace print-agent
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "No se pudo compilar el agente de impresión." }
Pop-Location

Write-Host "Copiando a $installDir ..."
Stop-Agent
Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $installDir | Out-Null
Copy-Item (Join-Path $root "apps\print-agent\dist") $installDir -Recurse
Copy-Item (Join-Path $root "apps\print-agent\package.json") $installDir

Push-Location $installDir
npm install --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "No se pudo instalar la dependencia del agente (pdf-to-printer)." }
Pop-Location

# Lanzador oculto (sin ventana de consola).
$agentJs = Join-Path $installDir "dist\src\agent.js"
$vbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run """$node"" ""$agentJs""", 0, False
"@
Set-Content -Path $launcher -Value $vbs -Encoding ASCII

# Inicio automático con Windows (usuario actual: ve sus impresoras).
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($startupLink)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = """$launcher"""
$shortcut.WorkingDirectory = $installDir
$shortcut.Save()

Start-Process wscript.exe -ArgumentList """$launcher"""
Start-Sleep -Seconds 2

try {
  $status = Invoke-RestMethod -Uri "http://127.0.0.1:17777/status" -TimeoutSec 5
  Write-Host "Agente activo en http://127.0.0.1:17777 ($($status.hostname)). Configura las impresoras en el sistema: Caja > Impresoras."
} catch {
  Write-Warning "El agente se instaló pero no respondió todavía. Revisa que el puerto 17777 esté libre."
}
