$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $PSScriptRoot
$installRoot = Join-Path $env:LOCALAPPDATA "LocacoesApp"
$installApp = Join-Path $installRoot "app"
$startScript = Join-Path $installRoot "iniciar-locacoes.ps1"
$serverScript = Join-Path $installRoot "servidor-locacoes.ps1"
$iconFile = Join-Path $installApp "cupe-beach-living.ico"
$sourceStartScript = Join-Path $packageRoot "iniciar-app-locacao.ps1"
$appVersion = "2.1.32"
$port = 8787

if (!(Test-Path (Join-Path $packageRoot "index.html"))) {
  throw "Pasta do app nao encontrada: $packageRoot"
}

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
New-Item -ItemType Directory -Force -Path $installApp | Out-Null

Get-ChildItem -LiteralPath $packageRoot -Force |
  Where-Object { $_.Name -notin @(".git", "node_modules") } |
  Copy-Item -Destination $installApp -Recurse -Force

@"
param(
  [string]`$Root,
  [int]`$Port = $port
)

`$ErrorActionPreference = "SilentlyContinue"
`$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), `$Port)
`$listener.Start()

function Get-ContentType([string]`$Path) {
  switch ([System.IO.Path]::GetExtension(`$Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8"; break }
    ".js" { "text/javascript; charset=utf-8"; break }
    ".css" { "text/css; charset=utf-8"; break }
    ".json" { "application/json; charset=utf-8"; break }
    ".svg" { "image/svg+xml"; break }
    ".png" { "image/png"; break }
    ".jpg" { "image/jpeg"; break }
    ".jpeg" { "image/jpeg"; break }
    ".ico" { "image/x-icon"; break }
    default { "application/octet-stream" }
  }
}

while (`$true) {
  `$client = `$listener.AcceptTcpClient()
  try {
    `$stream = `$client.GetStream()
    `$reader = [System.IO.StreamReader]::new(`$stream)
    `$request = `$reader.ReadLine()
    if (-not `$request) { `$client.Close(); continue }
    while (`$reader.ReadLine()) {}

    `$parts = `$request.Split(" ")
    `$rawPath = if (`$parts.Length -gt 1) { `$parts[1] } else { "/" }
    `$urlPath = [Uri]::UnescapeDataString((`$rawPath.Split("?")[0]).TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace(`$urlPath)) { `$urlPath = "login.html" }
    `$target = Join-Path `$Root `$urlPath
    `$fullRoot = [System.IO.Path]::GetFullPath(`$Root)
    `$fullTarget = [System.IO.Path]::GetFullPath(`$target)

    if (-not `$fullTarget.StartsWith(`$fullRoot) -or -not (Test-Path -LiteralPath `$fullTarget -PathType Leaf)) {
      `$status = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
      `$bytes = [Text.Encoding]::ASCII.GetBytes(`$status)
      `$stream.Write(`$bytes, 0, `$bytes.Length)
    } else {
      `$body = [System.IO.File]::ReadAllBytes(`$fullTarget)
      `$header = "HTTP/1.1 200 OK`r`nContent-Type: `$(Get-ContentType `$fullTarget)`r`nContent-Length: `$(`$body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
      `$headerBytes = [Text.Encoding]::ASCII.GetBytes(`$header)
      `$stream.Write(`$headerBytes, 0, `$headerBytes.Length)
      `$stream.Write(`$body, 0, `$body.Length)
    }
  } catch {
  } finally {
    `$client.Close()
  }
}
"@ | Set-Content -LiteralPath $serverScript -Encoding UTF8

@"
`$ErrorActionPreference = "SilentlyContinue"

`$AppDir = Join-Path `$PSScriptRoot "app"
`$LoginFile = Join-Path `$AppDir "login.html"
`$Url = "http://127.0.0.1:$port/login.html?v=$appVersion"
`$PidFile = Join-Path `$PSScriptRoot "locacoes-server.pid"
`$BundledPython = "C:\Users\Edson\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
`$ServerScript = Join-Path `$PSScriptRoot "servidor-locacoes.ps1"

function Open-Browser(`$target) {
  `$edge = Get-Command "msedge.exe" -ErrorAction SilentlyContinue
  `$chrome = Get-Command "chrome.exe" -ErrorAction SilentlyContinue

  if (`$edge) {
    Start-Process -FilePath `$edge.Source -ArgumentList "--start-maximized","--new-window",`$target
    return
  }

  if (`$chrome) {
    Start-Process -FilePath `$chrome.Source -ArgumentList "--start-maximized","--new-window",`$target
    return
  }

  Start-Process `$target
}

function Test-LocalServer {
  try {
    `$response = Invoke-WebRequest -Uri `$Url -UseBasicParsing -TimeoutSec 2
    return `$response.StatusCode -ge 200 -and `$response.StatusCode -lt 500
  } catch {
    return `$false
  }
}

if (!(Test-Path `$LoginFile)) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("Arquivo login.html nao encontrado em `$AppDir", "Locacoes")
  exit 1
}

