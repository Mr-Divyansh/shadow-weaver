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
  // Attack
  | "attack_started"
  | "attack_active"
  | "attack_ended"
  | "service_discovered"
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
  | "honeypot_offline"
  // AI Security Analyst pipeline (orchestrator event feed)
  | "ai_analysis_started"
  | "ai_analysis_completed"
  | "ai_decision_made"
  | "defense_action_started"
  | "defense_action_completed"
  | "ai_verification_completed"
  // Protected Target (Settings > Add IP & Port)
  | "target_connected"
  | "target_disconnected";

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
  | "attack"
  | "detection"
  | "honeypot"
  | "capture"
  | "containment"
  | "completed";

export const PHASE_STEPS: { id: SimulationPhase; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "attack", label: "Attack" },
  { id: "detection", label: "Detection" },
  { id: "honeypot", label: "Honeypot" },
  { id: "capture", label: "Capture" },
  { id: "containment", label: "Containment" },
  { id: "completed", label: "Completed" },
];

// ── Honeypot ────────────────────────────────────────────────────────────────

export type HoneypotStatus = "active" | "waiting" | "captured" | "offline" | "arming" | "initializing" | "armed";

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

// ── AI Security Analyst ─────────────────────────────────────────────────────

// The ONLY actions the backend AI decision layer may ever produce.
export type AIAction = "MONITOR" | "HONEYPOT" | "BLOCK" | "ISOLATE";

// Which engine produced the analysis: the Gemini LLM or the deterministic
// fallback rule engine (used when Gemini is unavailable/fails).
export type AIEngine = "gemini" | "deterministic";

// Lifecycle phase of the current AI decision cycle.
export type AIPhase =
  | "idle"
  | "analyzing"
  | "decided"
  | "responding"
  | "verifying"
  | "contained";

export interface AIAnalysis {
  threatType: string; // e.g. "SSH_BRUTE_FORCE"
  severity: Severity;
  confidence: number; // 0..1
  riskScore: number; // 0..100
  indicators: string[];
  reasoning: string;
  recommendedAction: AIAction;
  engine: AIEngine;
}

// Unified AI panel state — kept subtle/standby until real AI pipeline events
// arrive over the existing orchestrator event feed.
export interface AIAnalystState {
  status: "idle" | "online" | "offline";
  phase: AIPhase;
  analysis: AIAnalysis | null;
  action: AIAction | null;
  verification: "CONTAINED" | "STILL_ACTIVE" | "UNCERTAIN" | "MONITORING" | null;
  updatedAt: number;
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
  /** Cancels an in-flight simulation's timers without mutating store state. */
  abortSimulation(): void;
  approveContainment(): void;
  ignoreContainment(): void;
  setMode(mode: OperatingMode): void;
}

// ── Target configuration ──────────────────────────────────────────────────────────────

export type TargetMode = "demo" | "authorized_lab";

export type TargetEnvironment = "demo" | "local_lab" | "private_network" | "cloud_lab" | "ctf_lab";

export interface TargetAuthorizedConfig {
  host: string;
  port: number;
  serverName?: string;
  environment: TargetEnvironment;
  authorized: boolean;
}

export interface TargetDemoConfig {
  targetName: string;
  targetIP: string;
  port: number;
  environment: TargetEnvironment;
}

export interface TargetConfig {
  mode: TargetMode;
  authorized: TargetAuthorizedConfig | null;
  demo: TargetDemoConfig | null;
}

export interface TargetStatus {
  status: "disconnected" | "connecting" | "connected" | "demo_connected" | "failed";
  mode: TargetMode;
  target?: {
    host: string;
    port: number;
    name: string;
    environment: TargetEnvironment;
  };
  lastChecked?: string;
  error?: string;
}

// ── Backward compatibility: keep AgentTeam for any remaining references ──────
export type AgentTeam = "red" | "blue";

// ── AI Agent (Red/Blue Team) provider configuration ─────────────────────────
// Lets each team's autonomous agent be pointed at an AI provider. This is
// separate from the Protected Target connection above — it configures which
// model plans/drives that team's behavior, not what it's aimed at.

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
  error: "Error",
};

export interface AgentConfig {
  provider: AgentProviderId;
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