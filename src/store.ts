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
  TrafficMetric,
} from "./types";
import { createInitialAgentState } from "./types";

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
    tab: "general" | "agents" | "status";
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
  settings: { open: false, tab: "agents" },
};

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

  // ── AI Agent configuration (Red/Blue are independent by construction:
  // each write targets only `agents[team]`, spreading the rest untouched) ──

  setAgentConfig(team: AgentTeam, patch: Partial<AgentConfig>) {
    const current = this.state.agents[team];
    this.setState({
      agents: {
        ...this.state.agents,
        [team]: { ...current, config: { ...current.config, ...patch } },
      },
    });
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

  // ── Demo Mode: instantly mark both agents "connected" client-side,
  // no API keys / network calls needed. Purely for presentations. ──────────
  enableDemoMode() {
    (["red", "blue"] as const).forEach((team) => this.setAgentStatus(team, "connected"));
    this.startDemoSimulation();
  }

  disableDemoMode() {
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

  openSettings(tab: AppState["settings"]["tab"] = "agents") {
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