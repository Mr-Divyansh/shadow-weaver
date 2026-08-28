import { useEffect } from "react";
import { Header } from "./components/Header";
import { SecurityOverview } from "./components/SecurityOverview";
import { AgentStatusBar } from "./components/AgentStatusBar";
import { NetworkTopology } from "./components/NetworkTopology";
import { TrafficAnalytics } from "./components/TrafficAnalytics";
import { ThreatFeed } from "./components/ThreatFeed";
import { SystemHealth } from "./components/SystemHealth";
import { HoneypotPanel } from "./components/HoneypotPanel";
import { AIDecisionPanel } from "./components/AIDecisionPanel";
import { LiveAIReasoning } from "./components/LiveAIReasoning";
import { FirewallStatus } from "./components/FirewallStatus";
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
            <div className="panel-header panel-header--topology">
              <span className="panel-title">
                <svg className="title-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                  <path d="M12 2L2 7v10c0 4.4 6 7 10 7s10-2.6 10-7V7l-10-5z" />
                  <path d="M12 7v5" />
                  <circle cx="12" cy="15" r="2" fill="currentColor" />
                </svg>
                <span className="panel-title__text">Cyber Defense Topology</span>
              </span>
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

        <section className="dashboard-grid">
          <div className="panel left-col ai-reasoning-panel">
            <div className="panel-header">
              <span className="panel-title">
                <svg className="title-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                  <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 7h10v10H7z" />
                  <path d="M12 9l1.8 3.6L17 14l-3.2 1.4L12 19l-1.8-3.6L7 14l3.2-1.4L12 9z" />
                </svg>
                <span className="panel-title__text">Live AI Reasoning</span>
              </span>
            </div>
            <LiveAIReasoning />
          </div>

          <div className="panel firewall-panel">
            <div className="panel-header">
              <span className="panel-title">
                <svg className="title-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                  <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z" />
                  <path d="M12 8v4l3 2" />
                </svg>
                <span className="panel-title__text">Firewall Execution Status</span>
              </span>
            </div>
            <FirewallStatus />
          </div>
        </section>

        <AIDecisionPanel />

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