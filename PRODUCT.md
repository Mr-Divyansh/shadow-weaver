# Shadow-Weaver Suite — Frontend Product Specification

> **Document type:** Frontend product specification
> **Audience:** Frontend developers, designers, demo judges
> **Scope:** UI, UX, screens, components, dashboard behavior, real-time visualization, states, and frontend data requirements.
> **Out of scope:** Backend implementation (FastAPI, Docker, firewall, Linux, database, attack scripts, backend security logic). The backend has its own architecture and documentation.

---

## 1. Product Overview

### Product Name

**Shadow-Weaver Suite**

### Product Type

**Real-Time AI Cyber Defense SOC Dashboard**

### Product Goal

A modern, professional Security Operations Center (SOC) dashboard that lets users visually monitor a controlled cyber-defense simulation in real time.

The frontend makes the entire **attack → detection → deception → response** lifecycle understandable within seconds. A user or judge should not need to understand Docker, Linux, networking, or backend internals to understand what is happening on screen.

### Core Questions the Dashboard Must Answer at a Glance

1. Is the system healthy?
2. Is an attack happening?
3. Who is attacking?
4. What is being targeted?
5. Was the threat detected?
6. Was the attacker captured by the honeypot?
7. Did the system respond?
8. Is the system in **Autonomous** or **Manual** mode?

---

## 2. Design Direction

The UI should feel like a **modern Security Operations Center + clean developer product** — not a movie-style hacker screen.

### Avoid

- Excessive neon effects
- Unnecessary gradients
- Huge glowing cards
- Excessive animations
- Random decorative elements
- Fake 3D effects
- Matrix rain
- Giant glowing text
- Unnecessary terminal decoration
- Excessive neon green
- Random graphs
- Fake technical jargon
- Cluttered topology
- Too many cards

### Prefer

- Clean hierarchy
- Dark professional SOC aesthetic
- Subtle accent colors
- Readable typography
- Compact information density
- Smooth transitions
- Clear status indicators
- Purposeful animation

---

## 3. UX Principles

| Principle | Meaning |
|---|---|
| **Clarity over decoration** | Every visual element must communicate something useful. |
| **Security first** | Critical states must be immediately visible. |
| **Real-time but calm** | Animations communicate state changes without making the UI chaotic. |
| **Professional SOC appearance** | The product must look suitable for a technical demonstration. |
| **Fast understanding** | A judge should understand the attack/defense story within 5–10 seconds. |
| **Consistency** | Consistent spacing, typography, status colors, component patterns, iconography, border radius, and shadows. |

---

## 4. Main Dashboard Layout

The primary experience is a single **Cyber Defense Command Center** screen.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header — Branding · System Status · Connection · Mode · Live · ⚙     │
├──────────────────────────────────────────────────────────────────────┤
│ Security Overview — Active Threats · Detected · Contained ·          │
│                     Captures · Traffic · Health                      │
├───────────────────────────────┬──────────────────────────────────────┤
│ Network Topology              │ Live Traffic Analytics               │
│ Red Team → Blue Team          │ (real-time chart)                    │
│ Red Team → Honeypot           │                                      │
├───────────────────────────────┼──────────────────────────────────────┤
│ Threat Intelligence /         │ System Health                        │
│ Event Feed                    │ Red Team · Blue Team · Honeypot      │
├───────────────────────────────┴──────────────────────────────────────┤
│ Honeypot / Hacker Jail — Status · Fake Terminal · Attacker Fingerprint│
├──────────────────────────────────────────────────────────────────────┤
│ Simulation Controls · Kill Switch · Approval Dialog (modal overlay)   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Header / Top Navigation

The header remains visually stable and uncluttered.

### Required Elements

| Element | Example |
|---|---|
| Branding | `Shadow-Weaver` |
| System status | `SYSTEM ONLINE` |
| Connection status | `LIVE CONNECTION` |
| Operating mode | `AUTONOMOUS MODE` / `MANUAL APPROVAL` |
| Live indicator | Pulsing dot + `LIVE` |
| Settings / control access | Gear icon or compact menu |

### Behavior

- The header is always visible regardless of scroll position.
- Status text uses clear labels, not just color.
- The live indicator animates only when actively receiving data.

---

## 6. Security Overview

A compact overview section with real-time statistics. Every number must communicate useful security information — no decorative statistics.

### Metrics

