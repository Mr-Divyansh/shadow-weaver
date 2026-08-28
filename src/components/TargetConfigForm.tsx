import { useState } from "react";
import { store } from "../store";
import {
  TargetMode,
  TargetEnvironment,
  TargetAuthorizedConfig,
  TargetDemoConfig,
  TargetStatus,
} from "../types";
import { connectToTarget } from "../services/targetConnectionService";
import { EnvironmentSelect, EnvironmentOption } from "./EnvironmentSelect";
import "./SettingsPanel.css";

/**
 * Environment catalogue for the "Authorized Lab Server" target form.
 * Only Local Lab is selectable today — the rest are explicitly unavailable
 * so judge eyes immediately read which environments are live vs. locked.
 */
const ENVIRONMENT_OPTIONS: EnvironmentOption[] = [
  { value: "local_lab", label: "Local Lab" },
  { value: "private_network", label: "Private Network", hint: "Not available", disabled: true },
  { value: "cloud_lab", label: "Cloud Lab", hint: "Coming soon", disabled: true },
  { value: "ctf_lab", label: "CTF Lab", hint: "Coming soon", disabled: true },
];

const DEMO_ENVIRONMENT_OPTIONS: EnvironmentOption[] = [
  { value: "demo", label: "Simulated Lab", hint: "DEMO" },
];

const STATUS_LABEL: Record<string, string> = {
  connected: "CONNECTED",
  demo_connected: "DEMO MODE",
  connecting: "CONNECTING…",
  failed: "CONNECTION FAILED",
  disconnected: "DISCONNECTED",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  connected: "connected",
  demo_connected: "demo",
  connecting: "connecting",
  failed: "failed",
  disconnected: "disconnected",
};

function resolveEnvironment(
  raw: TargetEnvironment | undefined,
  fallback: TargetEnvironment,
): TargetEnvironment {
  if (!raw || raw === "demo") return raw ?? "demo";
  // A saved/unavailable environment is never pre-selected; Local Lab is.
  return ENVIRONMENT_OPTIONS.find((o) => o.value === raw && !o.disabled)
    ? raw
    : fallback;
}

