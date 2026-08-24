import { useAppState, store } from "../store";
import type { AgentConnectionStatus } from "../types";

import "./AgentStatusBar.css";

function dotClass(status: AgentConnectionStatus): string {
  switch (status) {
    case "connected":
      return "dot-success dot-live";
    case "connecting":
      return "dot-warning";
    case "error":
      return "dot-critical";
    default:
      return "dot-offline";
  }
}

function statusLabel(status: AgentConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "error":
      return "Error";
    default:
      return "Not Connected";
  }
}

export function AgentStatusBar() {
  const state = useAppState();

  return (
    <div className="agent-status-bar" role="group" aria-label="AI Agent connection status">
      {(["red", "blue"] as const).map((team) => {
        const agent = state.agents[team];
        return (
          <button
            key={team}
            type="button"
            className={`agent-status-chip agent-status-chip-${team}`}
            onClick={() => store.openSettings("agents")}
            title="Open AI Agent Configuration"
          >
            <span className="label-mono">{team === "red" ? "RED TEAM" : "BLUE TEAM"}</span>
            <span className="agent-status-chip-state">
              <span className={`dot ${dotClass(agent.status)}`} aria-hidden="true" />
              {statusLabel(agent.status)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
