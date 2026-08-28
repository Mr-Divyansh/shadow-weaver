import { useAppState } from "../store";
import type { FirewallStatus as FwStatus } from "../types";

import "./FirewallStatus.css";

// Firewall Execution Status — a truthful live/simulation indicator.
// The mode comes from the backend executor event, which decides it at the
// actual execution point (EXECUTOR_DRY_RUN). The UI only renders that truth.

const STATUS_META: Record<FwStatus, { label: string; cls: string; hint: string }> = {
  idle: { label: "FIREWALL STANDBY", cls: "fw-idle", hint: "AWAITING EXECUTION" },
  live: { label: "● LIVE FIREWALL", cls: "fw-live", hint: "REAL COMMANDS EXECUTED" },
  simulation: { label: "● SIMULATION MODE", cls: "fw-simulation", hint: "NO LIVE COMMANDS" },
  error: { label: "● FIREWALL ERROR", cls: "fw-error", hint: "EXECUTION FAILED" },
};

export function FirewallStatus() {
  const state = useAppState();
  const fw = state.firewall;
  const meta = STATUS_META[fw.status] ?? STATUS_META.idle;

  return (
    <div className={`firewall-body ${meta.cls}`}>
      <div className="firewall-badge-row">
        <span className="firewall-badge" role="status">
          {meta.label}
        </span>
        <span className="firewall-hint">{meta.hint}</span>
      </div>

      <div className="firewall-commands" role="log" aria-live="polite" aria-label="Recent firewall commands">
        {fw.commands.length === 0 && (
          <div className="firewall-empty">
            <span className="status-text">NO FIREWALL EVENTS YET</span>
          </div>
        )}
        {fw.commands.map((c) => (
          <div className="fw-cmd" key={c.id}>
            <div className="fw-cmd-line1">
              <span className="fw-time">{c.time}</span>
              <span className={`fw-action ${c.success ? "" : "fw-fail"}`}>
                {c.action.toUpperCase()}
              </span>
              <span className={`fw-result ${c.success ? "fw-ok" : "fw-fail"}`}>
                {c.success ? "SUCCESS" : "FAILED"}
              </span>
            </div>
            <div className="fw-target">{c.target}</div>
            <div className="fw-command">{c.command}</div>
          </div>
        ))}
      </div>
    </div>
  );
}