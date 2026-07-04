$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = "D:\github\locacoes"
$baseVersion = "2.1.15"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$versionSlug = "$baseVersion-auto-$stamp"
$localVersion = "local-$versionSlug"
$message = if ($args.Count -gt 0) { $args -join " " } else { "Atualiza Cupe Beach Living $versionSlug" }

$gitCandidates = @(
  "git",
  "C:\Program Files\Git\cmd\git.exe",
  "C:\Program Files\Git\bin\git.exe",
  "C:\Program Files (x86)\Git\cmd\git.exe"
)

$git = $gitCandidates | Where-Object {
  try {
    if ($_ -eq "git") { Get-Command git -ErrorAction Stop | Out-Null; $true } else { Test-Path -LiteralPath $_ }
  } catch {
    $false
  }
} | Select-Object -First 1

if (-not $git) {
  Write-Host "Git nao encontrado. Instale o Git for Windows e tente novamente."
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $repo ".git"))) {
  Write-Host "Repositorio nao encontrado em $repo"
  exit 1
}

function Set-TextFile([string]$Path, [string]$Content) {
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
}

function Update-VersionInFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $text = Get-Content -LiteralPath $Path -Raw
  $text = $text -replace 'v=2\.1\.[^"''&<\s]+', "v=$versionSlug"
  $text = $text -replace 'const APP_VERSION_LABEL = "[^"]+";', ('const APP_VERSION_LABEL = "v{0}";' -f $versionSlug)
  $text = $text -replace 'const appVersion = "[^"]+";', ('const appVersion = "{0}";' -f $localVersion)
  $text = $text -replace 'url\.searchParams\.set\("v", "[^"]+"\);', ('url.searchParams.set("v", "{0}");' -f $versionSlug)
  Set-TextFile $Path $text
}

foreach ($file in @("app.js", "index.html", "login.html", "sw.js")) {
  Update-VersionInFile (Join-Path $appRoot $file)
}

$versionJson = [ordered]@{
  version = $localVersion
  commit = "local"
  deployedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
} | ConvertTo-Json
Set-TextFile (Join-Path $appRoot "version.json") $versionJson

$itemsToPublish = @(
  "app.js",
  "index.html",
  "login.html",
  "styles.css",
  "sw.js",
  "update-checker.js",
  "manifest.webmanifest",
  "version.json",
  "supabase-config.js",
  "supabase-sync.js",
  "supabase-schema.sql",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "locacoes-app-192.png",
  "locacoes-app-512.png",
  "locacoes-app.ico",
  "cupe-beach-living.ico",
  "logo-cupe-beach-living.png",
  "cupe-beach-living.jpg",
  "LEIA-ME.txt",
  "COMO-AUTORIZAR-GIT.txt",
  "PUBLICAR-GITHUB.bat",
  "publicar-github.ps1",
  "ABRIR-LOCACOES.bat",
  "abrir-app-locacao.bat",
  "abrir-app-locação.bat",
  "INSTALAR-LOCACOES.bat",
  "instalar-atalho-windows.bat",
  "instalar-atalho-area-trabalho.bat",
  "iniciar-app-locacao.ps1",
  "criar-atalho-app-locacao.ps1",
  "criar-atalhos-profissionais.ps1"
)

foreach ($item in $itemsToPublish) {
  $src = Join-Path $appRoot $item
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination (Join-Path $repo $item) -Force
  }
}

$installerSrc = Join-Path $appRoot "installers"
$installerDest = Join-Path $repo "installers"
if (Test-Path -LiteralPath $installerSrc) {
  New-Item -ItemType Directory -Force -Path $installerDest | Out-Null
  Copy-Item -LiteralPath (Join-Path $installerSrc "*") -Destination $installerDest -Recurse -Force
}

Write-Host "Versao preparada: $versionSlug"
Write-Host "Arquivos sincronizados para: $repo"

& $git -C $repo status --short
& $git -C $repo add -A
$changes = & $git -C $repo status --short
if (-not $changes) {
  Write-Host "Nada pendente para publicar."
  exit 0
}

& $git -C $repo commit -m $message
& $git -C $repo push origin main
Write-Host "GitHub atualizado com sucesso. O Vercel/GitHub Pages deve publicar a versao $versionSlug automaticamente."
Write-Host "Depois da publicacao, o QR passara a abrir a versao atualizada."

