$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = "C:\Users\Edson\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (-not (Test-Path -LiteralPath $Python)) {
  $Python = "python"
}

function Test-PortFree {
  param([int]$Port)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

$Port = $null
foreach ($candidate in 8770..8799) {
  if (Test-PortFree -Port $candidate) {
    $Port = $candidate
    break
  }
}

if (-not $Port) {
  Write-Host "Nao encontrei uma porta livre entre 8770 e 8799."
  pause
  exit 1
}

$Url = "http://127.0.0.1:$Port/index.html"

Write-Host "Locacoes"
Write-Host "Pasta: $AppDir"
Write-Host "Endereco: $Url"
Write-Host ""
Write-Host "Mantenha esta janela aberta enquanto estiver usando o app."
Write-Host "Para encerrar o servidor, feche esta janela."
Write-Host ""

$openCommand = "Start-Sleep -Milliseconds 900; Start-Process '$Url'"
Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-Command", $openCommand) -WindowStyle Hidden | Out-Null

& $Python -m http.server $Port -d $AppDir
