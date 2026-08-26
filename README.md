# Shadow-Weaver

![Shadow-Weaver](https://img.shields.io/badge/version-1.0.0-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Python](https://img.shields.io/badge/python-3.10+-yellow) ![Status](https://img.shields.io/badge/status-active-success)

**Self-Healing SOC — where attackers type, defenders adapt, and AI decides.**

A cyberpunk SOC simulation with a live red-vs-blue battle on your laptop. A red-team swarm attacks a simulated enterprise; a blue-team shield detects and contains the threat (autonomously or with human approval); an AI honeypot traps the attacker and captures every keystroke; an orchestrator wires it all into a live WebSocket feed that a dashboard renders in real time.

![Architecture](docs/architecture.png)

## Features

- **5 Autonomous Agents**: Orchestrator, Blue Shield, Red Team, Honeypot, SSH Monitor
- **Real Firewall Execution**: Actual iptables/netsh commands (not simulation)
- **AI-Powered Decisions**: Gemini AI for attack strategy and narration
- **Real-time Dashboard**: Live topology, threat feed, honeypot capture viewer
- **Guardrail Modes**: Autonomous (auto-block) or Manual (human approval)
- **Production Ready**: Circuit breaker, retry logic, audit trail
- **Single EXE**: Desktop deployment with PyInstaller

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+ (for frontend)
- Windows/Linux/macOS

### Installation

```bash
# Clone the repository
git clone https://github.com/Mr-Divyansh/shadow-weaver.git
cd shadow-weaver

# Install backend dependencies
pip install -r requirements.txt

# Install frontend dependencies
npm install
```

### Running

```bash
# Windows
powershell -ExecutionPolicy Bypass -File start_all.ps1

# Linux/macOS
python backend/orchestrator.py &
python backend/blue_shield.py &
python backend/honeypot.py &
python backend/red_team.py &
python backend/ssh_monitor.py &
```

### Access Dashboard

Open your browser and go to:
```
http://localhost:3000
```

## Project Structure

```
shadow-weaver/
├── backend/                    # Python backend
│   ├── orchestrator.py        # Central hub (FastAPI)
│   ├── blue_shield.py         # IDS/IPS engine
│   ├── red_team.py            # Attack simulator
│   ├── honeypot.py            # SSH decoy
│   ├── ssh_monitor.py         # Real SSH monitoring
│   ├── executor.py            # Firewall execution
│   ├── alerts.py              # Discord/Slack alerts
│   ├── http_client.py         # Production HTTP client
│   ├── ai_brain.py            # Gemini AI integration
│   ├── config.py              # Configuration
│   ├── red_prompt.py          # Attack prompts
│   └── red_tools.py           # Attack tools
│
├── frontend/                   # React dashboard
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── services/          # WebSocket provider
│   │   ├── store.ts           # State management
│   │   └── types.ts           # TypeScript types
│   └── package.json
│
├── docs/                       # Documentation
│   ├── API.md                 # API reference
│   └── ARCHITECTURE.md        # System architecture
│
├── start_all.ps1              # Quick launcher
├── requirements.txt           # Python dependencies
├── .env.example               # Environment template
├── LICENSE                    # MIT License
└── CHANGELOG.md               # Version history
```

## EXE Build

Single EXE build is available for desktop deployment. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# AI Configuration (optional)
GEMINI_KEY=your_api_key_here

# Security Settings
EXECUTOR_DRY_RUN=true  # Set to false for real firewall execution

# Alert Configuration
DISCORD_WEBHOOK_URL=your_webhook_url
```

## Protected Target

### Demo Mode
Connect Shadow-Weaver to a simulated target environment without requiring a real server. Useful for presentations and demonstrations.

- **Target IP**: `192.0.2.10` (SIMULATED)
- **Target Port**: `8080` (SIMULATED)
- **Target Name**: `DEMO-TARGET`
- **Environment**: Simulated Lab
- **Status**: 🟢 DEMO CONNECTED

In Demo Mode, the entire SOC lifecycle runs with simulated events:
- Red Team generates simulated reconnaissance and attack events
- Threat Detection identifies simulated threats
- Blue Team analyzes and responds
- Honeypot engages and captures simulated sessions
- Containment and protection events are generated

### Authorized Lab Server
Connect Shadow-Weaver to an authorized server or isolated security lab that you own or have explicit permission to test.

- **Server IP / Host**: `192.168.1.100` (or your lab's IP)
- **Server Port**: `8080` (or your lab's port)
- **Server Name** (optional): `My Security Lab`
- **Environment**:
  - Local Lab
  - Private Network
  - Cloud Lab
  - CTF/Lab Environment
- **Authorization**: Must check "I confirm that I own or have explicit authorization to test this server."
- **Status**: 🟢 CONNECTED or 🔴 CONNECTION FAILED

### Connection Flow

1. **Settings** → **Protected Target**
2. **Choose Demo Mode** or **Choose Authorized Lab Server**
3. **Enter IP/Host + Port**
4. **Confirm Authorization** (required for Authorized Lab mode)
5. **CONNECT**
6. **● CONNECTED**
7. Shadow-Weaver protects/monitors the configured environment

The backend performs safe connectivity/health checks before connecting. No real network attacks are performed in Demo Mode. In Authorized Lab Mode, only the configured target is allowed.

### Target Information Card

After successful connection, the dashboard shows:

```
TARGET STATUS

Host        192.168.1.100
Port        8080
Environment Private Network
Status      CONNECTED
Protection  ACTIVE

Red Team    READY
Blue Team   READY
Honeypot    READY
AI Engine   READY

[Disconnect button]
```

### Red Team → Blue Team → Honeypot Lifecycle

```text
TARGET
   ↓
RED TEAM
   ↓
DETECTION
   ↓
BLUE TEAM
   ↓
HONEYPOT / DECEPTION
   ↓
CONTAINMENT
   ↓
RECOVERY
```

Red Team actions are controlled and rate-limited. Only safe, simulated actions are permitted. The backend validates that actions remain within the configured target.

### AI Security Engine

In Demo Mode, use simulated AI decisions:

```
AI DECISION

Threat classified as:
HTTP Anomaly

Risk:
HIGH

Recommended response:
Contain suspicious source

Confidence:
94%
```

AI calls go through the backend. No API keys are exposed in frontend code.

### Security Guardrails

- **Target allowlist**: Only the currently configured target may be used
- **Authorization confirmation**: Required explicit user confirmation before Authorized Lab mode
- **Rate limits**: Prevent uncontrolled request generation
- **No destructive operations**: No ransomware, malware deployment, persistence, destructive file operations, arbitrary shell execution, credential harvesting, uncontrolled brute force, public Internet scanning
- **Audit log**: Records who/what initiated, target, timestamp, mode, action, result. Never logs API keys or secrets.

### Demo Instructions

For the hackathon demo:

1. Open the Shadow-Weaver website
2. Go to **Settings** → **Protected Target**
3. Select **Demo Mode**
4. Click **CONNECT**
5. The entire lifecycle will work without requiring:
   - Real server
   - Real IP
   - API keys in browser
   - Manual network setup
   - External infrastructure

The judge should understand the entire concept within a few seconds. The demo automatically generates realistic SOC telemetry that populates:
- Threat Feed
- Live Traffic Analysis
- System Health
- Cyber Defense Topology
- Attack/Detection counters
- Honeypot capture area

### Backend APIs

New target management APIs have been added:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/target/connect` | POST | Connect to protected target |
| `/api/v1/target/disconnect` | POST | Disconnect from target |
| `/api/v1/target/status` | GET | Get target connection status |
| `/api/v1/target/config` | GET | Get target configuration |

### Example Request

```json
{
  "host": "192.0.2.10",
  "port": 8080,
  "environment": "demo",
  "authorized": false
}
```

### Example Response (Demo Mode)

```json
{
  "status": "connected",
  "mode": "demo",
  "target": {
    "host": "192.0.2.10",
    "port": 8080
  }
}
```

### Example Response (Authorized Lab Mode)

```json
{
  "status": "connected",
  "mode": "authorized_lab",
  "target": {
    "host": "192.168.1.100",
    "port": 8080,
    "environment": "private_lab"
  }
}
```

## API Documentation

See [docs/API.md](docs/API.md) for complete API reference.

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/status` | GET | System status |
| `/api/v1/control/attack` | POST | Start/stop attack |
| `/api/v1/guardrail` | POST | Switch mode |
| `/api/v1/containment/decision` | POST | Approve/ignore |
| `/ws/soc-feed` | WS | Real-time events |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture.

## Deployment

### Desktop Mode (Single EXE)

Single EXE build available for desktop deployment. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

### Server Mode

```bash
# Run as services
python backend/orchestrator.py
python backend/blue_shield.py
python backend/honeypot.py
python backend/red_team.py
python backend/ssh_monitor.py
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for the Dora Hack 2.0 hackathon
- Cyber defense, live simulation, AI-powered security

## Support

- [GitHub Issues](https://github.com/Mr-Divyansh/shadow-weaver/issues)
- [Documentation](docs/)

---

**Shadow-Weaver** — Real-time AI cyber defense SOC dashboard