# Shadow-Weaver Suite — Frontend Architecture

> **Document type:** Frontend architecture specification
> **Audience:** Frontend developers
> **Scope:** Component structure, state management, data flow, connection handling, and how the dashboard renders the attack → detect → deceive → respond lifecycle.

---

## 1. Architecture Principles

- **Component-driven** — a clear component tree with single responsibilities.
- **State-driven UI** — every important dashboard state has a predictable visual response.
- **Decoupled from backend** — the frontend consumes normalized events only; it never parses raw Linux logs or imports backend domain concepts.
- **Real-time first** — WebSocket data drives the UI; REST is optional for initial state.
- **Trustworthy** — stale data is never displayed as live; backend confirmations gate success states.

---

## 2. High-Level Data Flow

```
Backend (normalized events)
        │
        ▼
WebSocket Client ──► Event Normalizer ──► Store / State
        │                                      │
        ▼                                      ▼
Connection Store                     Component Selectors
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
              Dashboard UI (components)
```

1. WebSocket delivers normalized JSON events.
2. The event normalizer maps event types to state transitions.
3. The store holds the canonical application state.
4. Components subscribe to slices of state and render.

---

## 3. Component Structure

Conceptual structure (adapt to the actual framework — React/Vue/Svelte — used in the codebase):

