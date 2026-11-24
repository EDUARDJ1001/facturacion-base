$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Stop-ProcessTree {
  param([int]$ProcessId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId $child.ProcessId
  }

  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$env:NODE_ENV = "production"
$env:HOST = "0.0.0.0"
$env:PORT = "4000"

$logsDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

Write-Host "Iniciando backend en http://192.168.1.125:4000"
$backend = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "start:backend") `
  -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logsDir "backend-production.out.log") `
  -RedirectStandardError (Join-Path $logsDir "backend-production.err.log") `
  -PassThru `
  -WindowStyle Hidden

Write-Host "Iniciando frontend en http://192.168.1.125:3000"
$frontend = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "start:frontend") `
  -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logsDir "frontend-production.out.log") `
  -RedirectStandardError (Join-Path $logsDir "frontend-production.err.log") `
  -PassThru `
  -WindowStyle Hidden

Write-Host ""
Write-Host "App lista para la red local:"
Write-Host "Frontend: http://192.168.1.125:3000"
Write-Host "Backend:  http://192.168.1.125:4000/health"
Write-Host "Logs:     $logsDir"
Write-Host ""
Write-Host "Presiona Ctrl+C para detener ambos servicios."

try {
  while (-not $backend.HasExited -and -not $frontend.HasExited) {
    Start-Sleep -Seconds 2
    $backend.Refresh()
    $frontend.Refresh()
  }
}
finally {
  if (-not $backend.HasExited) {
    Stop-ProcessTree -ProcessId $backend.Id
  }
  if (-not $frontend.HasExited) {
    Stop-ProcessTree -ProcessId $frontend.Id
  }
}
