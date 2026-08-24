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

  const currentIdx = PHASE_STEPS.findIndex((s) => s.id === sim.phase);
  const running = sim.running;
  const completed = sim.phase === "completed";

  function start() {
    if (completed) {
      // Clear the previous run's data so the new run starts from a clean
      // slate instead of stacking on top of old threat/honeypot state.
      store.resetSimulation();
    }
    provider.startSimulation();
  }

  function kill() {
    if (!confirmKill) {
      setConfirmKill(true);
      return;
    }
    provider.stopSimulation();
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
          disabled={!connected || running}
        >
          {running ? "RUNNING..." : completed ? "RUN AGAIN" : "START SIMULATION"}
        </button>

        <button
          className={`btn ${confirmKill ? "btn-danger" : "btn-secondary"} kill-btn`}
          onClick={kill}
          disabled={!connected || (!running && !confirmKill)}
          aria-label="Stop the active simulation"
        >
          {confirmKill ? "CONFIRM STOP?" : "KILL SWITCH"}
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