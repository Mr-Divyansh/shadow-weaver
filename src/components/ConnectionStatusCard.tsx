import { TargetStatus, TargetMode } from "../types";
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

export function ConnectionStatusCard({
  orchestratorState,
  wsConnected,
  targetStatus,
  redTeamReady,
  blueTeamReady,
  honeypotActive,
  aiReady,
}: ConnectionStatusCardProps) {
  const getTargetLabel = (status: TargetStatus): string => {
    if (status.status === "demo_connected") return "DEMO CONNECTED";
    if (status.status === "connected") return "CONNECTED";
    if (status.status === "failed") return "CONNECTION FAILED";
    if (status.status === "disconnected") return "DISCONNECTED";
    return "—";
  };

  const getTargetColor = (status: TargetStatus) => {
    if (status.status === "demo_connected") return "bg-electric-blue";
    if (status.status === "connected") return "bg-success-green";
    if (status.status === "failed") return "bg-critical-red";
    if (status.status === "disconnected") return "bg-offline-white";
    return "bg-offline-white";
  };

  const getStatusDotClass = (status: TargetStatus) => {
    if (status.status === "demo_connected") return "dot-success";
    if (status.status === "connected") return "dot-success";
    if (status.status === "failed") return "dot-critical";
    if (status.status === "disconnected") return "dot-offline";
    return "dot-offline";
  };

  const getStatusText = (status: TargetStatus) => {
    if (status.status === "demo_connected") return "DEMO CONNECTED";
    if (status.status === "connected") return "CONNECTED";
    if (status.status === "failed") return "CONNECTION FAILED";
    if (status.status === "disconnected") return "DISCONNECTED";
    return "—";
  };

  return (
    <div className="connection-status-card">
      <div className="section-header">
        <span className="section-title">SHADOW-WEAVER CONNECTION</span>
      </div>

      <div className="status-row">
        <span className="status-dot orchestrator-dot {orchestratorState === "connected" ? "dot-success" : orchestratorState === "connecting" ? "dot-warning" : "dot-offline"}"></span>
        <span className="status-label">Orchestrator</span>
        <span className="status-value">{orchestratorState}</span>
      </div>

      <div className="status-row">
        <span className="status-dot ws-dot {wsConnected ? "dot-success" : "dot-offline"}"></span>
        <span className="status-label">SOC WebSocket</span>
        <span className="status-value">CONNECTED</span>
      </div>

      <div className="status-row">
        <span className="status-dot {getStatusDotClass(targetStatus)}"></span>
        <span className="status-label">Protected Target</span>
        <span className="status-value">{getTargetLabel(targetStatus)}</span>
      </div>

      <div className="status-row">
        <span className="status-dot red-dot {redTeamReady ? "dot-success" : "dot-warning"}"></span>
        <span className="status-label">Red Team</span>
        <span className="status-value">{redTeamReady ? "READY" : "—"}</span>
      </div>

      <div className="status-row">
        <span className="status-dot blue-dot {blueTeamReady ? "dot-success" : "dot-warning"}"></span>
        <span className="status-label">Blue Team</span>
        <span className="status-value">{blueTeamReady ? "READY" : "—"}</span>
      </div>

      <div className="status-row">
        <span className="status-dot honey-dot {honeypotActive ? "dot-success" : "dot-warning"}"></span>
        <span className="status-label">Honeypot</span>
        <span className="status-value">{honeypotActive ? "ACTIVE" : "—"}</span>
      </div>

      <div className="status-row">
        <span className="status-dot ai-dot {aiReady ? "dot-purple" : "dot-offline"}"></span>
        <span className="status-label">AI Engine</span>
        <span className="status-value">{aiReady ? "READY" : "—"}</span>
      </div>
    </div>
  );
}