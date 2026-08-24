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
cd frontend
npm install
cd ..
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
├── CONTRIBUTING.md            # Contributing guide
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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

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
