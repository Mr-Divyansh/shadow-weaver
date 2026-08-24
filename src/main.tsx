import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { provider } from "./simulation";
import { store } from "./store";
import type { DataProviderCallbacks } from "./types";
import "./styles/global.css";

// Connect to backend provider.
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

// Render the application directly.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);