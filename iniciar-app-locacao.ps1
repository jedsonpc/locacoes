$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8770
$Url = "http://127.0.0.1:$Port/login.html?v=2.1.40-relatorios-20260716"
$PidFile = Join-Path $AppDir "locacoes-server.pid"

function Test-AppServer {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (-not (Test-AppServer)) {
  $pythonCommand = Get-Command "python.exe" -ErrorAction SilentlyContinue
  if (-not $pythonCommand) {
    $pythonCommand = Get-Command "py.exe" -ErrorAction SilentlyContinue
  }
  if (-not $pythonCommand) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("Python nao foi encontrado para iniciar o aplicativo.", "Cupe Beach Living") | Out-Null
    exit 1
  }

  $arguments = if ($pythonCommand.Name -eq "py.exe") {
    @("-3", "-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $AppDir)
  } else {
    @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $AppDir)
  }
  $server = Start-Process -FilePath $pythonCommand.Source -ArgumentList $arguments -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath $PidFile -Value $server.Id -Encoding ASCII

  $ready = $false
  foreach ($attempt in 1..20) {
    Start-Sleep -Milliseconds 150
    if (Test-AppServer) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("Nao foi possivel iniciar o servidor local do aplicativo.", "Cupe Beach Living") | Out-Null
    exit 1
  }
}

$browserCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browserPath = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if ($browserPath) {
  Add-Type -AssemblyName System.Windows.Forms
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  Start-Process -FilePath $browserPath -ArgumentList @("--app=$Url", "--start-maximized", "--window-position=0,0", "--window-size=$($screen.Width),$($screen.Height)")
} else {
  Start-Process $Url
}
