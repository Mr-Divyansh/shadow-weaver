// Shadow-Weaver Suite — Derived card state
// Single source of truth for how the three security cards (Red Team, Blue
// Team, Honeypot) look at any moment. This is a pure selector over the real
// application state — never a parallel fake state machine — so the colors,
// labels and animations always agree with what is actually happening.
import type { AppState } from "./store";
import type { EntityId } from "./types";

/** Visual intensity bucket for a card; maps to a CSS state class. */
export type EntityTone =
  | "neutral" // calm, no glow, no attack color
  | "arming" // honeypot preparing (pre-attack)
  | "armed" // honeypot armed (pre-attack)
  | "attacking" // red team actively attacking
  | "underattack" // blue team under attack
  | "defending" // blue team responding
  | "capturing" // honeypot capturing / deceiving the attacker
  | "captured" // honeypot captured a session
  | "blocked" // attack stopped / neutralised
  | "secured" // blue team secured
  | "monitoring"; // honeypot back on standby after the event

export interface EntityCardState {
  tone: EntityTone;
  label: string;
}

export type EntityStates = Record<EntityId, EntityCardState>;

/**
 * Derives the three security-card presentations from the current app state.
 *
 * Key rule: NO ACTIVE STATE = NO ACTIVE COLOR. Cards only glow / take their
 * state colour when the real application state says an attack is live
 * (topology.attackActive), the honeypot is arming/armed (honeypot.status),
 * or the lifecycle has moved past neutralisation (phase containment/completed).
 */
export function deriveEntityStates(state: AppState): EntityStates {
  const phase = state.simulation.phase;
  const attackActive = state.topology.attackActive;
  const honey = state.honeypot.status;

  const idle = (label: string): EntityCardState => ({ tone: "neutral", label });

  // Authoritative lifecycle: at any moment only ONE entity is "doing work".
  // Everything else is calm — NO active colour / glow just from existing.
  let red: EntityCardState = idle("DISENGAGED");
  let blue: EntityCardState = idle("STANDBY / READY");
  let honeypot: EntityCardState = idle("STANDBY / READY");

  switch (phase) {
    // STATE 2 — Red Team attacking. Red is the ONLY active entity.
    case "attack":
      red = { tone: "attacking", label: "ATTACKING" };
      break;

    // STATE 3 — Blue Team detection/response. Red stands down.
    case "detection":
      red = idle("DISENGAGED");
      blue = { tone: "underattack", label: "UNDER ATTACK / DEFENDING" };
      break;

    // STATE 4 — Honeypot deception. Blue is done, honeypot takes over.
    case "honeypot":
      blue = idle("SECURE / WAITING");
      honeypot = { tone: "capturing", label: "CAPTURING / PROTECTING" };
      break;

    // Honeypot captured the attacker session.
    case "capture":
      blue = idle("SECURE / WAITING");
      honeypot = { tone: "captured", label: "SESSION CAPTURED" };
      break;

    // Containment — everything returns to calm as the environment is secured.
    case "containment":
      red = { tone: "blocked", label: "BLOCKED / STOPPED" };
      blue = { tone: "secured", label: "SECURED / RESOLVED" };
      honeypot = idle("SECURED / STANDBY");
      break;

    // STATE 5 — SAFE. All three entities are back to their calm, idle look.
    case "completed":
    default:
      // ready (idle) / completed / unknown.
      // Backend fallback: if a REAL attack arrives outside a declared phase,
      // reflect it so genuine WebSocket/API events still light up the cards
      // without inventing a fake lifecycle.
      if (attackActive) {
        red = { tone: "attacking", label: "ATTACKING" };
        blue = { tone: "underattack", label: "UNDER ATTACK" };
        if (honey === "captured" || honey === "active") {
          honeypot = { tone: "captured", label: "HONEYPOT ENGAGED" };
        }
      }
      break;
  }

  // Backend honeypot statuses (arming / armed / offline) still surface when
  // the provider reports them directly and no lifecycle phase is portraying
  // the honeypot already. Keeps real events compatible while remaining calm
  // on an idle dashboard (honeypot.status = "waiting" -> nothing happens).
  if (honeypot.tone === "neutral") {
    if (honey === "armed") {
      honeypot = { tone: "armed", label: "ARMED" };
    } else if (honey === "arming" || honey === "initializing") {
      honeypot = { tone: "arming", label: "ARMING" };
    } else if (honey === "offline") {
      honeypot = idle("OFFLINE");
    }
  }

  return { red_team: red, blue_team: blue, honeypot };
}