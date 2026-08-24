# Shadow-Weaver Architecture

## System Overview

Shadow-Weaver is a real-time AI cyber defense SOC dashboard that visualizes the attack → detection → deception → response lifecycle.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHADOW WEAVER SUITE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ORCHESTRATOR (FastAPI :8000)                │   │
│  │  • Event store (SQLite)                                  │   │
│  │  • Guardrail modes (autonomous/manual)                   │   │
│  │  • WebSocket broadcast (/ws/soc-feed)                    │   │
│  │  • AI narration (Gemini)                                 │   │
│  │  • Prometheus metrics                                    │   │
│  └──────────┬───────────────▲───────────────┬──────────────┘   │
│             │ telemetry     │ status/orders  │ ws://…/ws/soc-feed│
│  ┌──────────▼────┐   ┌──────┴──────┐   ┌────▼─────────────┐   │
│  │   RED TEAM    │   │ BLUE SHIELD │   │    HONEYPOT      │   │
│  │  (192.168.50.40)│  │(192.168.50.20)│  │  (192.168.50.30) │   │
│  │  • HTTP Flood │   │ • IDS/IPS   │   │  • SSH Decoy     │   │
│  │  • Brute Force│   │ • Firewall  │   │  • Cmd Capture   │   │
│  │  • Port Scan  │   │ • Rate Limit│   │  • Lateral Detect│   │
│  │  • AI Strategy│   │ • Tarpit    │   │  • Session Track  │   │
│  └───────────────┘   └─────────────┘   └──────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    EXECUTOR                              │   │
│  │  • Real firewall commands (iptables/netsh)               │   │
│  │  • User account management                               │   │
│  │  • SSH hardening                                         │   │
│  │  • Audit trail                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  SSH MONITOR                             │   │
│  │  • Real-time auth.log tailing                            │   │
│  │  • Brute force detection                                 │   │
│  │  • Auth spray detection                                  │   │
│  │  • Windows Event Log polling                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  ALERT MANAGER                           │   │
│  │  • Discord webhooks                                       │   │
│  │  • Slack webhooks                                         │   │
│  │  • Generic webhooks                                       │   │
│  │  • Severity-based filtering                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                   FRONTEND (React :3000)                         │
│  • Real-time WebSocket connection                               │
│  • Live topology visualization                                  │
│  • Threat intelligence feed                                     │
│  • Honeypot capture viewer                                      │
│  • Simulation controls                                          │
│  • Approval dialog (manual mode)                                │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Attack Phase
   Red Team → Orchestrator (telemetry) → Blue Shield (detection)

2. Detection Phase
   Blue Shield → Orchestrator (shield.detect) → WebSocket → Dashboard

3. Response Phase
   Orchestrator → Blue Shield (shield.block) → Executor (firewall) → Dashboard

4. Containment Phase (Manual Mode)
   Orchestrator → Dashboard (containment.prompt) → Operator → Approve/Ignore

5. Honeypot Phase
   Attacker → Honeypot (SSH) → Commands captured → Orchestrator → Dashboard
```

## Security Layers

### 1. Detection Layer
- HTTP request analysis (rate limiting, pattern matching)
- SSH brute force detection
- Authentication spray detection
- Path traversal detection
- Header fuzzing detection

### 2. Decision Layer
- Gemini AI analysis (when API key provided)
- Rule-based fallback (offline mode)
- Severity scoring (1-10)
- Correlation engine (multi-vector attacks)

### 3. Response Layer
- IP blocking (firewall rules)
- Rate limiting (connection throttling)
- Tarpit (connection holding)
- User account disabling
- SSH hardening

### 4. Monitoring Layer
- Real-time WebSocket feed
- SQLite audit trail
- Prometheus metrics
- Structured logging

## Deployment Modes

### Desktop Mode (Single EXE)

Single EXE build available for desktop deployment. Build using PyInstaller:

```bash
pip install pyinstaller
# Create launcher.py entry point
# Build: pyinstaller --onefile launcher.py
```

### Server Mode (Multiple Services)
```bash
python backend/orchestrator.py   # Terminal 1
python backend/blue_shield.py    # Terminal 2
python backend/honeypot.py       # Terminal 3
python backend/red_team.py       # Terminal 4
python backend/ssh_monitor.py    # Terminal 5
```

### Docker Mode (Coming Soon)
```bash
docker-compose up -d
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Python 3.10+, FastAPI, aiohttp |
| Database | SQLite (aiosqlite) |
| Frontend | React 18, TypeScript, Vite |
| Real-time | WebSocket |
| AI | Google Gemini |
| Metrics | Prometheus |
| Build | PyInstaller |
