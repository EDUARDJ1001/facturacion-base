$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "Instalando dependencias..."
npm install

Write-Host "Construyendo backend y frontend en modo produccion..."
npm run build

Write-Host ""
Write-Host "Build listo. Para iniciar la app ejecuta:"
Write-Host "npm run start:prod"
