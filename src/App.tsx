import { useEffect } from "react";
import { Header } from "./components/Header";
import { SecurityOverview } from "./components/SecurityOverview";
import { AgentStatusBar } from "./components/AgentStatusBar";
import { NetworkTopology } from "./components/NetworkTopology";
import { TrafficAnalytics } from "./components/TrafficAnalytics";
import { ThreatFeed } from "./components/ThreatFeed";
import { SystemHealth } from "./components/SystemHealth";
import { HoneypotPanel } from "./components/HoneypotPanel";
import { SimulationControls } from "./components/SimulationControls";
import { ApprovalDialog } from "./components/ApprovalDialog";
import { SettingsPanel } from "./components/SettingsPanel";
import { store } from "./store";

import "./App.css";

// Global shortcut: Ctrl+Shift+D (or Cmd+Shift+D on Mac) toggles Demo Mode
// from anywhere in the app, no UI click needed. Ignored while the user is
// typing in an input/textarea so it doesn't fire during normal form use.
function useDemoModeShortcut() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping) return;

      const comboMatch = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d";
      if (comboMatch) {
        e.preventDefault();
        store.toggleDemoMode();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function App() {
  useDemoModeShortcut();

  return (
    <div className="app-shell">
      <Header />

      <main className="dashboard">
        <section className="dashboard-section">
          <AgentStatusBar />
        </section>

        <section className="dashboard-section">
          <SecurityOverview />
        </section>

        <section className="dashboard-grid">
          <div className="panel left-col">
            <div className="panel-header">
              <span className="panel-title">Cyber Defense Topology</span>
            </div>
            <NetworkTopology />
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Live Traffic Analytics</span>
            </div>
            <TrafficAnalytics />
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="panel left-col feed-panel">
            <div className="panel-header">
              <span className="panel-title">Threat Intelligence</span>
            </div>
            <ThreatFeed />
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">System Health</span>
            </div>
            <SystemHealth />
          </div>
        </section>

        <section className="panel honeypot-panel-section">
          <div className="panel-header">
            <span className="panel-title">Honeypot / Hacker Jail</span>
          </div>
          <HoneypotPanel />
        </section>

        <section className="panel">
          <div className="panel-header">
            <span className="panel-title">Attack Simulation Control</span>
          </div>
          <SimulationControls />
        </section>
      </main>

      <ApprovalDialog />
      <SettingsPanel />
    </div>
  );
}

export default App;