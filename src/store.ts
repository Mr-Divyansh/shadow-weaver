import { useSyncExternalStore } from "react";
import type {
  AgentConfig,
  AgentConnectionState,
  AgentConnectionStatus,
  AgentTeam,
  ApprovalRequest,
  ConnectionState,
  EntityHealth,
  EntityId,
  HoneypotStatus,
  OperatingMode,
  OverviewMetrics,
  ShadowEvent,
  SimulationPhase,
  TargetEnvironment,
  TargetAuthorizedConfig,
  TargetConfig,
  TargetStatus,
  TrafficMetric,
} from "./types";
import { createInitialAgentState } from "./types";

// ── Persisted target configuration ──────────────────────────────────────────
// Only the non-secret connection fields (host/port/name/environment) are
// persisted. No passwords, tokens, or API keys ever go into localStorage.
const TARGET_CONFIG_STORAGE_KEY = "shadow-weaver:target-config";

interface PersistedTargetConfig {
  serverHost: string;
  serverPort: number;
  serverName?: string;
  environment?: TargetEnvironment;
}

function loadPersistedTargetConfig(): PersistedTargetConfig | null {
  try {
    const raw = localStorage.getItem(TARGET_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.serverHost === "string" && typeof parsed?.serverPort === "number") {
      return parsed as PersistedTargetConfig;
    }
    return null;
  } catch {
    // Corrupt or inaccessible storage should never break app startup.
    return null;
  }
}

