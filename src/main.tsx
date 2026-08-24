import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { provider } from "./simulation";
import { store } from "./store";
import type { DataProviderCallbacks } from "./types";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/global.css";

// ── DEBUG: Production boot diagnostics ─────────────────────────────────────
console.log("[Shadow-Weaver] main.tsx loaded");

// ── Event normalizer: backend events → frontend store transitions ───────────
// Per docs/API.md — the frontend only consumes normalized events.

const callbacks: DataProviderCallbacks = {
  onEvent: (event) => {
    store.appendEvent(event);

    switch (event.type) {
      case "system_online":
        store.setSystemOnline(true);
        break;
      case "system_offline":
        store.setSystemOnline(false);
        store.setOverview({ systemHealth: "Offline" });
        break;
      case "connection_established":
        store.setConnection("connected");
        store.setOverview({ systemHealth: "Healthy" });
        break;
      case "connection_lost":
        store.setConnection("disconnected");
        break;
      case "mode_changed":
        // Mode is set by the provider; no-op here to avoid duplicate state writes.
        break;
      case "reconnaissance_started":
        store.setTopology({ reconActive: true });
        break;
      case "attack_started":
        store.setTopology({ attackActive: true, attackTarget: "blue_team" });
        break;
      case "attack_ended":
        store.setTopology({ attackActive: false, attackTarget: null, reconActive: false });
        break;
      case "threat_detected":
        store.setOverview({
          threatsDetected: store.getState().overview.threatsDetected + 1,
        });
        break;
      case "containment_in_progress":
        store.setSimulation({ phase: "containment" });
        break;
      case "threat_contained":
        store.setTopology({ attackActive: false, attackTarget: null, reconActive: false });
        store.setOverview({
          activeThreats: 0,
          threatsContained: store.getState().overview.threatsContained + 1,
        });
        break;
      case "honeypot_session_captured": {
        store.setHoneypotStatus("captured");
        store.setOverview({
          honeypotCaptures: store.getState().overview.honeypotCaptures + 1,
        });
        if (event.sessionId && event.attackType) {
          store.setFingerprint({
            sourceIp: event.source ?? "unknown",
            sessionId: event.sessionId,
            detectionTime: event.timestamp,
            attackType: event.attackType,
            severity: "HIGH",
            sessionStatus: "Captured",
            honeypotStatus: "Active",
          });
        }
        break;
      }
      case "honeypot_command":
        if (event.command) store.appendHoneypotCommand(event.command);
        break;
      case "honeypot_active":
        store.setHoneypotStatus("active");
        break;
      case "honeypot_waiting":
        store.setHoneypotStatus("waiting");
        break;
      case "honeypot_offline":
        store.setHoneypotStatus("offline");
        break;
      default:
        break;
    }
  },

  onTrafficMetric: (metric) => {
    store.appendTraffic(metric);
    store.setOverview({ networkTraffic: metric.requestsPerSec });
  },

  onHealthMetric: (health) => {
    store.setHealth(health);
  },

  onConnectionState: (state) => {
    store.setConnection(state);
  },
};

// Connect to backend provider WITHOUT crashing the app.
// If connection fails, the dashboard still mounts and shows an offline state.
try {
  provider.connect(callbacks);
} catch (error) {
  // Log error for debugging but don't prevent React from mounting
  // Store offline state so UI shows "Backend Offline" instead of black screen
  store.setConnection("disconnected");
  store.setSystemOnline(false);
  store.setOverview({ systemHealth: "Offline" });
  // Re-throw in development to help debugging
  if (import.meta.env.DEV) {
    throw error;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<div style={{ padding: "20px", textAlign: "center", color: "#e6eaf2" }}>
      <h3>Shadow-Weaver</h3>
      <p>Initializing...</p>
    </div>}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
// ── DEBUG ────────────────────────────────────────────────────────────────
console.log("[Shadow-Weaver] React mounted");