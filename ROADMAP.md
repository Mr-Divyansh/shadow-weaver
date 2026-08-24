# Shadow-Weaver Suite — Frontend Development Roadmap

> **Document type:** Frontend roadmap
> **Audience:** Frontend developers, project leads
> **Scope:** Phased plan for building the Shadow-Weaver Suite dashboard frontend, from scaffold to polish.

---

## Phase 0 — Foundation

**Goal:** Working skeleton with design tokens and connection handling.

- [ ] Scaffold the frontend app (framework of choice — React / Vue / Svelte)
- [ ] Set up TypeScript and shared types (events, metrics, state)
- [ ] Implement design tokens from [`docs/DESIGN.md`](./docs/DESIGN.md) (CSS variables)
- [ ] Build the base `DashboardShell` layout grid
- [ ] Implement the WebSocket client with the four connection states (`LIVE` / `CONNECTING...` / `OFFLINE` / `RECONNECTING...`)
- [ ] Build the event normalizer (backend event → store transition) per [`docs/API.md`](./docs/API.md)
- [ ] Set up state management with slices: `connection`, `system`, `metrics`, `events`, `topology`, `honeypot`, `simulation`, `approval`
- [ ] Dark theme base + `prefers-reduced-motion` support

**Exit criteria:** App boots, connects to a (stubbed) WebSocket, shows connection state, and renders an empty dashboard shell.

---

## Phase 1 — Core Dashboard

**Goal:** All major panels visible when receiving (stubbed) live data.

- [ ] **Header** — branding, system status, connection status, mode switch placeholder, live indicator
- [ ] **Security Overview** — 6 metric cards: active threats, detected, contained, honeypot captures, traffic, health
- [ ] **Network Topology** — three nodes (Red Team, Blue Team, Honeypot) with simple `Red → Blue` and `Red → Honeypot` edges
- [ ] **Traffic Analytics** — real-time chart with smooth streaming, axis labels, tooltips, empty state
- [ ] **Threat Feed** — severity-styled event list (`INFO` / `WARNING` / `HIGH` / `CRITICAL` / `SUCCESS`) with filtering
- [ ] **System Health** — compact CPU / memory / status meters for all three entities

**Exit criteria:** A judge can open the dashboard and understand system health and the three entities without reading anything.

---

## Phase 2 — Attack Lifecycle Visualization

**Goal:** The attack → detect → deceive → respond story is visually obvious.

- [ ] Topology attack states: edge highlighting, directional flow on attack
- [ ] Traffic chart spike during attack activity
- [ ] Simulation control stepper: `Ready → Reconnaissance → Simulation Active → Detection → Containment → Completed`
- [ ] Event feed drives all panels (single navigation layer)
- [ ] Connection loss behavior: stale data dimmed, no stale-as-live
- [ ] Integration test: full lifecycle from simulation start to containment

**Exit criteria:** The complete 11-step demo journey works end-to-end from one dashboard.

---

## Phase 3 — Honeypot & Deception

**Goal:** The signature Honeypot / Hacker Jail feature is complete.

- [ ] Honeypot status panel: `Active` / `Waiting` / `Captured` / `Offline`
- [ ] Fake terminal: live line-by-line command stream with `ATTACKER SESSION CAPTURED` header
- [ ] Attacker fingerprint panel: source IP, session ID, detection time, attack type, severity, session status
- [ ] `SIMULATED / DEMO DATA` labeling on simulated fields
- [ ] Honeypot capture drives topology + feed + overview simultaneously

**Exit criteria:** A captured session is visually compelling and clearly labeled as simulated.

---

## Phase 4 — Guardrails & Controls

**Goal:** Operator controls are safe, clear, and trustworthy.

- [ ] **Mode switch** — `AUTONOMOUS` / `MANUAL APPROVAL`, reflected in header and store
- [ ] **Approval dialog** — serious-modal styling, focus trap, Escape / Enter handling, `Approve Containment` / `Ignore`
- [ ] **Kill switch** — visually distinct, confirmation step, `Simulation stopped` only after backend confirmation
- [ ] Disabled states while a simulation runs
- [ ] No success claims without backend confirmation

**Exit criteria:** Manual approval is a deliberate security decision; autonomous mode is obvious.

---

## Phase 5 — Polish, Accessibility & Responsive

**Goal:** Production-quality finish.

- [ ] Full keyboard navigation with visible focus states
- [ ] WCAG AA contrast verification
- [ ] Screen-reader live regions for feed and terminal
- [ ] `prefers-reduced-motion` fully honored
- [ ] Responsive: desktop (primary) → laptop → tablet stacking; no horizontal overflow
- [ ] Consistent empty / loading / error states everywhere
- [ ] Performance: state-slice subscriptions, throttled chart updates, capped feed history
- [ ] Unit + component + integration + E2E test suite

**Exit criteria:** The dashboard feels intentionally designed, trustworthy, and ready for a hackathon judge.

---

## Out of Scope (Frontend)

- Backend implementation (FastAPI, Docker, firewall, Linux, database)
- Attack scripts / real exploitation logic
- Backend security logic

The frontend only consumes the normalized event contract defined in [`docs/API.md`](./docs/API.md).