function savePersistedTargetConfig(config: PersistedTargetConfig) {
  try {
    localStorage.setItem(TARGET_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage can be unavailable (private browsing, quota, etc.) — non-fatal.
  }
}

function clearPersistedTargetConfig() {
  try {
    localStorage.removeItem(TARGET_CONFIG_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

// ── Application state ───────────────────────────────────────────────────────

export interface AppState {
  connection: ConnectionState;
  systemOnline: boolean;
  mode: OperatingMode;
  events: ShadowEvent[];
  traffic: TrafficMetric[];
  health: Record<EntityId, EntityHealth>;
  topology: {
    attackActive: boolean;
    attackTarget: EntityId | null;
    reconActive: boolean;
  };
  honeypot: {
    status: HoneypotStatus;
    commands: string[];
    fingerprint: {
      sourceIp: string;
      sessionId: string;
      detectionTime: string;
      attackType: string;
      severity: string;
      sessionStatus: string;
      honeypotStatus: string;
    } | null;
  };
  simulation: {
    phase: SimulationPhase;
    running: boolean;
    stopped: boolean;
  };
  approval: {
    pending: ApprovalRequest | null;
  };
  overview: OverviewMetrics;
  lastUpdate: number;
  // Red/Blue Team agent configuration — two fully independent records.
  // Updating `agents.red` must never touch `agents.blue`, and vice versa.
  agents: Record<AgentTeam, AgentConnectionState>;
  settings: {
    open: boolean;
    tab: "general" | "protected_target" | "agents" | "status";
  };
  target: {
    config: TargetConfig;
    status: TargetStatus;
  };
}

const initialState: AppState = {
  connection: "connecting",
  systemOnline: true,
  mode: "autonomous",
  events: [],
  traffic: [],
  health: {
    red_team: { entity: "red_team", cpu: 12, memory: 34, status: "healthy" },
    blue_team: { entity: "blue_team", cpu: 18, memory: 41, status: "healthy" },
    honeypot: { entity: "honeypot", cpu: 8, memory: 22, status: "healthy" },
  },
  topology: { attackActive: false, attackTarget: null, reconActive: false },
  honeypot: {
    status: "waiting",
    commands: [],
    fingerprint: null,
  },
  simulation: { phase: "ready", running: false, stopped: false },
  approval: { pending: null },
  overview: {
    activeThreats: 0,
    threatsDetected: 0,
    threatsContained: 0,
    honeypotCaptures: 0,
    networkTraffic: 0,
    systemHealth: "Healthy",
  },
  lastUpdate: Date.now(),
  agents: {
    red: createInitialAgentState(),
    blue: createInitialAgentState(),
  },
  settings: { open: false, tab: "protected_target" },
  target: buildInitialTargetState(),
};

// A saved server (from a previous session) is restored as config only — the
// app never auto-reconnects on load, so there's no network activity or
// loading state tied to startup. The user explicitly reconnects from Settings.
function buildInitialTargetState(): AppState["target"] {
  const saved = loadPersistedTargetConfig();
  if (saved) {
    const authorized: TargetAuthorizedConfig = {
      host: saved.serverHost,
      port: saved.serverPort,
      serverName: saved.serverName,
      environment: saved.environment ?? "private_network",
      authorized: true,
    };
    return {
      config: { mode: "authorized_lab", authorized, demo: null },
      status: { status: "disconnected", mode: "authorized_lab" },
    };
  }
  return {
    config: {
      mode: "demo",
      authorized: null,
      demo: {
        targetName: "DEMO-TARGET",
        targetIP: "192.0.2.10",
        port: 8080,
        environment: "demo",
      },
    },
    status: {
      status: "disconnected",
      mode: "demo",
    },
  };
}

// ── Store implementation ────────────────────────────────────────────────────

type Listener = () => void;

class Store {
  private state: AppState = initialState;
  private listeners = new Set<Listener>();
  private demoSimInterval: ReturnType<typeof setTimeout> | null = null;
  private eventIdCounter = 0;

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch, lastUpdate: Date.now() };
    this.listeners.forEach((l) => l());
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  setConnection(state: ConnectionState) {
    this.setState({ connection: state });
  }

  setSystemOnline(online: boolean) {
    this.setState({ systemOnline: online });
  }

  setMode(mode: OperatingMode) {
    this.setState({ mode });
  }

  appendEvent(event: ShadowEvent) {
    const stamped = { ...event, id: event.id ?? ++this.eventIdCounter };
    const events = [...this.state.events, stamped].slice(-500);
    this.setState({ events });
  }

  appendTraffic(metric: TrafficMetric) {
    const traffic = [...this.state.traffic, metric].slice(-120);
    this.setState({ traffic });
  }

  setHealth(health: EntityHealth) {
    this.setState({ health: { ...this.state.health, [health.entity]: health } });
  }

  setTopology(patch: Partial<AppState["topology"]>) {
    this.setState({ topology: { ...this.state.topology, ...patch } });
  }

  setHoneypotStatus(status: HoneypotStatus) {
    this.setState({ honeypot: { ...this.state.honeypot, status } });
  }

  appendHoneypotCommand(command: string) {
    const commands = [...this.state.honeypot.commands, command].slice(-50);
    this.setState({ honeypot: { ...this.state.honeypot, commands } });
  }

  setFingerprint(
    fingerprint: AppState["honeypot"]["fingerprint"],
    status: HoneypotStatus = "captured"
  ) {
    this.setState({ honeypot: { ...this.state.honeypot, fingerprint, status } });
  }

  setSimulation(patch: Partial<AppState["simulation"]>) {
    this.setState({ simulation: { ...this.state.simulation, ...patch } });
  }

  setApproval(pending: ApprovalRequest | null) {
    this.setState({ approval: { pending } });
  }

setOverview(patch: Partial<OverviewMetrics>) {
    this.setState({ overview: { ...this.state.overview, ...patch } });
  }

  // ── Target management ──────────────────────────────────────────────────

  setTargetConfig(config: TargetConfig) {
    this.setState({ target: { ...this.state.target, config } });
  }

  connectTarget() {
    const { config, status } = this.state.target;
    // Update status to connecting
    this.setTargetStatus({ ...status, status: "connecting" });

    // Demo mode has no real backend to reach — resolve client-side only.
    // Authorized-lab connections are attempted from TargetConfigForm via
    // targetConnectionService, which then reports the result back through
    // setTargetConnected()/setTargetConnectionFailed() below.
    if (config.mode === "demo") {
      this.enableTargetDemo();
    } else if (!(config.mode === "authorized_lab" && config.authorized)) {
      this.setTargetStatus({
        ...status,
        status: "failed",
        error: "Target not authorized or configuration invalid",
      });
    }
  }

  // Called once targetConnectionService resolves with a successful handshake.
  setTargetConnected(authorized: TargetAuthorizedConfig) {
    this.setTargetConfig({ mode: "authorized_lab", authorized, demo: null });
    this.setTargetStatus({
      status: "connected",
      mode: "authorized_lab",
      target: {
        host: authorized.host,
        port: authorized.port,
        name: authorized.serverName || authorized.host,
        environment: authorized.environment,
      },
      lastChecked: new Date().toISOString(),
      error: undefined,
    });
    savePersistedTargetConfig({
      serverHost: authorized.host,
      serverPort: authorized.port,
      serverName: authorized.serverName,
      environment: authorized.environment,
    });
  }

  // Called once targetConnectionService resolves with a failure, or throws.
  setTargetConnectionFailed(authorized: TargetAuthorizedConfig, error: string) {
    // Keep the entered host/port visible so the user can Retry without
    // re-typing anything; only the status moves to "failed".
    this.setTargetConfig({ mode: "authorized_lab", authorized, demo: null });
    this.setTargetStatus({
      status: "failed",
      mode: "authorized_lab",
      error,
    });
  }

  disconnectTarget() {
    // Reset to demo mode config
    this.setTargetConfig({
      mode: "demo",
      authorized: null,
      demo: {
        targetName: "DEMO-TARGET",
        targetIP: "192.0.2.10",
        port: 8080,
        environment: "demo",
      },
    });
    this.setTargetStatus({
      status: "disconnected",
      mode: "demo",
    });
    // Stop any demo simulation
    this.stopDemoSimulation();
    clearPersistedTargetConfig();
  }

  setTargetStatus(patch: Partial<TargetStatus>) {
    this.setState({ target: { ...this.state.target, status: { ...this.state.target.status, ...patch } } });
  }

  setAgentStatus(team: AgentTeam, status: AgentConnectionStatus, error: string | null = null) {
    const current = this.state.agents[team];
    this.setState({
      agents: {
        ...this.state.agents,
        [team]: {
          ...current,
          status,
          error,
          connectedAt: status === "connected" ? new Date().toISOString() : current.connectedAt,
        },
      },
    });
  }

  setAgentConfig(team: AgentTeam, patch: Partial<AgentConfig>) {
    const current = this.state.agents[team];
    this.setState({
      agents: {
        ...this.state.agents,
        [team]: { ...current, config: { ...current.config, ...patch } },
      },
    });
  }

  // ── Demo Target Mode ──────────────────────────────────────────────────
  enableTargetDemo() {
    this.setTargetStatus({ status: "demo_connected", mode: "demo" });
    this.startDemoSimulation();
  }

  authorizeTargetLab() {
    this.setTargetStatus({ status: "connected", mode: "authorized_lab" });
  }

  // ── Demo Mode: instantly mark both agents "connected" client-side,
  // no API keys / network calls needed. Purely for presentations. ──────────
  enableDemoMode() {
    (["red", "blue"] as const).forEach((team) => this.setAgentStatus(team, "connected"));
    this.startDemoSimulation();
  }

  disableDemoMode() {
    if (this.state.target.status.status === "demo_connected") {
      this.setTargetStatus({ status: "disconnected", mode: "demo" });
    }
    (["red", "blue"] as const).forEach((team) => this.setAgentStatus(team, "not_connected"));
    this.stopDemoSimulation();
  }

  toggleDemoMode() {
    const isOn = this.state.agents.red.status === "connected" && this.state.agents.blue.status === "connected";
    isOn ? this.disableDemoMode() : this.enableDemoMode();
  }

  // Fires every 4-5s while demo mode is on, nudging threat counters so the
  // dashboard looks alive on stage. Deliberately does NOT touch networkTraffic
  // or appendTraffic — simulation.ts already drives a live 1s traffic stream,
  // and writing to the same fields here would fight it and flicker on screen.
  private startDemoSimulation() {
    if (this.demoSimInterval) return; // already running
    const tick = () => {
      const o = this.state.overview;
      const detected = o.threatsDetected + (Math.random() < 0.6 ? 1 : 0);
      const contained = o.threatsContained + (Math.random() < 0.45 ? 1 : 0);
      this.setOverview({
        threatsDetected: detected,
        threatsContained: Math.min(contained, detected),
        activeThreats: Math.max(0, detected - contained),
      });
      this.demoSimInterval = setTimeout(tick, 4000 + Math.random() * 1000);
    };
    this.demoSimInterval = setTimeout(tick, 4000 + Math.random() * 1000);
  }

  private stopDemoSimulation() {
    if (this.demoSimInterval) {
      clearTimeout(this.demoSimInterval);
      this.demoSimInterval = null;
    }
  }

  openSettings(tab: AppState["settings"]["tab"] = "protected_target") {
    this.setState({ settings: { open: true, tab } });
  }

  closeSettings() {
    this.setState({ settings: { ...this.state.settings, open: false } });
  }

  setSettingsTab(tab: AppState["settings"]["tab"]) {
    this.setState({ settings: { ...this.state.settings, tab } });
  }

  resetSimulation() {
    this.setState({
      topology: { attackActive: false, attackTarget: null, reconActive: false },
      honeypot: { status: "waiting", commands: [], fingerprint: null },
      simulation: { phase: "ready", running: false, stopped: false },
      approval: { pending: null },
      overview: {
        activeThreats: 0,
        threatsDetected: 0,
        threatsContained: 0,
        honeypotCaptures: 0,
        networkTraffic: 0,
        systemHealth: "Healthy",
      },
    });
  }
}

export const store = new Store();

// ── React binding ───────────────────────────────────────────────────────────

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState()
  );
}