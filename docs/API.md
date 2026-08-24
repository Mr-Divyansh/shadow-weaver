# Shadow-Weaver Suite — Frontend API & WebSocket Contract

> **Document type:** Frontend data contract
> **Audience:** Frontend developers
> **Scope:** The real-time data streams the frontend consumes. Defines the normalized event model, connection lifecycle, and data-shape expectations for each dashboard component.
> **Note:** The backend owns its own API implementation. This document defines the **frontend-facing contract** — the shapes the frontend expects and renders.

---

## 1. Transport

The dashboard depends on **real-time WebSocket data** for live updates.

| Aspect | Contract |
|---|---|
| Transport | WebSocket (primary real-time) |
| REST/HTTP | Initial state fetch (optional) |
| Primary data | Normalized JSON events |

### Connection Lifecycle

The frontend manages four explicit connection states:

| State | UI Label |
|---|---|
| `connected` | `LIVE` |
| `connecting` | `CONNECTING...` |
| `disconnected` | `OFFLINE` |
| `reconnecting` | `RECONNECTING...` |

Rules:

- Reconnect attempts are automatic with visible status.
- When disconnected, the dashboard must **not** display stale data as live.
- Stale data is visually dimmed or marked `STALE`.

---

## 2. Normalized Event Model

The frontend consumes **normalized backend events**. It must never parse raw Linux logs.

### Core Event Shape

```json
{
  "type": "threat_detected",
  "severity": "high",
  "source": "192.168.50.40",
  "target": "192.168.50.20",
  "timestamp": "10:14:15"
}
```

### Event Fields

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Normalized event type (see section 3) |
| `severity` | `string` | `info` \| `warning` \| `high` \| `critical` \| `success` |
| `source` | `string` | Source IP / entity (e.g., `192.168.50.40`, `red_team`) |
| `target` | `string` | Target IP / entity (e.g., `192.168.50.20`, `blue_team`) |
| `timestamp` | `string` | `HH:MM:SS` or ISO 8601 |
| `message` | `string` *(optional)* | Human-readable summary |
| `session_id` | `string` *(optional)* | Honeypot session ID |
| `command` | `string` *(optional)* | Captured honeypot command |

### Frontend Transformation

The frontend transforms events into:

- Alerts
- Chart data points
- Topology state changes
- Activity feed entries
- System status updates
- Honeypot updates

This mapping is handled by a single **normalization layer** to keep the UI decoupled from backend implementation details.

---

## 3. Event Types

### 3.1 System & Connection

| Event Type | UI Effect |
|---|---|
| `system_online` | Header → `SYSTEM ONLINE` |
| `system_offline` | Header → `SYSTEM OFFLINE` |
| `connection_established` | Connection → `LIVE` |
| `connection_lost` | Connection → `OFFLINE` / `RECONNECTING...` |
| `mode_changed` | Mode switch reflects new mode |

### 3.2 Simulation

| Event Type | UI Effect |
|---|---|
| `simulation_started` | Simulation control → `Simulation Active` |
| `simulation_phase_changed` | Step indicator advances |
| `simulation_completed` | Simulation control → `Completed` |
| `simulation_stopped` | Kill switch confirmation → `Simulation stopped` |

### 3.3 Attack / Reconnaissance

| Event Type | UI Effect |
|---|---|
| `reconnaissance_started` | Feed event, topology edge highlight begins |
| `service_discovered` | Feed event (`INFO`) |
| `attack_started` | Topology: Red Team → target edge active; traffic spikes |
| `attack_active` | Topology attack state persists |
| `attack_ended` | Topology returns to normal |

### 3.4 Detection & Response

| Event Type | UI Effect |
|---|---|
| `threat_detected` | Alert + feed (`HIGH`/`CRITICAL`), overview metric increments |
| `suspicious_activity` | Feed event (`WARNING`) |
| `containment_recommended` | Manual mode → approval dialog; Autonomous mode → auto-contain |
| `containment_approved` | Dialog closes, containment begins |
| `containment_ignored` | Dialog dismisses, event logged |
| `containment_in_progress` | Containment state active |
| `threat_contained` | Feed event (`SUCCESS`), overview contained metric increments, topology returns to normal |

### 3.5 Honeypot

| Event Type | UI Effect |
|---|---|
| `honeypot_active` | Honeypot status → `Active` |
| `honeypot_waiting` | Honeypot status → `Waiting` |
| `honeypot_session_captured` | Honeypot status → `Captured`; fingerprint appears; terminal activates |
| `honeypot_command` | Fake terminal appends `command` line |
| `honeypot_offline` | Honeypot status → `Offline` |

---

## 4. Dashboard Data Streams

The frontend requires these data streams:

| Data | Source | Purpose |
|---|---|---|
| System status | Event / initial state | Header, health overview |
| Connection/heartbeat | WebSocket lifecycle | Connection indicator |
| Operating mode | Initial state + events | Mode switch |
| Threat events | Event stream | Feed, alerts, overview metrics |
| Traffic metrics | Metric stream | Traffic chart |
| Entity health (CPU/memory/status) | Metric stream | Health cards |
| Topology state | Event stream | Node/edge states |
| Honeypot status | Event stream | Honeypot panel |
| Captured commands | `honeypot_command` events | Fake terminal |
| Attacker fingerprint | `honeypot_session_captured` payload | Attacker profile |
| Simulation state | Event stream | Simulation control |
| Containment status | Event stream | Approval dialog, progress |

---

## 5. Metric Streams

The frontend consumes periodic metric snapshots for charts and health meters.

### Traffic Metrics

```json
{
  "type": "traffic_metric",
  "timestamp": "10:14:15",
  "requests_per_sec": 42,
  "packets_per_sec": 1280,
  "traffic_volume": 8.4
}
```

### Entity Health

```json
{
  "type": "health_metric",
  "entity": "blue_team",
  "cpu": 38,
  "memory": 62,
  "status": "healthy"
}
```

Supported entities: `red_team`, `blue_team`, `honeypot`.

---

## 6. Domain Events

The frontend never imports backend domain concepts. It only knows normalized event types above.

- **No raw Linux logs.**
- **No container names / Docker abstractions.**
- **No firewall rules / iptables.**
- The backend normalizes everything into the event model in this document.

---

## 7. Empty / Missing Data

| Scenario | Frontend Behavior |
|---|---|
| No events yet | Feed empty state: `No events yet` |
| No traffic data | Chart empty state |
| No capture yet | Honeypot shows `Waiting` + placeholder |
| Simulated data | Fields labeled `SIMULATED / DEMO DATA` |
| Disconnected | All panels reflect connection state; stale data dimmed |

---

## 8. Integrity Rules

1. Never display stale data as live.
2. Never claim a backend action succeeded without backend confirmation.
3. Always mark simulated/demo data.
4. Always handle empty and error states.
5. Reconnect is automatic; the UI is never silent about connection loss.