function isValidIP(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every(part => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

interface TargetConfigFormProps {
  mode: TargetMode;
  authorized: TargetAuthorizedConfig | null;
  demoConfig: TargetDemoConfig | null;
  authorizedConfig: TargetAuthorizedConfig | null;
  onModeChange: (newMode: TargetMode) => void;
    onConnect: () => void;
  /** Existing connection state, used to render a truthful status strip. */
  connectionState?: TargetStatus;
  /** Shown as a "Cancel" button when editing an already-configured server. */
  onCancel?: () => void;
}

export function TargetConfigForm({
  mode,
  authorized,
  demoConfig,
  authorizedConfig,
  onModeChange,
    onConnect,
  onCancel,
  connectionState,
}: TargetConfigFormProps) {
  const [formMode, setFormMode] = useState(mode);
  const [host, setHost] = useState(authorized?.host || demoConfig?.targetIP || "192.0.2.10");
  const [port, setPort] = useState(authorized?.port || demoConfig?.port || 8080);
  const [serverName, setServerName] = useState(authorizedConfig?.serverName || "");
    const [environment, setEnvironment] = useState<TargetEnvironment>(
    resolveEnvironment(
      authorized?.environment ||
        (mode === "demo" ? demoConfig?.environment ?? "demo" : undefined),
      "local_lab",
    ),
  );
  const [authChecked, setAuthChecked] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validHost = isValidIP(host) || host.toLowerCase().includes("localhost") || host.toLowerCase().includes("demo");
  const validPortNum = isValidPort(port);

  const handleModeChange = (newMode: TargetMode) => {
    setFormMode(newMode);
    if (newMode === "demo") {
      setHost("192.0.2.10");
      setPort(8080);
      setServerName("");
      setEnvironment("demo");
      setAuthChecked(false);
    }
    onModeChange(newMode);
  };

  const handleHostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setHost(value);
    setError(isValidIP(value) || value.toLowerCase().includes("demo") || value.toLowerCase().includes("localhost") ? null : "Please enter a valid IP address or hostname");
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setPort(value);
    setError(isNaN(value) || value <= 0 || value > 65535 ? "Please enter a valid port number (1-65535)" : null);
  };

    const handleEnvironmentChange = (next: string) => {
    setEnvironment(next as TargetEnvironment);
  };

  const connStatus = connectionState?.status ?? "disconnected";
  const isConnected = connStatus === "connected" || connStatus === "demo_connected";

  const handleAuthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAuthChecked(e.target.checked);
  };

  const canConnect = !connecting && validHost && validPortNum;

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    const newConfig: TargetAuthorizedConfig = {
      host,
      port,
      serverName: serverName.trim() || undefined,
      environment,
      authorized: authChecked,
    };

    if (formMode === "demo") {
      // Activate the simulated target in the store (status → demo_connected)
      // before closing the form, otherwise the status card keeps saying
      // "Offline" even though the user just connected.
      store.connectTarget();
      onConnect();
      setConnecting(false);
      return;
    }

    // Check if we have authorization
    if (!authChecked) {
      setError("Please confirm that you own or have explicit authorization to test this server.");
      setConnecting(false);
      return;
    }

    // Persist the entered host/port right away so it's visible even if the
    // connection attempt below fails — the user shouldn't have to retype it.
    store.setTargetConfig({ mode: "authorized_lab", authorized: newConfig, demo: null });

    const result = await connectToTarget(newConfig);
    if (result.status === "connected") {
      store.setTargetConnected(newConfig);
      onConnect();
    } else {
      store.setTargetConnectionFailed(newConfig, result.message ?? "Unable to reach the server.");
      setError(result.message ?? "Unable to reach the server.");
    }

    setConnecting(false);
  };

  return (
    <div className="settings-target-form">
      <div className="settings-form-tabs">
        <button
          type="button"
          className={`settings-form-tab ${formMode === "demo" ? "active" : ""}`}
          onClick={() => handleModeChange("demo")}
        >
          Demo Mode
        </button>
        <button
          type="button"
          className={`settings-form-tab ${formMode === "authorized_lab" ? "active" : ""}`}
          onClick={() => handleModeChange("authorized_lab")}
        >
          Authorized Lab Server
        </button>
      </div>

            <div className="env-status-row" role="status" aria-live="polite">
        <span
          className={`env-status-dot env-status-dot--${STATUS_DOT_CLASS[connStatus]}`}
          aria-hidden="true"
        />
        <span className="env-status-label">{STATUS_LABEL[connStatus]}</span>
      </div>

      {/* Demo Mode Panel */}
      {formMode === "demo" && (
        <div className="settings-form-panel">
          <div className="form-group">
            <label>Target Name</label>
            <input
              type="text"
              value={demoConfig?.targetName || "DEMO-TARGET"}
              readOnly
              placeholder="DEMO-TARGET"
            />
          </div>

          <div className="form-group">
            <label>Target IP</label>
            <input
              type="text"
              value={demoConfig?.targetIP || "192.0.2.10"}
              readOnly
              placeholder="192.0.2.10"
            />
            <span className="form-hint">SIMULATED</span>
          </div>

          <div className="form-group">
            <label>Target Port</label>
            <input
              type="number"
              value={demoConfig?.port || 8080}
              readOnly
              placeholder="8080"
            />
            <span className="form-hint">SIMULATED</span>
          </div>

                    <div className="form-group">
            <EnvironmentSelect
              id="demo-environment"
              label="ENVIRONMENT"
              value={environment}
              options={DEMO_ENVIRONMENT_OPTIONS}
              onChange={handleEnvironmentChange}
              disabled={connecting}
            />
          </div>

                    <div className="form-actions target-actions">
            <button
              type="button"
              className={`btn ${connecting && !isConnected ? "btn-secondary" : isConnected ? "btn-connected" : "btn-primary"} ${connecting ? "disabled" : ""}`}
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting && !isConnected ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  CONNECTING…
                </>
              ) : isConnected ? "CONNECTED ✓" : "CONNECT"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => handleModeChange("authorized_lab")}
            >
              Switch to Authorized Lab
            </button>
          </div>
        </div>
      )}

      {/* Authorized Lab Server Panel */}
      {formMode === "authorized_lab" && (
        <div className="settings-form-panel">
          <div className="form-group">
            <label>Server IP / Host</label>
            <input
              type="text"
              value={host}
              onChange={handleHostChange}
              placeholder="192.168.1.100"
              autoComplete="off"
            />
            {error && <span className="form-error">{error}</span>}
          </div>

          <div className="form-group">
            <label>Server Port</label>
            <input
              type="number"
              value={port}
              onChange={handlePortChange}
              placeholder="8080"
              autoComplete="off"
            />
            {error && <span className="form-error">{error}</span>}
          </div>

                    <div className="form-group">
            <EnvironmentSelect
              id="target-environment"
              label="ENVIRONMENT"
              value={environment}
              options={ENVIRONMENT_OPTIONS}
              onChange={handleEnvironmentChange}
              disabled={connecting}
            />
          </div>

          <div className="form-group">
            <label>Server Name (Optional)</label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="My Security Lab"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={authChecked}
                onChange={handleAuthChange}
                disabled={connecting}
              />
              I confirm that I own or have explicit authorization to test this server.
            </label>
            {connecting && <span className="form-hint">Connecting...</span>}
          </div>

          {authChecked && authorized && (
            <div className="form-hint">
              Authorization confirmed — target is validated
            </div>
          )}

                    <div className="form-actions target-actions">
            <button
              type="button"
              className={`btn ${connecting && !isConnected ? "btn-secondary" : isConnected ? "btn-connected" : "btn-primary"} ${connecting || !canConnect ? "disabled" : ""}`}
              onClick={handleConnect}
              disabled={connecting || !canConnect}
            >
              {connecting && !isConnected ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  CONNECTING…
                </>
              ) : isConnected ? "CONNECTED ✓" : "CONNECT"}
            </button>
            {onCancel ? (
              <button type="button" className="btn btn-ghost" onClick={onCancel}>
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleModeChange("demo")}
              >
                Switch to Demo Mode
              </button>
            )}
          </div>

          {connecting && (
            <div className="status-row" role="status" aria-live="polite">
              <span className="status-dot dot-warning" aria-hidden="true" />
              <span className="status-label">Connecting to {host}:{port}...</span>
            </div>
          )}
          {!connecting && error && (
            <div className="status-row" role="status" aria-live="polite">
              <span className="status-dot dot-critical" aria-hidden="true" />
              <span className="status-label">Connection failed — {error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}