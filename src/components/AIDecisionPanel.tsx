import { useAppState } from "../store";
import { SEVERITY_META, type Severity } from "../types";

import "./AIDecisionPanel.css";

// Small, professional AI decision panel rendered with the EXISTING design
// system only (panel header, mono labels, severity badges, status dots).
// It stays in a subtle standby state until real AI pipeline events arrive;
// during an active lifecycle it uses the standard severity/glow language.

const PHASE_LABEL: Record<string, string> = {
  idle: "STANDBY",
  analyzing: "ANALYZING…",
  decided: "DECISION READY",
  responding: "RESPONDING…",
  verifying: "VERIFYING…",
  contained: "CONTAINED",
};

function severityBadgeClass(sev: Severity | undefined): string {
  return sev ? SEVERITY_META[sev]?.className ?? "sev-info" : "sev-info";
}

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case "CONTAINED":
      return <span className="badge sev-success">Threat Contained ✓</span>;
    case "STILL_ACTIVE":
      return <span className="badge sev-high">Still Active</span>;
    case "UNCERTAIN":
      return <span className="badge sev-warning">Uncertain</span>;
    case "MONITORING":
      return <span className="badge sev-info">Monitoring</span>;
    default:
      return <span className="status-value">—</span>;
  }
}

export function AIDecisionPanel() {
  const state = useAppState();
  const ai = state.ai;
  const a = ai.analysis;
  const active = ai.phase !== "idle";
  const contained = ai.verification === "CONTAINED";

  // Glow follows the existing severity language — critical/high use the
  // critical border tone, a verified containment flips to success.
  const toneClass = contained
    ? "ai-panel--contained"
    : active && (a?.severity === "critical" || a?.severity === "high")
      ? "ai-panel--alert"
      : "";

  return (
    <section className={`panel ai-decision-panel ${toneClass}`} aria-label="AI Security Analyst">
      <div className="panel-header">
        <span className="panel-title">
          <svg className="title-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.5 2.1-1.2 2.8l.7 2.2H18a2 2 0 0 1 2 2v1l-2 .5V20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5.5l-2-.5v-1a2 2 0 0 1 2-2h2.5l.7-2.2A4 4 0 0 1 12 2z" />
            <circle cx="12" cy="6" r="1.4" fill="currentColor" />
          </svg>
          <span className="panel-title__text">AI Security Analyst</span>
        </span>
        <span className="ai-header-status">
          <span
            className={`dot ${ai.status === "online" ? "dot-success dot-live" : ai.status === "offline" ? "dot-warning" : "dot-offline"}`}
            aria-hidden="true"
          />
          <span className="status-text">
            {ai.status === "online"
              ? a?.engine === "gemini" ? "GEMINI" : "RULE ENGINE"
              : ai.status === "offline"
                ? "OFFLINE / FALLBACK MODE"
                : "STANDBY"}
          </span>
        </span>
      </div>

      {!active || !a ? (
        <div className="ai-standby" role="status">
          <span className="status-text">NO ACTIVE AI ANALYSIS</span>
          <span className="ai-standby-hint">
            The analyst engages automatically on security events — telemetry in, structured
            threat intelligence out, recommended response, verification.
          </span>
        </div>
      ) : (
        <div className="ai-body" role="status">
          <div className="ai-metrics">
            <div className="ai-metric">
              <span className="metric-label">Threat</span>
              <span className="ai-metric-value ai-threat">{a.threatType.replace(/_/g, " ")}</span>
            </div>
            <div className="ai-metric">
              <span className="metric-label">Severity</span>
              <span className={`badge ${severityBadgeClass(a.severity)}`}>
                {SEVERITY_META[a.severity]?.label ?? a.severity}
              </span>
            </div>
            <div className="ai-metric">
              <span className="metric-label">Confidence</span>
              <span className="ai-metric-value">{Math.round(a.confidence * 100)}%</span>
            </div>
            <div className="ai-metric">
              <span className="metric-label">Risk</span>
              <span className="ai-metric-value">{a.riskScore}/100</span>
            </div>
            <div className="ai-metric">
              <span className="metric-label">Response</span>
              <span className="ai-metric-value">
                {typeof ai.responseMs === "number" ? `${ai.responseMs} ms` : "—"}
              </span>
            </div>
            <div className="ai-metric">
              <span className="metric-label">Decision</span>
              <span className="ai-metric-value ai-action">{a.recommendedAction}</span>
            </div>
            <div className="ai-metric">
              <span className="metric-label">Status</span>
              <VerificationBadge status={ai.verification ?? ""} />
            </div>
          </div>

          <p className="ai-reasoning">{a.reasoning}</p>

          {ai.policyNotes && ai.policyNotes.length > 0 && (
            <p className="ai-policy-note" role="note">
              <span className="label-mono ai-policy-tag">Policy</span>
              <span>{ai.policyNotes[0]}</span>
            </p>
          )}

          {a.indicators.length > 0 && (
            <div className="ai-indicators" aria-label="Threat indicators">
              {a.indicators.map((ind, i) => (
                <span key={i} className="ai-indicator">{ind}</span>
              ))}
            </div>
          )}

          <div className="ai-phase-row">
            <span className={`status-dot ${ai.phase === "analyzing" || ai.phase === "responding" || ai.phase === "verifying" ? "dot-warning" : contained ? "dot-success" : "dot-info"}`} aria-hidden="true" />
            <span className="status-label">AI pipeline</span>
            <span className="status-value">{PHASE_LABEL[ai.phase] ?? ai.phase}</span>
          </div>
        </div>
      )}
    </section>
  );
}
