import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { provider } from "./simulation";
import { startAIFeed } from "./liveFeed";
import { store } from "./store";
import type { DataProviderCallbacks } from "./types";
import "./styles/global.css";

// Wires the mock/live data provider's events into the store. Kept local to
// this bootstrap file since nothing else needs to construct a provider.
const callbacks: DataProviderCallbacks = {
  onEvent: (event) => store.appendEvent(event),
  onTrafficMetric: (metric) => store.appendTraffic(metric),
  onHealthMetric: (health) => store.setHealth(health),
  onConnectionState: (state) => store.setConnection(state),
};

// Connect to backend provider.
// If connection fails, the dashboard still mounts and shows an offline state.
try {
  provider.connect(callbacks);
  // Lets Demo Mode cancel any in-flight Instant Attack when it starts, so the
  // two lifecycles can never run at the same time.
  store.registerProviderAbort(() => provider.abortSimulation());
} catch (error) {
  // Log error for debugging but don't prevent React from mounting
  // Store offline state so UI shows "Backend Offline" instead of black screen
  store.setConnection("disconnected");
  store.setSystemOnline(false);
  store.setOverview({ systemHealth: "Offline" });
  // Log for debugging, but never re-throw — a provider connection failure
  // must never prevent React from mounting the dashboard.
  // eslint-disable-next-line no-console
  console.error("[Shadow-Weaver] provider.connect failed:", error);
}

// Live orchestrator feed (AI analyst pipeline events, etc.). Completely
// optional: if the backend is down it retries quietly in the background and
// the dashboard keeps working from its existing provider.
startAIFeed();

// Render the application directly. The top-level ErrorBoundary here is a
// last-resort safety net only — Settings has its own scoped boundary so a
// Settings-only bug never needs to fall back this far.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary label="Shadow-Weaver">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);