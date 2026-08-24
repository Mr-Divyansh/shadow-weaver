# Shadow-Weaver Suite — Frontend Design System

> **Document type:** Frontend design specification
> **Audience:** Frontend developers, UI designers
> **Scope:** Visual language, color, typography, spacing, components, states, accessibility.

---

## 1. Design Philosophy

**Modern Security Operations Center + clean developer product.**

The interface is dark, clean, modern, minimal, responsive, information-dense, and professional. It must feel intentionally designed — not AI-generated and not a movie-style hacker screen.

### Avoid

- Excessive neon effects
- Unnecessary gradients
- Huge glowing cards
- Excessive animations
- Random decorative elements
- Fake 3D effects
- Matrix rain
- Giant glowing text
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

## 2. Color System

### Base Colors (Dark Theme)

| Token | Purpose | Suggested Value |
|---|---|---|
| `--bg-app` | Application background | Near-black slate `#0B0E14` |
| `--bg-surface` | Panel/card background | Dark slate `#11151D` |
| `--bg-surface-raised` | Elevated surfaces (modals, dropdowns) | `#161B26` |
| `--bg-hover` | Hover state background | `#1B2230` |
| `--border-subtle` | Panel borders | `#1E2533` |
| `--border-strong` | Focus / active borders | `#2A3348` |

### Text Colors

| Token | Purpose | Suggested Value |
|---|---|---|
| `--text-primary` | Primary text | `#E6EAF2` |
| `--text-secondary` | Secondary text / labels | `#9AA4B8` |
| `--text-muted` | Muted / disabled text | `#5A6478` |
| `--text-inverse` | Text on accent backgrounds | `#0B0E14` |

### Status / Severity Colors

| Token | Purpose | Suggested Value |
|---|---|---|
| `--status-success` | Healthy / SUCCESS | Green `#2FB87B` |
| `--status-info` | INFO / neutral | Blue `#3B82F6` |
| `--status-warning` | WARNING | Amber `#F59E0B` |
| `--status-high` | HIGH | Orange `#F97316` |
| `--status-critical` | CRITICAL / danger / kill switch | Red `#EF4444` |
| `--status-offline` | Offline / disconnected | Gray `#6B7280` |

### Accent Colors

| Token | Purpose | Suggested Value |
|---|---|---|
| `--accent-primary` | Primary interactive accent | Desaturated cyan `#38BDF8` |
| `--accent-honeypot` | Honeypot signature accent | Muted violet `#A78BFA` |

### Usage Rules

- Status colors are used **alongside text labels/icons** — never color alone.
- Accent colors are subtle; no glowing cards.
- High-contrast text on all surfaces (WCAG AA minimum).

---

## 3. Typography

### Font Family

- `Inter`, `system-ui`, `-apple-system`, `Segoe UI`, sans-serif
- Monospace for terminal, IPs, timestamps, and event codes: `JetBrains Mono`, `Fira Code`, `Consolas`, monospace

### Type Scale

| Token | Size | Weight | Use |
|---|---|---|---|
| `--text-xs` | 11px | 500 | Labels, badges |
| `--text-sm` | 13px | 400/500 | Secondary text, table cells |
| `--text-base` | 14px | 400 | Body text |
| `--text-md` | 16px | 500 | Section titles |
| `--text-lg` | 20px | 600 | Panel headers |
| `--text-xl` | 26px | 600 | Overview metric values |
| `--text-2xl` | 32px | 700 | Hero status (rare) |

### Rules

- Uppercase letter-spaced labels for status text (`SYSTEM ONLINE`) — letter-spacing `0.08em`.
- Numbers use tabular figures for stable alignment in metrics.
- No more than 2–3 type sizes per panel.

---

## 4. Spacing & Layout

### Spacing Scale

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |
| `--space-7` | 48px |

### Layout Rules

