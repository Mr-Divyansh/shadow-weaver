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
  const attackActive = state.topology.attackActive;
  const phase = state.simulation.phase;
  const honey = state.honeypot.status;
  // Lifecycle stages where the attack has already been neutralised.
  const neutralised = phase === "containment" || phase === "completed";

  // ── Red Team ─────────────────────────────────────────────────────────────
  let red: EntityCardState = { tone: "neutral", label: "READY / IDLE" };
  if (attackActive) {
    red = { tone: "attacking", label: "ATTACKING" };
  } else if (neutralised) {
    red = { tone: "blocked", label: "BLOCKED / STOPPED" };
  }

  // ── Blue Team ────────────────────────────────────────────────────────────
  let blue: EntityCardState = { tone: "neutral", label: "SECURE / READY" };
  if (attackActive) {
    blue =
      phase === "attack"
        ? { tone: "underattack", label: "UNDER ATTACK" }
        : { tone: "defending", label: "DEFENDING" };
  } else if (neutralised) {
    blue = { tone: "secured", label: "SECURED" };
  }

  // ── Honeypot ─────────────────────────────────────────────────────────────
  let honeypot: EntityCardState = { tone: "neutral", label: "STANDBY / READY" };
  if (honey === "arming" || honey === "initializing") {
    honeypot = { tone: "arming", label: "ARMING" };
  } else if (honey === "armed") {
    honeypot = { tone: "armed", label: "ARMED" };
  } else if (honey === "captured") {
    honeypot = { tone: "captured", label: "CAPTURED" };
  } else if (honey === "active") {
    // "Capturing" only makes sense while an attack is actually live.
    honeypot = attackActive
      ? { tone: "capturing", label: phase === "attack" ? "CAPTURING" : "DECEIVING" }
      : { tone: "neutral", label: "STANDBY / READY" };
  } else {
    // waiting / offline
    honeypot = neutralised
      ? { tone: "monitoring", label: "STANDBY / MONITORING" }
      : { tone: "neutral", label: "STANDBY / READY" };
  }

  return { red_team: red, blue_team: blue, honeypot };
}