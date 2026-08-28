import { useEffect, useState } from "react";
import { useAppState, store } from "../store";
import { TargetConfigForm } from "./TargetConfigForm";
import { ConnectionStatusCard } from "./ConnectionStatusCard";
import { AgentConfigCard } from "./AgentConfigCard";
import { ErrorBoundary } from "./ErrorBoundary";
import "./SettingsPanel.css";

const TABS: { id: "general" | "protected_target" | "agents" | "status"; label: string }[] = [
  { id: "general", label: "General" },
  { id: "protected_target", label: "Protected Target" },
  { id: "agents", label: "AI Agents" },
  { id: "status", label: "Connection Status" },
];

function targetDotClass(status: string): string {
  switch (status) {
    case "connected":
    case "demo_connected":
      return "dot-success";
    case "connecting":
      return "dot-warning";
    case "failed":
      return "dot-critical";
    default:
      return "dot-offline";
  }
}

function targetStatusText(status: string): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "demo_connected":
      return "Demo Connected";
    case "connecting":
      return "Connecting...";
    case "failed":
      return "Connection failed";
    default:
      return "Offline";
  }
}

export function SettingsPanel() {
  const state = useAppState();
  const { open, tab } = state.settings;
  const { config, status } = state.target;

  // Controls whether the "Add IP & Port" form is shown for an
  // already-configured authorized_lab server, vs. the small summary card.
  const [editingTarget, setEditingTarget] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") store.closeSettings();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Reset the edit toggle whenever Settings is closed/reopened so a stale
  // "editing" state doesn't linger between sessions.
  useEffect(() => {
    if (!open) setEditingTarget(false);
  }, [open]);

  if (!open) return null;

  const hasSavedServer = config.mode === "authorized_lab" && !!config.authorized;
  const showSummary = hasSavedServer && !editingTarget;

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
          <ErrorBoundary label="Settings">
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
                      onClick={() => store.setMode("autonomous")}
                    >
                      Autonomous
                    </button>
                    <button
                      type="button"
                      className={`mode-switch-option ${state.mode === "manual" ? "active" : ""}`}
                      onClick={() => store.setMode("manual")}
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

                <div className="settings-row">
                  <div>
                    <div className="settings-row-title">Add IP &amp; Port</div>
                    <div className="settings-row-desc">Connect Shadow-Weaver to a server.</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      store.setSettingsTab("protected_target");
                      setEditingTarget(true);
                    }}
                  >
                    Open &gt;
                  </button>
                </div>
              </div>
            )}

            {tab === "protected_target" && (
              <div className="settings-section">
                <div className="settings-section-header">
                  <div className="settings-section-title">Protected Target</div>
                  <div className="settings-section-subtitle">
                    Connect Shadow-Weaver to an authorized server or isolated security lab and monitor its security lifecycle.
                  </div>
                </div>

                {showSummary && config.authorized ? (
                  <div className="server-summary-card">
                    <span className="server-summary-label">Server</span>
                    <span className="server-summary-address">
                      {config.authorized.host}:{config.authorized.port}
                    </span>
                    <div className="status-row">
                      <span className={`status-dot ${targetDotClass(status.status)}`} aria-hidden="true" />
                      <span className="status-label">
                        {targetStatusText(status.status)}
                        {status.status === "failed" && status.error ? ` — ${status.error}` : ""}
                      </span>
                    </div>
                    <div className="form-actions">
                      {status.status === "connected" ? null : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setEditingTarget(true)}
                        >
                          {status.status === "failed" ? "Retry" : "Reconnect"}
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost" onClick={() => setEditingTarget(true)}>
                        Change Server
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => store.disconnectTarget()}>
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <TargetConfigForm
                    mode={config.mode}
                    authorized={config.authorized}
                    demoConfig={config.demo}
                    authorizedConfig={config.authorized}
                    onModeChange={(newMode) => store.setTargetConfig({ ...config, mode: newMode })}
                    onConnect={() => setEditingTarget(false)}
                                        onCancel={hasSavedServer ? () => setEditingTarget(false) : undefined}
                    connectionState={status}
                  />
                )}

                {status.mode === "demo" && (
                  <div className="settings-demo-hint">
                    <span className="demo-badge">🟢 DEMO MODE</span>
                    <span>Simulated target environment — no real server required.</span>
                  </div>
                )}
              </div>
            )}

            {tab === "agents" && (
              <div className="settings-section">
                <div className="settings-section-header">
                  <div className="settings-section-title">AI Agents</div>
                  <div className="settings-section-subtitle">
                    Point each team's autonomous agent at an AI provider. Keys are kept in memory for this
                    session only and are never saved to disk.
                  </div>
                </div>
                <div className="agent-card-grid">
                  <AgentConfigCard team="red" state={state.agents.red} />
                  <AgentConfigCard team="blue" state={state.agents.blue} />
                </div>
              </div>
            )}

            {tab === "status" && (
              <div className="settings-section">
                <ConnectionStatusCard
                  orchestratorState={state.connection}
                  wsConnected={true}
                  targetStatus={status}
                  redTeamReady={state.agents.red.status === "connected"}
                  blueTeamReady={state.agents.blue.status === "connected"}
                  honeypotActive={state.honeypot.status === "active" || state.honeypot.status === "captured"}
                  aiReady={true}
                />
              </div>
            )}
          </ErrorBoundary>
        </div>
      </aside>
    </div>
  );
}