if (!(Test-LocalServer)) {
  `$bundled = if (Test-Path -LiteralPath `$BundledPython) { `$BundledPython } else { `$null }
  `$py = Get-Command "py.exe" -ErrorAction SilentlyContinue
  `$python = Get-Command "python.exe" -ErrorAction SilentlyContinue
  `$python3 = Get-Command "python3.exe" -ErrorAction SilentlyContinue

  if (`$bundled) {
    `$process = Start-Process -FilePath `$bundled -ArgumentList "-m","http.server","$port","--bind","127.0.0.1","--directory",`$AppDir -WorkingDirectory `$PSScriptRoot -WindowStyle Hidden -PassThru
  } elseif (`$py) {
    `$process = Start-Process -FilePath `$py.Source -ArgumentList "-3","-m","http.server","$port","--bind","127.0.0.1","--directory",`$AppDir -WorkingDirectory `$PSScriptRoot -WindowStyle Hidden -PassThru
  } elseif (`$python) {
    `$process = Start-Process -FilePath `$python.Source -ArgumentList "-m","http.server","$port","--bind","127.0.0.1","--directory",`$AppDir -WorkingDirectory `$PSScriptRoot -WindowStyle Hidden -PassThru
  } elseif (`$python3) {
    `$process = Start-Process -FilePath `$python3.Source -ArgumentList "-m","http.server","$port","--bind","127.0.0.1","--directory",`$AppDir -WorkingDirectory `$PSScriptRoot -WindowStyle Hidden -PassThru
  }

  if (`$process) {
    Set-Content -LiteralPath `$PidFile -Value `$process.Id -Encoding ASCII
  } elseif (Test-Path `$ServerScript) {
    `$powershell = Join-Path `$env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    `$process = Start-Process -FilePath `$powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File",`$ServerScript,"-Root",`$AppDir,"-Port","$port" -WorkingDirectory `$PSScriptRoot -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath `$PidFile -Value `$process.Id -Encoding ASCII
  }

  Start-Sleep -Seconds 2
}

if (Test-LocalServer) {
  Open-Browser `$Url
} else {
  Open-Browser `$LoginFile
}
"@ | Set-Content -LiteralPath $startScript -Encoding UTF8

$desktop = [Environment]::GetFolderPath("Desktop")
$programs = [Environment]::GetFolderPath("Programs")
$shortcutName = "Cupe Beach Living.lnk"
$desktopShortcut = Join-Path $desktop $shortcutName
$startMenuDir = Join-Path $programs "Locacoes"
$startMenuShortcut = Join-Path $startMenuDir $shortcutName

New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

$shell = New-Object -ComObject WScript.Shell
$powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

foreach ($shortcutPath in @($desktopShortcut, $startMenuShortcut)) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
  $shortcut.WorkingDirectory = $installRoot
  $shortcut.Description = "Abrir Cupe Beach Living diretamente na tela de login"
  if (Test-Path $iconFile) {
    $shortcut.IconLocation = "$iconFile,0"
  }
  $shortcut.Save()
}

Write-Host ""
Write-Host "Instalacao concluida."
Write-Host "Atalho criado na Area de Trabalho e no Menu Iniciar: Cupe Beach Living"
Write-Host "Arquivos instalados em: $installRoot"





