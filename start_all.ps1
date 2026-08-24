$ErrorActionPreference = "SilentlyContinue"
$ROOT = "D:\shadow-weaver"
$BACKEND = "$ROOT\backend"
$FRONTEND = "$ROOT\frontend"
$LOGS = "$ROOT\logs"
New-Item -ItemType Directory -Force -Path "$ROOT\data", $LOGS | Out-Null

# Load .env into environment
$envFile = "$BACKEND\.env"
if (-not (Test-Path $envFile)) { $envFile = "$ROOT\.env" }
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^([A-Z0-9_]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

# Kill previous agents
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "python.exe" -and $_.CommandLine -match "shadow-weaver" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "shadow-weaver" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 3

# Start backend services
Write-Host "Starting backend services..."
Start-Process python -ArgumentList "$BACKEND\orchestrator.py" -WorkingDirectory $BACKEND -WindowStyle Hidden
Start-Sleep 3
Start-Process python -ArgumentList "$BACKEND\blue_shield.py" -WorkingDirectory $BACKEND -WindowStyle Hidden
Start-Sleep 3
Start-Process python -ArgumentList "$BACKEND\honeypot.py" -WorkingDirectory $BACKEND -WindowStyle Hidden
Start-Sleep 2
Start-Process python -ArgumentList "$BACKEND\red_team.py" -WorkingDirectory $BACKEND -WindowStyle Hidden
Start-Sleep 1
Start-Process python -ArgumentList "$BACKEND\ssh_monitor.py" -WorkingDirectory $BACKEND -WindowStyle Hidden
Write-Host "Backend services started"

# Start frontend
if (Test-Path "$FRONTEND\package.json") {
    $env:PATH = "D:\nodejs\node-v20.18.0-win-x64;$env:PATH"
    Start-Process -FilePath "D:\nodejs\node-v20.18.0-win-x64\npm.cmd" -ArgumentList "run dev" -WorkingDirectory $FRONTEND -WindowStyle Hidden
    Write-Host "Frontend started on port 3000"
}

Start-Sleep 5

Write-Host ""
Write-Host "==========================================="
Write-Host "  Shadow-Weaver - Full Stack Running"
Write-Host "==========================================="
Write-Host "  Frontend     -> http://localhost:3000"
Write-Host "  Orchestrator -> http://localhost:8000"
Write-Host "  Blue Shield  -> http://localhost:8080"
Write-Host "  Honeypot     -> port 8022"
Write-Host "  Red Team     -> polling for missions"
Write-Host "  SSH Monitor  -> tailing auth.log"
Write-Host "==========================================="

Set-Content -Path "$LOGS\started.marker" -Value (Get-Date -Format "HH:mm:ss")