```text
App
├── DashboardShell
│
├── Header
│   ├── SystemStatus
│   ├── ConnectionStatus
│   ├── LiveIndicator
│   ├── ModeSwitch
│   └── SettingsMenu
│
├── SecurityOverview
│   ├── ThreatCard
│   ├── TrafficCard
│   ├── CaptureCard
│   └── HealthCard
│
├── NetworkTopology
│   ├── TopologyNode        (Red Team / Blue Team / Honeypot)
│   └── TopologyEdge        (connection lines, attack highlighting)
│
├── TrafficAnalytics
│   └── TrafficChart
│
├── ThreatFeed
│   ├── FeedEvent
│   └── FeedFilter
│
├── SystemHealth
│   └── HealthMeter
│
├── HoneypotPanel
│   ├── HoneypotStatus
│   ├── FakeTerminal
│   └── AttackerFingerprint
│
├── SimulationControls
│   └── SimulationStepper
│
├── ApprovalDialog
│
└── KillSwitch
└── ConfirmDialog
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| `DashboardShell` | Grid layout, panel arrangement, responsive behavior |
| `Header` | System / connection / mode / live status cluster |
| `SecurityOverview` | Render live security metrics |
| `NetworkTopology` | Render the three entities and connection states |
| `TrafficAnalytics` | Render the live traffic chart |
| `ThreatFeed` | Render the live event stream with severity states |
| `SystemHealth` | Render CPU / memory / status meters |
| `HoneypotPanel` | Honeypot status, fake terminal, attacker fingerprint |
| `SimulationControls` | Demo lifecycle stepper and start control |
| `ApprovalDialog` | Manual mode approval flow |
| `KillSwitch` | Emergency simulation stop with confirmation |

---

## 4. State Management

### State Slices

The store is organized into slices:

| Slice | Contains |
|---|---|
| `connection` | `connected` \| `connecting` \| `disconnected` \| `reconnecting` |
| `system` | System status, operating mode |
| `metrics` | Traffic metrics, entity health |
| `events` | Event feed entries |
| `topology` | Node states, edge states, active attack direction |
| `honeypot` | Honeypot status, captured commands, attacker fingerprint |
| `simulation` | Simulation phase, lifecycle step |
| `approval` | Pending approval request, dialog visibility |

### State Transition Rules

Every important state transition comes from a normalized event. Examples:

| Event | State Transition |
|---|---|
| `threat_detected` | `topology.attackActive = true`; `events` appended; overview metric increment |
| `honeypot_session_captured` | `honeypot.status = "captured"`; fingerprint populated |
| `containment_recommended` | Manual mode → `approval.pending = true`; Autonomous → auto-contain |
| `threat_contained` | `topology.attackActive = false`; `simulation` advances; feed `SUCCESS` |
| `connection_lost` | `connection = "disconnected"`; all panels reflect stale state |

---

## 5. Frontend State Model

The dashboard has a predictable visual response for every important state:

| State | Description | Visual Response |
|---|---|---|
| `initial_loading` | App booting | Skeletons, `CONNECTING...` |
| `connected` | WebSocket live | `LIVE` indicator |
| `reconnecting` | Retrying | `RECONNECTING...` |
| `disconnected` | Connection lost | `OFFLINE`, stale data dimmed |
| `normal` | No active threat | Stable panels |
| `reconnaissance` | Recon detected | Edges highlight, feed `INFO` |
| `attack_active` | Attack running | Topology edge active, traffic spikes |
| `threat_detected` | Threat found | Alert + severity badge |
| `awaiting_approval` | Manual mode pending | Approval dialog |
| `containment_in_progress` | Containment executing | Progress indicator |
| `threat_contained` | Contained | `SUCCESS` feed event, stable state |
| `honeypot_capture_active` | Session captured | Terminal + fingerprint appear |
| `simulation_completed` | Demo finished | Stepper shows `Completed` |
| `error` | Unexpected error | `ERROR` state, retry option |

---

## 6. Event Normalization Layer

A single normalization layer maps backend events to frontend state.

### Input

```json
{
  "type": "threat_detected",
  "severity": "high",
  "source": "192.168.50.40",
  "target": "192.168.50.20",
  "timestamp": "10:14:15"
}
```

### Output

- A feed entry (severity, message, timestamp)
- A topology state change (edge highlight)
- An overview metric increment
- An optional alert (if severity ≥ threshold)

The frontend never knows about Linux, Docker, containers, or firewall internals.

---

## 7. Connection Handling

### WebSocket Lifecycle

| State | Behavior |
|---|---|
| `connecting` | Retry with backoff, show `CONNECTING...` |
| `connected` | Show `LIVE`, process events |
| `reconnecting` | Keep last UI, dim stale data, show `RECONNECTING...` |
| `disconnected` | Show `OFFLINE`, freeze updates, no stale-as-live |

### Rules

- On reconnect, resync initial state + recent events.
- Heartbeat/ping keeps the connection alive.
- Simulation and approval states survive reconnect if backend confirms them.

---

## 8. Real-Time Rendering

### Chart

- Append metric points to a sliding time window.
- Animate transitions smoothly (200–300ms ease-out).
- Spike during `attack_active` states.

### Feed

- Prepend/append events with fade-in.
- Auto-scroll without destroying the user's reading position.
- Severity filtering client-side.

### Fake Terminal

- Append `honeypot_command` events line-by-line with a small delay for a live feel.
- Terminal header shows `ATTACKER SESSION CAPTURED`.

---

## 9. Rendering Performance

- Panels subscribe only to their state slice — no full-tree re-renders.
- Charts throttle updates (e.g., 1 point/sec max) and batch renders.
- The event feed caps history (e.g., last 500 events).
- Metal: prefer canvas/SVG for the topology and chart.
- Avoid layout thrash; use transforms for animations.

---

## 10. Styling Approach

- Uses the design tokens defined in [`docs/DESIGN.md`](./docs/DESIGN.md).
- CSS variables for all colors, spacing, radii, shadows.
- Component-scoped styles; no global style bleed.
- Dark theme only (SOC product).

---

## 11. Testing Considerations

| Level | Focus |
|---|---|
| Unit | Event normalizer mapping, state transitions, severity logic |
| Component | Each panel renders correct state for a given store slice |
| Integration | Full lifecycle: simulation start → recon → attack → detect → capture → contain |
| E2E | Connection states, approval dialog flow, kill switch confirmation |

---

## 12. Conventions

- **Naming:** `camelCase` for state/events; `PascalCase` components; `snake_case` for backend event types.
- **Types:** Shared TypeScript types for events, metrics, and state — a single source of truth.
- **Pure components:** State updates via store actions; components stay declarative.
- **No backend imports:** The frontend never references backend models, logs, or infrastructure.