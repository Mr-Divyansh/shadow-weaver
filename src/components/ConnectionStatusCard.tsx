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
  return (
    <div className="connection-status-card">
      Test
    </div>
  );
}