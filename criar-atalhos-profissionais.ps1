$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Installer = Join-Path $AppDir "installers\instalar-atalho-windows.ps1"

if (-not (Test-Path -LiteralPath $Installer)) {
  throw "Nao encontrei o instalador: $Installer"
}

& $Installer
