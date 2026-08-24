# Changelog

All notable changes to Shadow-Weaver will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-21

### Added
- **Orchestrator**: Central hub with FastAPI, SQLite event store, WebSocket broadcast
- **Blue Shield**: IDS/IPS with detection, blocking, rate limiting, tarpit
- **Red Team**: Autonomous attack engine with HTTP flood, brute force, port scan
- **Honeypot**: SSH decoy with command capture and lateral movement detection
- **SSH Monitor**: Real-time auth.log tailing and Windows Event Log polling
- **Executor**: Real firewall execution (iptables/netsh) with audit trail
- **Alert Manager**: Discord/Slack webhook notifications
- **Frontend**: React dashboard with live topology, threat feed, simulation controls
- **Production HTTP Client**: Connection pooling, circuit breaker, retry logic
- **AI Integration**: Gemini-powered attack strategy and narration
- **Guardrail Modes**: Autonomous and manual containment approval
- **Single EXE Build**: PyInstaller-based desktop deployment

### Security Features
- Real-time attack detection
- Automated IP blocking
- Rate limiting and throttling
- Tarpit for connection holding
- User account disabling
- SSH hardening
- Audit trail logging

### Documentation
- API documentation
- Architecture overview
- Contributing guidelines
- Changelog

## [0.9.0] - 2026-08-20

### Added
- Initial prototype
- Basic attack simulation
- Simple detection rules
- WebSocket feed

## [0.8.0] - 2026-08-19

### Added
- Project setup
- Core architecture design
- Agent communication protocol
