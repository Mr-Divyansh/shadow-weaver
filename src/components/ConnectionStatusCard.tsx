import { TargetStatus } from "../types";
import "./SettingsPanel.css";

interface ConnectionStatusCardProps {
  orchestratorState: string;
  wsConnected: boolean;
  targetStatus: TargetStatus;
  redTeamReady: boolean;
  blueTeamReady: boolean;
  honeypotActive: boolean;
  aiReady: boolean;
}

function dotClass(ok: boolean): string {
  return ok ? "dot-success" : "dot-offline";
}

function targetDotClass(status: TargetStatus["status"]): string {
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

function targetLabel(status: TargetStatus): string {
  switch (status.status) {
    case "connected":
      return status.target ? `Connected — ${status.target.host}:${status.target.port}` : "Connected";
    case "demo_connected":
      return "Demo target active";
    case "connecting":
      return "Connecting...";
    case "failed":
      return status.error ? `Failed — ${status.error}` : "Connection failed";
    default:
      return status.mode === "authorized_lab" ? "Not connected" : "Disconnected";
  }
}

export function ConnectionStatusCard({
  orchestratorState,
  wsConnected,
  targetStatus,
  redTeamReady,
  blueTeamReady,
  honeypotActive,
  aiReady,
}: ConnectionStatusCardProps) {
  return (
    <div className="connection-status-card">
      <div className="section-header">
        <span className="section-title">Live System Status</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${dotClass(orchestratorState === "connected")}`} aria-hidden="true" />
        <span className="status-label">Orchestrator (WebSocket telemetry)</span>
        <span className="status-value">{orchestratorState}</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${dotClass(wsConnected)}`} aria-hidden="true" />
        <span className="status-label">Live Feed</span>
        <span className="status-value">{wsConnected ? "Streaming" : "Idle"}</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${targetDotClass(targetStatus.status)}`} aria-hidden="true" />
        <span className="status-label">Protected Target</span>
        <span className="status-value">{targetLabel(targetStatus)}</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${dotClass(redTeamReady)}`} aria-hidden="true" />
        <span className="status-label">Red Team Agent</span>
        <span className="status-value">{redTeamReady ? "Ready" : "Not connected"}</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${dotClass(blueTeamReady)}`} aria-hidden="true" />
        <span className="status-label">Blue Team Agent</span>
        <span className="status-value">{blueTeamReady ? "Ready" : "Not connected"}</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${dotClass(honeypotActive)}`} aria-hidden="true" />
        <span className="status-label">Honeypot</span>
        <span className="status-value">{honeypotActive ? "Active" : "Idle"}</span>
      </div>

      <div className="status-row">
        <span className={`status-dot ${dotClass(aiReady)}`} aria-hidden="true" />
        <span className="status-label">AI Decisioning</span>
        <span className="status-value">{aiReady ? "Ready" : "Unavailable"}</span>
      </div>
    </div>
  );
}
