$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $AppDir "abrir-app-locacao.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "App Locacao.lnk"

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Nao encontrei o inicializador: $Launcher"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $Launcher
$shortcut.WorkingDirectory = $AppDir
$shortcut.Description = "Abrir App Locacao"
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,43"
$shortcut.Save()

Write-Host "Atalho criado na Area de Trabalho:"
Write-Host $ShortcutPath