| Metric | Meaning |
|---|---|
| **Active Threats** | Threats currently requiring attention |
| **Threats Detected** | Total threats detected in the session |
| **Threats Contained** | Threats successfully contained |
| **Honeypot Captures** | Attacker sessions captured by the honeypot |
| **Network Traffic** | Current traffic volume / rate |
| **System Health** | Aggregate health of all runtime entities |

### Behavior

- Values update from real-time data without page refresh.
- Numbers change with a subtle transition (e.g., short count animation or fade).
- Critical values (e.g., active threats > 0) are visually emphasized.

---

## 7. Network / Container Topology

The central visual area representing the three major runtime entities:

- **Red Team** — attacker simulation
- **Blue Team** — target/defender environment
- **Honeypot** — deception environment

### Normal State

- Subtle connection lines between nodes
- Stable, non-animated nodes
- Clear labels

### Attack State

- The affected connection becomes highlighted
- Threat direction is visually obvious (e.g., animated directional flow)
- The affected node changes state (color, border, badge)
- Animation is subtle and purposeful

### Simplicity Rule

Do **not** make the topology look like a complicated enterprise network map. Keep it simple:

```
Red Team ──▶ Blue Team
Red Team ──▶ Honeypot
```

A judge must understand the topology immediately.

---

## 8. Live Traffic Analytics

A real-time chart showing network activity.

### Supported Metrics

- Requests/sec
- Packets/sec
- Traffic volume
- Attack activity

### Behavior

- **Normal activity:** graph remains stable.
- **Attack simulation:** chart visibly spikes.
- **Real-time updates:** new data points stream in continuously.
- **Smooth transitions:** values animate without jarring jumps.
- **Readable axis labels:** time progression is clear.
- **Tooltip/value inspection:** hovering shows exact values.
- **Empty state:** shown before the first data arrives.
- **Disconnected state:** chart clearly indicates it is not receiving live data.

### Constraints

- Do not overload the chart with unnecessary information.
- One primary metric at a time; secondary metrics optional via toggle.

---

## 9. Threat Intelligence / Event Feed

A live event stream with clear severity states.

### Severity States

| Severity | Example |
|---|---|
| `INFO` | `[10:14:02] INFO — Reconnaissance started` |
| `INFO` | `[10:14:05] INFO — Service discovered on target` |
| `WARNING` | `[10:14:15] WARNING — Suspicious authentication activity detected` |
| `HIGH` | `[10:14:18] HIGH — Threat containment recommended` |
| `CRITICAL` | `[10:14:19] CRITICAL — Active intrusion in progress` |
| `SUCCESS` | `[10:14:20] SUCCESS — Threat contained` |

### Behavior

- New events appear at the top (or bottom, consistently).
- The feed auto-scrolls **carefully** — it must not destroy the user's current reading position.
- Severity is communicated through color **and** a text label / icon (accessibility).
- Events are filterable by severity.
- The feed has a clear empty state (`No events yet`).

---

## 10. System Health

Compact health cards or meters for each runtime entity.

### Entities

- **Red Team** — CPU, Memory, Status
- **Blue Team** — CPU, Memory, Status
- **Honeypot** — CPU, Memory, Status

### Presentation

- Simple bars/meters — no huge gauges.
- Status text alongside the meter (e.g., `Healthy`, `Degraded`, `Offline`).
- Compact enough to fit in a side panel.

---

## 11. Autonomous / Manual Guardrail

One of the most important interactive controls.

### Operating Modes

| Mode | Behavior |
|---|---|
| **Autonomous** | The system performs configured containment actions automatically. |
| **Manual Approval** | The system asks the human before a containment action. |

### UI Requirements

- The active mode is always clearly communicated (header + control).
- Switching modes is a deliberate, clearly labeled action.
- Mode state is reflected across the dashboard (e.g., approval panel only appears in Manual mode).

### Manual Approval Dialog

When Manual Approval is active and a threat requires action, display a serious approval panel/modal:

```
⚠ Threat detected

Source: 192.168.50.40
Severity: HIGH
Recommended action: Contain threat

[ Approve Containment ]   [ Ignore ]
```

The modal must feel like a **serious security decision**, not a normal notification:

- Strong visual weight
- Clear severity indication
- Explicit action labels
- Keyboard accessible (focus trap, Escape to dismiss, Enter to confirm)
- No accidental approval (confirmation requires an explicit click)

