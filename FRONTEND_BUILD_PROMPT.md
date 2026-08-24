# Shadow-Weaver Suite — Frontend Build Prompt (Handoff Document)

> **Usage:** Copy everything below the line into a capable coding AI to build the complete Shadow-Weaver Suite frontend. The repository already contains the product specification, design system, API contract, architecture, and roadmap. Read `PRODUCT.md`, `docs/DESIGN.md`, `docs/API.md`, `ARCHITECTURE.md`, and `ROADMAP.md` first.

---

## AUDIENCE

You are a **senior frontend developer**. Build the complete frontend for **Shadow-Weaver Suite** — a Real-Time AI Cyber Defense SOC Dashboard — inside the `frontend/` directory of this repository.

## WHAT TO READ FIRST

Read these files in order — they are the single source of truth:

1. `PRODUCT.md` — product requirements, UX principles, states, screens
2. `docs/DESIGN.md` — design tokens, component styling, accessibility
3. `docs/API.md` — normalized event types, metric streams, connection contract
4. `ARCHITECTURE.md` — component structure, state slices, data flow
5. `ROADMAP.md` — phased plan and exit criteria

## STACK (RECOMMENDED — you may use any equivalent modern stack)

- React 18 + TypeScript (+ Vite)
- No heavy UI libraries — custom CSS with design tokens from `docs/DESIGN.md`
- No chart library required — a clean SVG line chart is acceptable and preferred
- State: lightweight store (Zustand or a small `useSyncExternalStore` store)

## WHAT TO BUILD

### 1. Dashboard Shell Layout

Single-page SOC command center:

- Sticky header with branding, `SYSTEM ONLINE`, `LIVE CONNECTION`, `AUTONOMOUS/MANUAL MODE`, live dot, settings icon
- **Security Overview** row — 6 metric cards: Active Threats, Threats Detected, Threats Contained, Honeypot Captures, Network Traffic, System Health
- **Network Topology** panel — 3 nodes: Red Team → Blue Team, Red Team → Honeypot. Subtle lines normally; animated directional highlight during attack
- **Live Traffic Analytics** panel — real-time chart with axis labels, tooltips, empty state, stale-data overlay when disconnected
- **Threat Intelligence / Event Feed** panel — live events with severity badges (INFO/WARNING/HIGH/CRITICAL/SUCCESS), severity filter, careful auto-scroll, `role="log"` live region
- **System Health** panel — compact CPU + memory + status meters for Red Team, Blue Team, Honeypot
- **Honeypot / Hacker Jail** panel — honeypot status (Active/Waiting/Captured/Offline), fake terminal streaming captured commands, attacker fingerprint card with `SIMULATED / DEMO DATA` badge
- **Simulation Control** panel — lifecycle stepper: Ready → Reconnaissance → Simulation Active → Detection → Containment → Completed + Start Simulation button + **Kill Switch** (red, distinct, confirm step)
- **Approval Dialog** — serious modal for Manual mode: Source, Severity, Recommended action, `Approve Containment` / `Ignore`, focus trap, Escape dismiss

### 2. Data Provider / Mock Simulation Engine
- Implement `DataProvider` interface with live mock data. If the real backend WebSocket is available, implement a `WebSocketProvider` with identical interface, reconnect backoff, and normalized events.
- Mock timeline (normalized events per `docs/API.md`):
  1. Connection: `connecting` → `connected` (after ~1s), then system online events
  2. Traffic: random 20–80 req/s when normal; 500–1700 req/s when attack active
  3. Health: CPU/memory jitter every 2s for all three entities
  4. On `startSimulation()`:
     - `simulation_started`, phase `reconnaissance`
     - `reconnaissance_started`, `service_discovered`
     - `suspicious_activity` (warning)
     - phase `active`, `attack_started` (high)
     - phase `detection`, `threat_detected` (high)
     - `honeypot_session_captured` (critical) → fingerprint card visible, terminal streams commands (~9 commands, one every ~900ms)
     - Containment at ~9s: **if mode=manual → `containment_recommended` + approval dialog; if mode=autonomous → auto-contain**
     - `containment_in_progress` → phase `containment`
     - `threat_contained` (success), `simulation_completed`, phase `completed`
  5. Mode toggle emits `mode_changed` + updates header
  6. Kill switch: `simulation_stopped` warning; clears to `Ready`; approval dismissed

### 3. {State Model}
Map every event to store transitions (single normalizer). Cover at minimum: `initial_loading`, `connected`, `reconnecting`, `disconnected`, `normal`, `reconnaissance`, `attack_active`, `threat_detected`, `awaiting_approval`, `containment_in_progress`, `threat_contained`, `honeypot_capture_active`, `simulation_completed`, `error`.

### 4. Connection States
Clear visual states: `LIVE`, `CONNECTING...`, `OFFLINE`, `RECONNECTING...` in the header. When disconnected, never display stale data as live — dim/stale overlay on traffic chart and network topology.

### 5. Design & A11y
- Follow `docs/DESIGN.md` exactly: tokens, type scale, status colors, spacing, radii, dashed attack edge animation, reduced-motion `prefers-reduced-motion`
- WCAG AA color contrast, visible focus rings, keyboard operability, focus trap in modal, screen-reader live regions
- Dark theme only, professional SOC look — no neon/glow/Matrix rain

### 6. Responsive
- Desktop-first (primary), Laptop, Tablet. On smaller widths panels stack, charts resize, no horizontal overflow; preserve controls (mode, kill, start).

## DELIVERABLES

- Complete source code in `frontend/` (or equivalent)
- Buildable: `npm install && npm run dev` works
- Follow the components from `ARCHITECTURE.md` (`Header`, `SecurityOverview`, `NetworkTopology`, `TrafficAnalytics`, `ThreatFeed`, `SystemHealth`, `HoneypotPanel`, `SimulationControls`, `ApprovalDialog`, `KillSwitch`)
- Clean design: as if a real SOC product, not a generic AI dashboard

## CONSTRAINTS

- Do **NOT** modify the backend docs, backend code, or outside `frontend/`.
- Front-end must never parse raw Linux logs or import backend models.
- No real attack scripts / exploitation logic in the frontend.
- If no backend exists yet, the mock simulator is the fallback—design the layer so it can be swapped for a real WebSocket plugin.