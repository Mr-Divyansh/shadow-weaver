// Shadow-Weaver Suite — Shared frontend types
// Source of truth for events, metrics, and application state.

// ── Connection ──────────────────────────────────────────────────────────────

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "CONNECTING...",
  connected: "LIVE",
  disconnected: "OFFLINE",
  reconnecting: "RECONNECTING...",
};

// ── Operating mode ──────────────────────────────────────────────────────────

export type OperatingMode = "autonomous" | "manual";

// ── Severity ────────────────────────────────────────────────────────────────

export type Severity = "info" | "warning" | "high" | "critical" | "success";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "warning", "success", "info"];

export interface SeverityMeta {
  label: string;
  className: string;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  info: { label: "INFO", className: "sev-info" },
  warning: { label: "WARNING", className: "sev-warning" },
  high: { label: "HIGH", className: "sev-high" },
  critical: { label: "CRITICAL", className: "sev-critical" },
  success: { label: "SUCCESS", className: "sev-success" },
};

// ── Entities ────────────────────────────────────────────────────────────────

export type EntityId = "red_team" | "blue_team" | "honeypot";

export const ENTITY_LABELS: Record<EntityId, string> = {
  red_team: "Red Team",
  blue_team: "Blue Team",
  honeypot: "Honeypot",
};

export interface EntityHealth {
  entity: EntityId;
  cpu: number;
  memory: number;
  status: "healthy" | "degraded" | "offline";
}

// ── Normalized backend events (per docs/API.md) ─────────────────────────────

export type EventType =
  // System & connection
  | "system_online"
  | "system_offline"
  | "connection_established"
  | "connection_lost"
  | "mode_changed"
  // Simulation
  | "simulation_started"
  | "simulation_phase_changed"
  | "simulation_completed"
  | "simulation_stopped"
  // Attack / reconnaissance
  | "reconnaissance_started"
  | "service_discovered"
  | "attack_started"
  | "attack_active"
  | "attack_ended"
  // Detection & response
  | "threat_detected"
  | "suspicious_activity"
  | "containment_recommended"
  | "containment_approved"
  | "containment_ignored"
  | "containment_in_progress"
  | "threat_contained"
  // Honeypot
  | "honeypot_active"
  | "honeypot_waiting"
  | "honeypot_session_captured"
  | "honeypot_command"
  | "honeypot_offline";

export interface ShadowEvent {
  id?: number;
  type: EventType;
  severity: Severity;
  source?: string;
  target?: string;
  timestamp: string;
  message?: string;
  sessionId?: string;
  command?: string;
  attackType?: string;
}

// ── Traffic metrics ─────────────────────────────────────────────────────────

export interface TrafficMetric {
  type: "traffic_metric";
  timestamp: string;
  requestsPerSec: number;
  packetsPerSec: number;
  trafficVolume: number;
}

// ── Simulation lifecycle ────────────────────────────────────────────────────

export type SimulationPhase =
  | "ready"
  | "reconnaissance"
  | "active"
  | "detection"
  | "containment"
  | "completed";

export const PHASE_STEPS: { id: SimulationPhase; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "reconnaissance", label: "Reconnaissance" },
  { id: "active", label: "Simulation Active" },
  { id: "detection", label: "Detection" },
  { id: "containment", label: "Containment" },
  { id: "completed", label: "Completed" },
];

// ── Honeypot ────────────────────────────────────────────────────────────────

export type HoneypotStatus = "active" | "waiting" | "captured" | "offline";

// ── Approval request (manual mode) ──────────────────────────────────────────

export interface ApprovalRequest {
  source: string;
  severity: Severity;
  recommendedAction: string;
  timestamp: string;
}

// ── Overview metrics ────────────────────────────────────────────────────────

export interface OverviewMetrics {
  activeThreats: number;
  threatsDetected: number;
  threatsContained: number;
  honeypotCaptures: number;
  networkTraffic: number; // requests/sec
  systemHealth: string; // e.g. "Healthy"
}

// ── API contract for the data provider ──────────────────────────────────────

export interface DataProviderCallbacks {
  onEvent: (event: ShadowEvent, ts: number) => void;
  onTrafficMetric: (metric: TrafficMetric, ts: number) => void;
  onHealthMetric: (health: EntityHealth, ts: number) => void;
  onConnectionState: (state: ConnectionState) => void;
}

export interface DataProvider {
  connect(callbacks: DataProviderCallbacks): void;
  disconnect(): void;
  startSimulation(): void;
  stopSimulation(): void;
  approveContainment(): void;
  ignoreContainment(): void;
  setMode(mode: OperatingMode): void;
}

// ── AI Agent configuration (frontend-only; see services/agentConnectionService.ts) ──
// NOTE: Red Team and Blue Team configuration are intentionally modeled as two
// independent records (see AppState.agents in store.ts) so that editing one
// can never mutate the other.

export type AgentTeam = "red" | "blue";

export type AgentProviderId = "claude" | "glm" | "openai" | "custom";

export const AGENT_PROVIDER_LABELS: Record<AgentProviderId, string> = {
  claude: "Claude",
  glm: "GLM",
  openai: "OpenAI",
  custom: "Custom",
};

export type AgentConnectionStatus = "not_connected" | "connecting" | "connected" | "error";

export const AGENT_STATUS_LABELS: Record<AgentConnectionStatus, string> = {
  not_connected: "Not Connected",
  connecting: "Connecting...",
  connected: "Connected",
  error: "Connection Failed",
};

export interface AgentConfig {
  provider: AgentProviderId;
  /** Only used when provider === "custom" */
  customProviderName: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface AgentConnectionState {
  config: AgentConfig;
  status: AgentConnectionStatus;
  error: string | null;
  connectedAt: string | null;
}

export function createEmptyAgentConfig(): AgentConfig {
  return { provider: "claude", customProviderName: "", endpoint: "", apiKey: "", model: "" };
}

export function createInitialAgentState(): AgentConnectionState {
  return { config: createEmptyAgentConfig(), status: "not_connected", error: null, connectedAt: null };
}