---

## 12. Attack Simulation Control

A dedicated demo control area for starting a controlled attack simulation.

### Lifecycle States

| State | Meaning |
|---|---|
| `Ready` | Simulation can be started |
| `Reconnaissance` | Recon phase in progress |
| `Simulation Active` | Attack simulation running |
| `Detection` | Blue Team detected the threat |
| `Containment` | Containment in progress |
| `Completed` | Simulation finished |

### UI Requirements

- The lifecycle is visible as a step indicator or progress sequence.
- The current phase is clearly highlighted.
- The control is disabled while a simulation is running.
- **No unrestricted attack controls** — this is a controlled cyber-range demonstration.

---

## 13. Honeypot / Hacker Jail

The signature feature of Shadow-Weaver. A dedicated Honeypot panel with three sub-areas.

### 13.1 Honeypot Status

| Status | Meaning |
|---|---|
| `Active` | Honeypot is running and listening |
| `Waiting` | Honeypot is armed, waiting for a session |
| `Captured` | An attacker session has been captured |
| `Offline` | Honeypot is not running |

### 13.2 Fake Terminal

Displays captured simulated attacker commands as a live terminal stream:

```
$ whoami
$ ls -la
$ cat /etc/passwd
$ uname -a
```

Requirements:

- Commands appear progressively, like a live terminal stream.
- The panel visually communicates **ATTACKER SESSION CAPTURED**.
- The UI must **not** pretend the frontend is executing real shell commands — it is displaying captured simulated input.

### 13.3 Attacker Fingerprint

When a honeypot session is captured, display a compact attacker profile:

| Field | Example |
|---|---|
| Source IP | `192.168.50.40` |
| Session ID | `SES-7F3A` |
| Detection time | `10:14:18` |
| Attack type | `Credential brute-force` |
| Severity | `HIGH` |
| Session status | `Captured` |
| Honeypot status | `Active` |

Requirements:

- Clear labels, compact layout.
- Avoid excessive fake geolocation details.
- If data is simulated, clearly indicate **`SIMULATED / DEMO DATA`**.

---

## 14. Global Kill Switch

An emergency control in an appropriate, visible location.

### UI Requirements

- Visually distinct from all other controls (e.g., red/danger styling).
- Confirmation before triggering:

```
Are you sure you want to stop the active simulation?
[ Stop Simulation ]   [ Cancel ]
```

- After triggering, show `Simulation stopped`.
- The frontend must **never** claim a backend action succeeded unless confirmation is received from the backend.

---

## 15. Connection State

The dashboard depends on real-time WebSocket data. Connection state must be handled explicitly.

| State | Display |
|---|---|
| Connected | `LIVE` |
| Connecting | `CONNECTING...` |
| Disconnected | `OFFLINE` |
| Reconnecting | `RECONNECTING...` |

### Rules

- When disconnected, the dashboard must **not** display stale data as if it were live.
- Stale data is visually dimmed or marked with a `STALE` indicator.
- Charts, feed, and topology all reflect the connection state.
- A reconnect attempt is automatic with visible status.

---

## 16. Frontend State Model

The UI must have a predictable visual response for every important state.

| State | Description |
|---|---|
| `initial_loading` | App is booting, fetching initial data |
| `connected` | WebSocket connected, receiving live data |
| `reconnecting` | Connection lost, retrying |
| `disconnected` | Connection lost, not retrying |
| `normal` | No active threat, system healthy |
| `reconnaissance` | Recon activity detected |
| `attack_active` | Attack simulation in progress |
| `threat_detected` | Blue Team detected a threat |
| `awaiting_approval` | Manual mode, waiting for human decision |
| `containment_in_progress` | Containment action executing |
| `threat_contained` | Threat successfully contained |
| `honeypot_capture_active` | Attacker session captured by honeypot |
| `simulation_completed` | Simulation finished, system stable |
| `error` | Unexpected error state |

### State Mapping

Each state maps to:

- Header status text
- Topology node/edge styling
- Overview metric emphasis
- Feed event severity
- Honeypot panel status
- Simulation control step indicator

---

## 17. Real-Time Event Model

The frontend consumes **normalized backend events** — it must not parse raw Linux logs.

### Conceptual Event Shape

