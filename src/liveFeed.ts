// Shadow-Weaver — live orchestrator feed.
//
// The ONLY real-time transport in the app: a thin WebSocket listener on the
// orchestrator's existing /ws/soc-feed broadcast. It never mutates dashboards
// directly — it forwards every frame to the store's normalizer
// (store.applyAIEvent), which ignores anything it doesn't handle. If the
// backend is unreachable this service stays completely silent: the app
// continues running on its existing mock/demo provider exactly as before.
//
// No keys or secrets are involved; the feed only consumes broadcast frames.

import { store } from "./store";

// The orchestrator advertises its port in docs (start_all.ps1: :8000).
const ORCH_WS_URL = "ws://localhost:8000/ws/soc-feed";

// Retries with backoff while the page is visible; gives up quietly otherwise.
const MAX_BACKOFF_MS = 30_000;

type FeedState = "idle" | "connected" | "reconnecting" | "failed";

let ws: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 1000;
let state: FeedState = "idle";
let manuallyStopped = false;

function setState(next: FeedState) {
  state = next;
}

/**
 * Opens (or re-opens) the orchestrator event feed. Safe to call multiple
 * times — subsequent calls are no-ops while a connection is healthy.
 */
export function startAIFeed() {
  if (ws || retryTimer) return;
  manuallyStopped = false;
  connect();
}

/** Closes the feed and stops reconnection attempts. */
export function stopAIFeed() {
  manuallyStopped = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (ws) {
    try {
      ws.close();
    } catch {
      // Ignore close races — the socket is already gone.
    }
    ws = null;
  }
  setState("idle");
}

/** Current feed state (exposed for status surfacing without polling). */
export function getAIFeedState(): FeedState {
  return state;
}

function connect() {
  if (manuallyStopped) return;
  try {
    ws = new WebSocket(ORCH_WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    backoffMs = 1000;
    setState("connected");
  };

  ws.onmessage = (msg) => {
    try {
      const frame = JSON.parse(String(msg.data));
      // Single normalizer entry point — the store decides what matters.
      store.applyAIEvent(frame);
    } catch {
      // Malformed frame: ignore. Never let a bad frame break the feed.
    }
  };

  ws.onerror = () => {
    // Error details are uninteresting; reconnect logic lives in onclose.
  };

  ws.onclose = () => {
    ws = null;
    setState("reconnecting");
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (manuallyStopped || retryTimer) return;
  setState("reconnecting");
  retryTimer = setTimeout(() => {
    retryTimer = null;
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    connect();
  }, backoffMs);
}
