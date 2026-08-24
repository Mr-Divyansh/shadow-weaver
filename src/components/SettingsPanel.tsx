import { useEffect } from "react";
import { useAppState, store } from "../store";
import { provider } from "../simulation";
import { AGENT_PROVIDER_LABELS, AGENT_STATUS_LABELS } from "../types";
import { AgentConfigCard } from "./AgentConfigCard";

import "./SettingsPanel.css";

const TABS: { id: "general" | "agents" | "status"; label: string }[] = [
  { id: "general", label: "General" },
  { id: "agents", label: "AI Agent Configuration" },
  { id: "status", label: "Connection Status" },
];

export function SettingsPanel() {
  const state = useAppState();
  const { open, tab } = state.settings;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") store.closeSettings();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onMouseDown={() => store.closeSettings()}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="btn btn-ghost settings-close"
            onClick={() => store.closeSettings()}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`settings-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => store.setSettingsTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings-content">
          {tab === "general" && (
            <div className="settings-section">
              <div className="settings-row">
                <div>
                  <div className="settings-row-title">Operating Mode</div>
                  <div className="settings-row-desc">
                    Autonomous acts on detections automatically. Manual requires approval for containment actions.
                  </div>
                </div>
                <div className="mode-switch" role="group" aria-label="Operating mode">
                  <button
                    type="button"
                    className={`mode-switch-option ${state.mode === "autonomous" ? "active" : ""}`}
                    onClick={() => provider.setMode("autonomous")}
                  >
                    Autonomous
                  </button>
                  <button
                    type="button"
                    className={`mode-switch-option ${state.mode === "manual" ? "active" : ""}`}
                    onClick={() => provider.setMode("manual")}
                  >
                    Manual
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-row-title">WebSocket Connection</div>
                  <div className="settings-row-desc">Live telemetry stream status for this session.</div>
                </div>
                <span className="settings-row-value status-text">{state.connection}</span>
              </div>

              <div className="settings-row">
                <div>
                  <div className="settings-row-title">Reduced Motion</div>
                  <div className="settings-row-desc">Follows your OS accessibility preference automatically.</div>
                </div>
                <span className="settings-row-value status-text">System default</span>
              </div>
            </div>
          )}

          {tab === "agents" && (
            <div className="settings-section">
              <p className="settings-hint">
                Red Team and Blue Team each connect to their own AI provider independently. Configuring one never
                changes the other. Connections below are a frontend prototype — no request is sent to any provider
                until a backend endpoint is wired up.
              </p>
              <div className="agent-card-grid">
                <AgentConfigCard team="red" state={state.agents.red} />
                <AgentConfigCard team="blue" state={state.agents.blue} />
              </div>
            </div>
          )}

          {tab === "status" && (
            <div className="settings-section">
              {(["red", "blue"] as const).map((team) => {
                const agent = state.agents[team];
                const providerLabel =
                  agent.config.provider === "custom"
                    ? agent.config.customProviderName || "Custom"
                    : AGENT_PROVIDER_LABELS[agent.config.provider];
                return (
                  <div className="status-summary-card" key={team}>
                    <div className="status-summary-header">
                      <span className="status-summary-title">
                        {team === "red" ? "🔴 Red Team" : "🔵 Blue Team"}
                      </span>
                      <span className={`badge sev-${agent.status === "connected" ? "success" : agent.status === "error" ? "critical" : agent.status === "connecting" ? "warning" : "info"}`}>
                        {AGENT_STATUS_LABELS[agent.status]}
                      </span>
                    </div>
                    <dl className="status-summary-grid">
                      <dt>Provider</dt>
                      <dd>{agent.config.provider ? providerLabel : "—"}</dd>
                      <dt>Model</dt>
                      <dd>{agent.config.model || "—"}</dd>
                      <dt>Endpoint</dt>
                      <dd className="truncate">{agent.config.endpoint || "—"}</dd>
                      <dt>Connected</dt>
                      <dd>{agent.connectedAt ? new Date(agent.connectedAt).toLocaleString() : "—"}</dd>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