```json
{
  "type": "threat_detected",
  "severity": "high",
  "source": "192.168.50.40",
  "target": "192.168.50.20",
  "timestamp": "10:14:15"
}
```

### Frontend Transformations

The frontend transforms events into:

- Alerts
- Chart data points
- Topology state changes
- Activity feed entries
- System status updates
- Honeypot updates

### Decoupling Rule

The UI stays decoupled from backend implementation details. Event types are mapped to frontend state transitions through a single normalization layer.

---

## 18. Responsive Design

### Target Devices

- **Desktop** (primary — SOC-style monitoring application)
- Laptop
- Tablet

### Rules

- Do **not** sacrifice desktop information density for mobile-friendliness.
- On smaller screens:
  - Stack major panels vertically
  - Preserve important controls (mode switch, kill switch, simulation control)
  - Allow charts to resize
  - Keep alerts accessible
  - Avoid horizontal overflow

---

## 19. Accessibility

The frontend must include:

- Keyboard-accessible controls (focusable, operable via keyboard)
- Readable contrast (WCAG AA minimum for text)
- Clear focus states (visible focus ring)
- Accessible buttons (proper roles, labels, aria attributes)
- Meaningful labels (not icon-only without accessible names)
- Status information communicated through more than color alone (text + icon + color)
- Reduced-motion consideration (`prefers-reduced-motion` support)

---

## 20. Demo / Judge Experience

The ideal hackathon demo sequence:

| Step | On-Screen Experience |
|---|---|
| 1 | Dashboard opens — `SYSTEM ONLINE`, `AUTONOMOUS MODE` |
| 2 | User starts the controlled simulation |
| 3 | Reconnaissance appears in the event feed |
| 4 | Red Team activity appears on the topology |
| 5 | Traffic graph spikes |
| 6 | Blue Team detects suspicious activity |
| 7 | Honeypot captures a simulated attacker session |
| 8 | Fake terminal begins displaying captured commands |
| 9 | Attacker fingerprint appears |
| 10 | Containment event appears |
| 11 | Dashboard returns to a stable state |

The entire sequence must be understandable **without reading documentation**.

---

## 21. Frontend Component Structure

Conceptual component structure (adapt to the actual codebase architecture):

```text
App
├── DashboardShell
│
├── Header
│   ├── SystemStatus
│   ├── ConnectionStatus
│   └── ModeSwitch
│
├── SecurityOverview
│   ├── ThreatCard
│   ├── TrafficCard
│   ├── CaptureCard
│   └── HealthCard
│
├── NetworkTopology
│
├── TrafficAnalytics
│
├── ThreatFeed
│
├── SystemHealth
│
├── HoneypotPanel
│   ├── HoneypotStatus
│   ├── FakeTerminal
│   └── AttackerFingerprint
│
├── SimulationControls
│
├── ApprovalDialog
│
└── KillSwitch
```

This is a conceptual structure — do not force it onto the codebase if the repository already uses another architecture.

---

## 22. Frontend Data Requirements

The frontend requires the following data streams from the backend (via WebSocket / API):

| Data | Purpose |
|---|---|
| System status | Header, health overview |
| Connection/heartbeat | Connection state indicator |
| Operating mode | Mode switch state |
| Threat events | Event feed, alerts, overview metrics |
| Traffic metrics | Traffic chart |
| Entity health (CPU/memory/status) | System health cards |
| Topology state | Node/edge states in topology |
| Honeypot status | Honeypot panel |
| Captured commands | Fake terminal stream |
| Attacker fingerprint | Attacker profile panel |
| Simulation state | Simulation control lifecycle |
| Containment status | Approval dialog, containment progress |

### Data Integrity Rules

- Never display stale data as live.
- Never claim a backend action succeeded without backend confirmation.
- Clearly mark simulated/demo data.
- Handle missing/empty data with proper empty states.

---

## 23. Success Criteria

The frontend product is successful if:

- A judge understands the product quickly.
- Live events update without page refresh.
- Attack activity is visually obvious.
- Threat severity is easy to understand.
- Honeypot capture is visually compelling.
- Manual approval is clear.
- Autonomous mode is obvious.
- System connection state is trustworthy.
- The dashboard does not feel cluttered.
- The interface looks intentionally designed rather than AI-generated.
- Every important backend event has an appropriate frontend representation.
- The complete **attack → detect → deceive → respond** lifecycle can be demonstrated from one dashboard.