import { useAppState } from "../store";

import "./HoneypotPanel.css";

function statusDot(status: string) {
  switch (status) {
    case "active":
      return <span className="dot dot-success dot-live" aria-hidden="true" />;
    case "waiting":
      return <span className="dot dot-info" aria-hidden="true" />;
    case "captured":
      return <span className="dot dot-critical dot-live" aria-hidden="true" />;
    default:
      return <span className="dot dot-offline" aria-hidden="true" />;
  }
}

export function HoneypotPanel() {
  const state = useAppState();
  const h = state.honeypot;
  const captured = h.status === "captured";

  const statusLabel =
    h.status === "active"
      ? "ACTIVE"
      : h.status === "waiting"
        ? "WAITING"
        : h.status === "captured"
          ? "CAPTURED"
          : "OFFLINE";

  return (
    <div className="honeypot-panel">
      {/* Status row */}
      <div className="honeypot-status-row">
        {statusDot(h.status)}
        <span className="status-text honeypot-status-label">HONEYPOT — {statusLabel}</span>
        {captured && (
          <span className="badge sev-critical captured-badge">ATTACKER SESSION CAPTURED</span>
        )}
      </div>

      {/* Fake terminal */}
      <div className="fake-terminal" role="log" aria-live="polite" aria-label="Captured attacker terminal">
        <div className="terminal-header">
          <span className="terminal-dots" aria-hidden="true">
            <span className="t-dot r" />
            <span className="t-dot y" />
            <span className="t-dot g" />
          </span>
          <span className="terminal-title">honeypot-session</span>
          {captured && <span className="terminal-captured">CAPTURED</span>}
        </div>
        <div className="terminal-body">
          {!captured && (
            <div className="terminal-empty" role="status">
              <span>WAITING FOR ATTACKER SESSION</span>
            </div>
          )}
          {h.commands.map((cmd, i) => (
            <div key={`${i}-${cmd}`} className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cmd">{cmd}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Attacker fingerprint */}
      {h.fingerprint ? (
        <div className="fingerprint">
          <div className="fingerprint-title-row">
            <span className="panel-title">Attacker Fingerprint</span>
            <span className="badge sev-warning">SIMULATED / DEMO DATA</span>
          </div>
          <dl className="fingerprint-grid">
            <div className="fp-item">
              <dt>Source IP</dt>
              <dd>{h.fingerprint.sourceIp}</dd>
            </div>
            <div className="fp-item">
              <dt>Session ID</dt>
              <dd>{h.fingerprint.sessionId}</dd>
            </div>
            <div className="fp-item">
              <dt>Detection Time</dt>
              <dd>{h.fingerprint.detectionTime}</dd>
            </div>
            <div className="fp-item">
              <dt>Attack Type</dt>
              <dd>{h.fingerprint.attackType}</dd>
            </div>
            <div className="fp-item">
              <dt>Severity</dt>
              <dd>
                <span className={`badge sev-high`}>{h.fingerprint.severity}</span>
              </dd>
            </div>
            <div className="fp-item">
              <dt>Session Status</dt>
              <dd>
                <span className="status-text" style={{ color: "var(--status-critical)" }}>
                  {h.fingerprint.sessionStatus}
                </span>
              </dd>
            </div>
            <div className="fp-item">
              <dt>Honeypot Status</dt>
              <dd>
                <span className="status-text" style={{ color: "var(--status-success)" }}>
                  {h.fingerprint.honeypotStatus}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="fingerprint-empty">
          <span className="status-text" style={{ color: "var(--text-muted)" }}>
            NO CAPTURE YET
          </span>
        </div>
      )}
    </div>
  );
}