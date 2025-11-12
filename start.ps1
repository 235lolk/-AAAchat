# PowerShell one-click startup for AAAchat on Docker
# Usage: Right-click -> Run with PowerShell (Windows), or run in terminal: pwsh ./start.ps1

param(
  [string]$Port = "3003",
  [switch]$Rebuild
)

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# 1) Check Docker availability
try {
  $dockerVersion = & docker --version 2>$null
} catch {
  $dockerVersion = $null
}
if (-not $dockerVersion) {
  Write-Err "Docker not detected. Please install Docker Desktop and rerun."
  exit 1
}
Write-Info "Docker: $dockerVersion"

# 2) Choose compose command (v2 or legacy)
$composeCmd = "docker compose"
try { $v = & docker compose version 2>$null } catch { $v = $null }
if (-not $v) {
  # fallback
  try { $v2 = & docker-compose --version 2>$null; if ($v2) { $composeCmd = "docker-compose" } } catch {}
}
Write-Info "Compose cmd: $composeCmd"

# 3) Optionally rebuild
if ($Rebuild) {
  Write-Info "Rebuilding images..."
  iex "$composeCmd build"
}

# 4) Up services
Write-Info "Starting MySQL and app services..."
iex "$composeCmd up -d"
if ($LASTEXITCODE -ne 0) {
  Write-Err "docker compose up failed. Check logs."
  exit 1
}

# 5) Wait for app readiness (HTTP port)
$target = "http://localhost:$Port/"
Write-Info "Waiting for app ready: $target"
$maxWait = 60
$ok = $false
for ($i = 0; $i -lt $maxWait; $i++) {
  try {
    $resp = Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}

if ($ok) {
  Write-Host "\n私人助手BOT已启动。访问: $target" -ForegroundColor Green
  Write-Host "Logs: docker compose logs -f" -ForegroundColor DarkGray
  Write-Host "Stop: docker compose down" -ForegroundColor DarkGray
} else {
  Write-Err ("App not ready in time. Try: " + $target + " or check container logs.")
}