- Consistent 8px-based spacing grid.
- Panel padding: `16px` default, `24px` for large panels.
- Gutter between panels: `16px`.
- Maximum content width: full-width dashboard (SOC layout) with `24px` page padding.
- Compact information density — do not leave excessive whitespace.

---

## 5. Radii & Shadows

### Border Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Badges, chips, small controls |
| `--radius-md` | 6px | Buttons, inputs, cards |
| `--radius-lg` | 8px | Panels, modals |
| `--radius-full` | 999px | Pills, status dots |

### Shadows

| Token | Value | Use |
|---|---|---|
| `--shadow-panel` | `0 1px 2px rgba(0,0,0,0.3)` | Default panels |
| `--shadow-raised` | `0 4px 16px rgba(0,0,0,0.4)` | Modals, dropdowns |
| `--shadow-focus` | `0 0 0 2px rgba(56,189,248,0.4)` | Focus rings |

- No glowing or neon shadows.

---

## 6. Status Indicators

### System Status Dot

| State | Color | Label |
|---|---|---|
| Online | `--status-success` | `SYSTEM ONLINE` |
| Degraded | `--status-warning` | `SYSTEM DEGRADED` |
| Offline | `--status-offline` | `SYSTEM OFFLINE` |

### Connection Status

| State | Color | Label |
|---|---|---|
| Connected | `--status-success` | `LIVE` |
| Connecting | `--status-warning` | `CONNECTING...` |
| Disconnected | `--status-critical` | `OFFLINE` |
| Reconnecting | `--status-warning` | `RECONNECTING...` |

- Live indicator: small pulsing dot (respect `prefers-reduced-motion`).

### Severity Badges

| Severity | Background | Text |
|---|---|---|
| `INFO` | `--status-info` (subtle bg) | `INFO` |
| `WARNING` | `--status-warning` (subtle bg) | `WARNING` |
| `HIGH` | `--status-high` (subtle bg) | `HIGH` |
| `CRITICAL` | `--status-critical` (subtle bg) | `CRITICAL` |
| `SUCCESS` | `--status-success` (subtle bg) | `SUCCESS` |

- Badges use subtle tinted backgrounds (`color-mix` 10–15% of status color over surface) with the status color for text/border.
- Always include the text label — never color alone.

---

## 7. Components

### 7.1 Header

- Height: `56px`, full-width, sticky.
- Background: `--bg-app` with bottom border `--border-subtle`.
- Left: branding. Center/right: status cluster (system, connection, mode, live).
- Right: settings/control access.
- Compact, uncluttered, visually stable.

### 7.2 Panels / Cards

- Background `--bg-surface`, border `--border-subtle`, radius `--radius-lg`.
- Panel header: `--text-lg` title + optional action icon.
- Consistent padding `--space-4`–`--space-5`.
- No glowing borders, no drop shadows beyond `--shadow-panel`.

### 7.3 Metric Cards (Security Overview)

- Value in `--text-xl` (tabular figures), label in `--text-sm` `--text-secondary`.
- Optional small trend indicator.
- Critical values emphasize the status color, not a glow.

### 7.4 Buttons

| Variant | Style |
|---|---|
| Primary | `--accent-primary` background, `--text-inverse` text |
| Secondary | Surface background, border `--border-strong` |
| Danger | `--status-critical` background, white text |
| Ghost | No background, text only |

- Height: `32px` (compact) / `40px` (standard).
- Radius: `--radius-md`.
- Clear focus ring: `--shadow-focus`.
- Disabled state: `opacity 0.5`, no pointer events.

### 7.5 Toggle / Mode Switch

- Clearly labeled: `AUTONOMOUS` / `MANUAL APPROVAL`.
- Active mode highlighted with accent.
- State reflected in header, not just the switch.

### 7.6 Topology Nodes

| Node | Identity Color |
|---|---|
| Red Team | `--status-critical` accent |
| Blue Team | `--status-info` accent |
| Honeypot | `--accent-honeypot` accent |

