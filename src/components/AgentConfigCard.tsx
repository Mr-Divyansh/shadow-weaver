import { useState } from "react";
import { AGENT_PROVIDER_LABELS, AGENT_STATUS_LABELS } from "../types";
import type { AgentConnectionState, AgentProviderId, AgentTeam } from "../types";
import { store } from "../store";
import { connectBlueTeam, connectRedTeam } from "../services/agentConnectionService";

import "./AgentConfigCard.css";

const PROVIDER_OPTIONS: AgentProviderId[] = ["claude", "glm", "openai", "custom"];

function statusDotClass(status: AgentConnectionState["status"]): string {
  switch (status) {
    case "connected":
      return "dot-success";
    case "connecting":
      return "dot-warning";
    case "error":
      return "dot-critical";
    default:
      return "dot-offline";
  }
}

interface AgentConfigCardProps {
  team: AgentTeam;
  state: AgentConnectionState;
}

export function AgentConfigCard({ team, state }: AgentConfigCardProps) {
  const [showKey, setShowKey] = useState(false);
  const { config, status, error } = state;

  const isRed = team === "red";
  const teamLabel = isRed ? "Red Team" : "Blue Team";
  const teamIcon = isRed ? "🔴" : "🔵";
  const connecting = status === "connecting";

  function updateConfig(patch: Partial<typeof config>) {
    store.setAgentConfig(team, patch);
  }

  async function handleConnect() {
    store.setAgentStatus(team, "connecting");
    const connectFn = isRed ? connectRedTeam : connectBlueTeam;
    const result = await connectFn(config);
    if (result.status === "connected") {
      store.setAgentStatus(team, "connected");
    } else {
      store.setAgentStatus(team, "error", result.message ?? "Connection failed.");
    }
  }

  const fieldId = (name: string) => `agent-${team}-${name}`;

  return (
    <div className={`agent-card agent-card-${team}`}>
      <div className="agent-card-header">
        <span className="agent-card-title">
          <span aria-hidden="true">{teamIcon}</span> {teamLabel}
        </span>
        <span className={`agent-status-badge status-${status}`} role="status">
          <span className={`dot ${statusDotClass(status)}${status === "connected" ? " dot-live" : ""}`} aria-hidden="true" />
          {AGENT_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="agent-card-body">
        <div className="field-group">
          <label htmlFor={fieldId("provider")}>API Provider</label>
          <select
            id={fieldId("provider")}
            value={config.provider}
            onChange={(e) => updateConfig({ provider: e.target.value as AgentProviderId })}
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {AGENT_PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        {config.provider === "custom" && (
          <div className="field-group">
            <label htmlFor={fieldId("custom-provider")}>Custom Provider Name</label>
            <input
              id={fieldId("custom-provider")}
              type="text"
              placeholder="e.g. Internal Model Gateway"
              value={config.customProviderName}
              onChange={(e) => updateConfig({ customProviderName: e.target.value })}
            />
          </div>
        )}

        <div className="field-group">
          <label htmlFor={fieldId("endpoint")}>API Endpoint</label>
          <input
            id={fieldId("endpoint")}
            type="text"
            placeholder="https://api.example.com/v1"
            value={config.endpoint}
            onChange={(e) => updateConfig({ endpoint: e.target.value })}
            autoComplete="off"
          />
        </div>

        <div className="field-group">
          <label htmlFor={fieldId("model")}>Model</label>
          <input
            id={fieldId("model")}
            type="text"
            placeholder="e.g. claude-sonnet-4-6"
            value={config.model}
            onChange={(e) => updateConfig({ model: e.target.value })}
            autoComplete="off"
          />
        </div>

        <div className="field-group">
          <label htmlFor={fieldId("key")}>API Key</label>
          <div className="api-key-input">
            <input
              id={fieldId("key")}
              type={showKey ? "text" : "password"}
              placeholder="Enter API key"
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="key-toggle"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {status === "error" && error && (
          <p className="agent-error-text" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className={`btn ${isRed ? "btn-danger" : "btn-primary"} agent-connect-btn`}
          onClick={handleConnect}
          disabled={connecting}
        >
          {connecting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}
