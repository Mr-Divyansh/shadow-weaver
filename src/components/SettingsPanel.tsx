import { useEffect } from "react";
import { useAppState, store } from "../store";
import { TargetMode, TargetEnvironment, TargetConfig, TargetStatus, TargetAuthorizedConfig, TargetDemoConfig } from "../types";
import "./SettingsPanel.css";

const TABS: { id: "general" | "protected_target" | "status"; label: string }[] = [
  { id: "general", label: "General" },
  { id: "protected_target", label: "Protected Target" },
  { id: "status", label: "Connection Status" },
];

export function SettingsPanel() {
  const state = useAppState();
  const { open, tab } = state.settings;
  const { config, status } = state.target;

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

          {tab === "protected_target" && (
            <div className="settings-section">
              <div className="settings-section-header">
                <div className="settings-section-title">Protected Target</div>
                <div className="settings-section-subtitle">
                  Connect Shadow-Weaver to an authorized server or isolated security lab and monitor its security lifecycle.
                </div>
              </div>

              <TargetConfigForm
                mode={config.mode}
                authorized={config.authorized}
                demoConfig={config.demo}
                authorizedConfig={config.authorized}
                onModeChange={newMode => store.setTargetConfig({ ...config, mode: newMode })}
                onConnect={store.connectTarget}
                onDisconnect={store.disconnectTarget}
              />

              {status.mode === "demo" && (
                <div className="settings-demo-hint">
                  <span className="demo-badge">🟢 DEMO MODE</span>
                  <span>Simulated target environment — no real server required.</span>
                </div>
              )}

              {status.mode === "authorized_lab" && !status.authorized && (
                <div className="settings-authorization-required">
                  <span>⚠ Authorization required to connect to lab server.</span>
                </div>
              )}
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
        </div>
      </aside>
    </div>
  );
}
