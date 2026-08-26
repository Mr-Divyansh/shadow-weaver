import { useState } from "react";
import { useAppState, store } from "../store";
import { provider } from "../simulation";
import { PHASE_STEPS } from "../types";

import "./SimulationControls.css";

export function SimulationControls() {
  const state = useAppState();
  const sim = state.simulation;
  const connected = state.connection === "connected";
  const [confirmKill, setConfirmKill] = useState(false);

  // Demo Mode owns the lifecycle while it is live — one active lifecycle at a
  // time, so the Instant Attack button is disabled until demo is switched off.
  const demoOn =
    state.agents.red.status === "connected" && state.agents.blue.status === "connected";

  const currentIdx = PHASE_STEPS.findIndex((s) => s.id === sim.phase);
  const running = sim.running;
  const completed = sim.phase === "completed";

  function start() {
    if (completed) {
      // Clear the previous run's data so the new run starts from a clean
      // slate instead of stacking on top of old threat/honeypot state.
      store.resetSimulation();
    } else if (sim.stopped) {
      // A previous run was killed — clear the stale "SIMULATION STOPPED"
      // banner so it doesn't linger while the new lifecycle runs.
      store.setSimulation({ stopped: false });
    }
    provider.startSimulation();
  }

  function kill() {
    if (!confirmKill) {
      setConfirmKill(true);
      return;
    }
    // Emergency stop: kill the demo loop too if it is the active lifecycle.
    if (demoOn) {
      store.disableDemoMode();
    } else {
      provider.stopSimulation();
    }
    setConfirmKill(false);
  }

  return (
    <div className="sim-controls">
      <div className="sim-stepper" role="list" aria-label="Simulation lifecycle">
        {PHASE_STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div
              key={step.id}
              className={`sim-step ${active ? "active" : ""} ${done ? "done" : ""}`}
              role="listitem"
            >
              <span className="sim-step-dot" aria-hidden="true" />
              <span className="sim-step-label">{step.label}</span>
            </div>
          );
        })}
      </div>

      <div className="sim-actions">
        <button
          className="btn btn-primary"
          onClick={start}
          disabled={!connected || running || demoOn}
          title={demoOn ? "Demo mode is running — disable it before starting a simulation" : undefined}
        >
          {demoOn ? "DEMO ACTIVE" : running ? "RUNNING..." : completed ? "RUN AGAIN" : "START SIMULATION"}
        </button>

        <button
          className={confirmKill ? "btn btn-danger" : "btn btn-secondary"}
          onClick={kill}
          disabled={!connected || (!running && !demoOn && !confirmKill)}
          aria-label="Stop the active simulation or demo"
        >
          {confirmKill ? "CONFIRM STOP?" : demoOn ? "STOP DEMO" : "KILL SWITCH"}
        </button>
      </div>

      {sim.stopped && (
        <div className="sim-stopped" role="status">
          <span className="status-text" style={{ color: "var(--status-warning)" }}>
            SIMULATION STOPPED
          </span>
        </div>
      )}
    </div>
  );
}