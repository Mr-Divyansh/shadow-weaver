$ErrorActionPreference = "SilentlyContinue"
# Use the directory where this script lives as the project root
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ROOT = Resolve-Path -Path $SCRIPT_DIR
$BACKEND = "$ROOT\backend"
$FRONTEND_SRC = "$ROOT\src"
$LOGS = "$ROOT\logs"
$data_dir = "$ROOT\data"
if (-not (Test-Path $data_dir)) { New-Item -ItemType Directory -Force -Path $data_dir | Out-Null }
if (-not (Test-Path "$LOGS")) { New-Item -ItemType Directory -Force -Path "$LOGS" | Out-NULL }

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
if (Test-Path "$ROOT\package.json") {
    $node_path = "$env:LOCALAPPDATA\Programs\nodejs"
    if (-not (Test-Path $node_path)) { $node_path = "D:\nodejs\node-v20.18.0-win-x64" }
    if (Test-Path "$node_path\npm.cmd") {
        $env:PATH = "$node_path;$env:PATH"
        Start-Process -FilePath "$node_path\npm.cmd" -ArgumentList "run dev" -WorkingDirectory $ROOT -WindowStyle Hidden
        Write-Host "Frontend started on port 3000"
    } else {
        Write-Host "Node.js not found — start frontend manually with: cd $ROOT && npm run dev"
    }
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