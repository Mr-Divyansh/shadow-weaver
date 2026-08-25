// Shadow-Weaver Suite — Protected Target connection service (frontend abstraction)
//
// This file is the ONLY place that knows how to attempt a connection to a
// user-configured Shadow-Weaver server (the "Add IP & Port" feature).
// Components never call fetch() directly — they call connectToTarget() below.
//
// This is strictly for connecting the dashboard's own UI to a Shadow-Weaver
// backend/orchestrator instance that the user runs and controls. It never
// scans, probes, or attacks the address it's given — it makes a single,
// short, best-effort request to the orchestrator's own status endpoint and
// reports success or failure. No retries, no port sweeps, no discovery.

import type { TargetAuthorizedConfig } from "../types";

export interface TargetConnectResult {
  status: "connected" | "error";
  message?: string;
}

// Flip to true once a real Shadow-Weaver orchestrator is reachable at the
// configured host/port and CORS is set up to allow browser requests to it.
// While false, connect() validates the input and simulates a short
// handshake so the UI/UX can be exercised without a live backend.
const MOCK_MODE = true;
const MOCK_LATENCY_MS = 700;
const REQUEST_TIMEOUT_MS = 4000;

function isValidIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

export function validateTargetConfig(config: Pick<TargetAuthorizedConfig, "host" | "port">): string | null {
  const host = config.host.trim();
  if (!host) return "Server IP is required.";
  const isLocalHost = host.toLowerCase() === "localhost";
  if (!isValidIPv4(host) && !isLocalHost) {
    return "Enter a valid IPv4 address (e.g. 192.168.1.100) or 'localhost'.";
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    return "Port must be a number between 1 and 65535.";
  }
  return null;
}

async function mockConnect(config: TargetAuthorizedConfig): Promise<TargetConnectResult> {
  const validationError = validateTargetConfig(config);
  if (validationError) return { status: "error", message: validationError };
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
  return { status: "connected" };
}

// ── Real backend call (only active once MOCK_MODE is flipped to false) ─────
// Makes one short-lived GET to the orchestrator's own status endpoint.
// Never throws: any network error, timeout, or non-2xx response resolves to
// a plain "error" result so the caller can show "Connection failed".
async function realConnect(config: TargetAuthorizedConfig): Promise<TargetConnectResult> {
  const validationError = validateTargetConfig(config);
  if (validationError) return { status: "error", message: validationError };

  const url = `http://${config.host}:${config.port}/api/v1/status`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      return { status: "error", message: `Server responded with ${response.status}` };
    }
    return { status: "connected" };
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? `Timed out connecting to ${config.host}:${config.port}`
        : `Unable to connect to ${config.host}:${config.port}`;
    return { status: "error", message };
  } finally {
    clearTimeout(timeout);
  }
}

export function connectToTarget(config: TargetAuthorizedConfig): Promise<TargetConnectResult> {
  return MOCK_MODE ? mockConnect(config) : realConnect(config);
}
