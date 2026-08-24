import { useAppState } from "../store";

import "./SecurityOverview.css";

export function SecurityOverview() {
  const state = useAppState();
  const o = state.overview;
  const isHealthy = o.systemHealth === "Healthy";

  const cards = [
    { label: "Active Threats", value: o.activeThreats, tone: o.activeThreats > 0 ? "critical" : "neutral" },
    { label: "Threats Detected", value: o.threatsDetected, tone: "neutral" as const },
    { label: "Threats Contained", value: o.threatsContained, tone: o.threatsContained > 0 ? "success" : "neutral" },
    { label: "Honeypot Captures", value: o.honeypotCaptures, tone: o.honeypotCaptures > 0 ? "success" : "neutral" },
    { label: "Network Traffic", value: `${o.networkTraffic} req/s`, tone: "accent" as const },
    { label: "System Health", value: o.systemHealth, tone: isHealthy ? "success" : "critical" },
  ] as const;

  return (
    <section className="security-overview" aria-label="Security Overview">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`metric-card ${card.tone !== "neutral" ? `metric-${card.tone}` : ""}`}
          role="status"
        >
          <span className="metric-label">{card.label}</span>
          <span className="metric-value">{card.value}</span>
        </div>
      ))}
    </section>
  );
}