- Node: rounded square, label below, status badge.
- Edge: subtle line `1.5px` `--border-strong`.
- Attack edge: highlighted with source color + subtle directional animation.

### 7.7 Health Meters

- Thin horizontal bar (`6px` height), `--radius-full`.
- Fill color by status: success / warning / critical.
- Label + percentage / status text beside the bar.

### 7.8 Fake Terminal

- Background: near-black `#05070A`.
- Monospace font, `--text-sm`.
- Command lines with alternating prompt/output styling.
- Header bar: `ATTACKER SESSION CAPTURED` with `--status-critical` or `--accent-honeypot` tint.

### 7.9 Approval Dialog

- Modal: `--bg-surface-raised`, `--shadow-raised`, radius `--radius-lg`.
- Warning icon + severity badge at top.
- Fields: Source, Severity, Recommended action.
- Buttons: `Approve Containment` (danger styled) + `Ignore` (secondary).
- Focus trap, Escape closes, Enter confirms.

### 7.10 Kill Switch

- Compact red button, always visible in a consistent location.
- Distinct: `--status-critical` solid styling, white text, warning icon.
- Confirmation step before triggering.

---

## 8. Animation & Motion

### Principles

- **Purposeful** — animation communicates state change, never decoration.
- **Calm** — short durations, subtle easing, no chaos.
- **Respect reduced motion** — honor `prefers-reduced-motion`.

### Durations & Easing

| Use | Duration | Easing |
|---|---|---|
| Hover / focus | 120ms | ease-out |
| Panel / state transitions | 200ms | ease-out |
| Live indicator pulse | 2s loop | ease-in-out |
| Attack edge flow | 1.5s loop | linear |
| Count / value transitions | 300ms | ease-out |

### Allowed Animations

- Connection line flow during attack
- Live dot pulse
- Fake terminal line-by-line appearance
- Metric value transitions
- Panel/feed entry fade-in

### Disallowed

- Continuous background animation
- Screen shake / glitch effects
- Parallax / scroll effects
- Matrix rain

---

## 9. Icons

- Use a consistent icon set (e.g., Lucide, Phosphor).
- Stroke-based, `1.5px` stroke, `16px` / `20px` sizes.
- Semantic icons for statuses: shield (health), crosshair (threat), network (topology), terminal (honeypot), alert-triangle (warning), power (kill switch).
- Every icon button has an accessible label or `aria-label`.

---

## 10. Accessibility

- **Contrast:** WCAG AA minimum (4.5:1 text, 3:1 large text/UI).
- **Focus:** visible focus ring on all interactive elements.
- **Keyboard:** full keyboard navigation, focus trap in modals, Escape to dismiss.
- **Labels:** all controls have meaningful accessible names; status never communicated by color alone (text + icon + color).
- **Reduced motion:** `prefers-reduced-motion` disables non-essential animation.
- **Semantics:** proper landmarks, headings, lists, and ARIA roles.
- **Screen readers:** live regions for the threat feed and terminal so new events are announced.

---

## 11. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| ≥ 1440px | Full multi-column SOC layout (primary target) |
| 1024–1439px | Compact multi-column, reduced gutters |
| 768–1023px | Panels stack, 2-column grid where possible |
| < 768px | Single column stack, preserve critical controls, no horizontal overflow |

### Rules

- Do not sacrifice desktop density for mobile.
- Charts resize fluidly.
- Mode switch, kill switch, simulation control always accessible.
- Alerts and approval dialog remain usable at all sizes.

---

## 12. Empty / Loading / Error States

### Empty States

- Clear message (e.g., `No events yet`, `Waiting for traffic data`).
- Subtle icon + secondary text.
- Never blank panels.

### Loading States

- Skeleton blocks matching panel layout.
- Header shows `CONNECTING...` / connecting spinner.
- No fake data during loading.

### Error States

- `ERROR` badge + concise message.
- Retry action where appropriate.
- Dashboard never presents stale data as live.