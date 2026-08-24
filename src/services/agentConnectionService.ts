// Shadow-Weaver Suite — AI Agent connection service (frontend abstraction)
//
// This file is the ONLY place that knows how to attempt a Red/Blue Team
// agent connection. Components never call fetch() or a provider SDK
// directly — they call connectRedTeam()/connectBlueTeam() below.
//
// Right now MOCK_MODE is always on: there is no backend endpoint yet, so
// connect() just validates the form and simulates a handshake delay. No
// network request is made and no provider SDK is invoked.
//
// To wire up the real backend later: implement the request in
// `realConnect()` and flip MOCK_MODE to false. Nothing in the UI layer
// needs to change — the function signatures stay the same.

import type { AgentConfig, AgentTeam } from "../types";

export interface ConnectAgentResult {
  status: "connected" | "error";
  message?: string;
}

// Flip to false once POST /api/agents/:team/connect exists on the backend.
const MOCK_MODE = true;
const MOCK_LATENCY_MS = 900;

function validateConfig(config: AgentConfig): string | null {
  const providerName = config.provider === "custom" ? config.customProviderName.trim() : config.provider;
  if (!providerName) return "Provider is required.";
  if (!config.endpoint.trim()) return "API endpoint is required.";
  if (!config.apiKey.trim()) return "API key is required.";
  if (!config.model.trim()) return "Model is required.";
  try {
    // eslint-disable-next-line no-new
    new URL(config.endpoint.trim());
  } catch {
    return "API endpoint must be a valid URL.";
  }
  return null;
}

// ── Mock/demo connection (no network call, no SDK) ──────────────────────────
async function mockConnect(config: AgentConfig): Promise<ConnectAgentResult> {
  const validationError = validateConfig(config);
  if (validationError) {
    return { status: "error", message: validationError };
  }
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  // Demo-only: a well-formed config is treated as a successful handshake.
  return { status: "connected" };
}

// ── Future real backend call (not active while MOCK_MODE is true) ──────────
async function realConnect(team: AgentTeam, config: AgentConfig): Promise<ConnectAgentResult> {
  const validationError = validateConfig(config);
  if (validationError) {
    return { status: "error", message: validationError };
  }
  const response = await fetch(`/api/agents/${team}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    return { status: "error", message: `Request failed (${response.status})` };
  }
  const data = (await response.json()) as ConnectAgentResult;
  return data;
}

async function connect(team: AgentTeam, config: AgentConfig): Promise<ConnectAgentResult> {
  return MOCK_MODE ? mockConnect(config) : realConnect(team, config);
}

export function connectRedTeam(config: AgentConfig): Promise<ConnectAgentResult> {
  return connect("red", config);
}

export function connectBlueTeam(config: AgentConfig): Promise<ConnectAgentResult> {
  return connect("blue", config);
}
