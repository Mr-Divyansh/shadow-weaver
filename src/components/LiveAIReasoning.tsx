import { useAppState } from "../store";
import type { AiReasoningEvent } from "../types";

import "./LiveAIReasoning.css";

// Live AI Reasoning — the visible reasoning trail behind every defensive
// decision. Each entry is provenance-labelled: LIVE AI (gemini, real) vs
// DEMO AI / SIMULATION (deterministic demo fallback). The label is derived
// from the event payload, never guessed by the UI.

const STAGE_LABEL: Record<string, string> = {
  analysis: "THREAT CLASSIFIED",
  recommendation: "RECOMMENDATION GENERATED",
  decision: "ACTION SELECTED",
  action: "ACTION SELECTED",
  verification: "ACTION VERIFIED",
};

function riskTone(risk: string): string {
  const r = String(risk ?? "").toUpperCase();
  if (r === "CRITICAL" || r === "HIGH") return "sev-high";
  if (r === "MEDIUM") return "sev-warning";
  return "sev-info";
}

function SourceBadge({ ev }: { ev: AiReasoningEvent }) {
  const live = ev.source === "gemini" && ev.mode === "live";
  return (
    <span className={`ai-source-badge ${live ? "source-live" : "source-demo"}`}>
      {live ? "LIVE AI" : "DEMO AI / SIMULATION"}
    </span>
  );
}

export function LiveAIReasoning() {
  const state = useAppState();
  const trail = state.aiReasoning;

  return (
    <div className="ai-reasoning-body">
      {trail.length === 0 && (
        <div className="ai-reasoning-empty" role="status">
          <span className="status-text">NO AI EVENTS YET</span>
          <span className="ai-reasoning-hint">
            Telemetry in → structured reasoning out. Event frames will appear
            here as the AI moves from threat classification to verified action.
          </span>
        </div>
      )}

      <div className="ai-reasoning-list" role="log" aria-live="polite" aria-label="Live AI reasoning trail">
        {trail
          .slice()
          .reverse()
          .map((ev, i) => {
            const key = `${ev.timestamp}-${ev.threatId}-${i}`;
            const stageLabel =
              STAGE_LABEL[ev.stage ?? "analysis"] ?? ev.stage?.toUpperCase() ?? "ANALYSIS";
            const pct = Math.min(100, Math.max(0, Math.round((ev.confidence ?? 0) * 100)));
            const actionLabel = ev.action ?? ev.recommendation;
            return (
              <div className="ai-reasoning-entry" key={key}>
                <div className="ai-reasoning-entry-head">
                  <span className="ai-reasoning-time">{ev.timestamp}</span>
                  <span className="ai-reasoning-stage">{stageLabel}</span>
                  <SourceBadge ev={ev} />
                </div>
                <div className="ai-rv-grid">
                  <div className="ai-rv-cell">
                    <span className="metric-label">Threat</span>
                    <span className="ai-rv-value ai-rv-threat">{ev.classification}</span>
                  </div>
                  <div className="ai-rv-cell">
                    <span className="metric-label">Confidence</span>
                    <span className="ai-rv-value">{pct}%</span>
                    <span className="ai-conf-bar" aria-hidden="true">
                      <span className="ai-conf-fill" style={{ width: `${pct}%` }} />
                    </span>
                  </div>
                  <div className="ai-rv-cell">
                    <span className="metric-label">Risk</span>
                    <span className={`badge ${riskTone(ev.risk)}`}>{ev.risk}</span>
                  </div>
                  <div className="ai-rv-cell">
                    <span className="metric-label">Action</span>
                    <span className="ai-rv-value">{actionLabel}</span>
                  </div>
                </div>
                <div className="ai-reco-row">
                  <span className="metric-label">AI Recommendation</span>
                  <span className="ai-reco-text">
                    {ev.recommendation} {ev.target ? `→ ${ev.target}` : ""}
                  </span>
                </div>
                <p className="ai-reasoning-text">
                  <span className="metric-label">Reasoning</span> {ev.reasoning}
                </p>
              </div>
            );
          })}
      </div>
    </div>
  );
}