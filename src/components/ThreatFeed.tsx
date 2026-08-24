import { useState } from "react";
import { useAppState } from "../store";
import { SEVERITY_META, SEVERITY_ORDER, type Severity } from "../types";

import "./ThreatFeed.css";

export function ThreatFeed() {
  const state = useAppState();
  const events = state.events;
  const [filter, setFilter] = useState<Severity | "all">("all");

  const filtered = filter === "all" ? events : events.filter((e) => e.severity === filter);

  return (
    <div className="feed">
      <div className="feed-filters" role="group" aria-label="Filter events by severity">
        <button
          className={`feed-filter ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
        >
          ALL
        </button>
        {SEVERITY_ORDER.map((sev) => (
          <button
            key={sev}
            className={`feed-filter ${filter === sev ? "active" : ""}`}
            onClick={() => setFilter(sev)}
            aria-pressed={filter === sev}
          >
            {SEVERITY_META[sev].label}
          </button>
        ))}
      </div>

      <div className="feed-scroll" role="log" aria-live="polite" aria-label="Threat event feed">
        {filtered.length === 0 && (
          <div className="feed-empty" role="status">
            <span>No events yet</span>
          </div>
        )}
        {filtered.map((e) => {
          const meta = SEVERITY_META[e.severity];
          return (
            <div key={e.id ?? `${e.timestamp}-${e.type}`} className="feed-event">
              <span className="feed-time">{e.timestamp}</span>
              <span className={`badge ${meta.className}`}>{meta.label}</span>
              <span className="feed-message">
                {e.message ?? e.type.replace(/_/g, " ")}
                {e.source ? ` — ${e.source}` : ""}
                {e.target ? ` → ${e.target}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}