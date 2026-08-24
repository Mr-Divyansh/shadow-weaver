import { useEffect, useRef } from "react";
import { useAppState } from "../store";
import { provider } from "../simulation";
import { SEVERITY_META } from "../types";

import "./ApprovalDialog.css";

export function ApprovalDialog() {
  const state = useAppState();
  const pending = state.approval.pending;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pending) return;

    const prevActive = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        provider.ignoreContainment();
      }
      // Basic focus trap
      if (e.key === "Tab" && dialog) {
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prevActive?.focus();
    };
  }, [pending]);

  if (!pending) return null;

  const meta = SEVERITY_META[pending.severity];

  return (
    <div className="approval-backdrop" role="presentation">
      <div
        className="approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        aria-describedby="approval-desc"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="approval-icon" aria-hidden="true">⚠</div>
        <h2 id="approval-title" className="approval-title">Threat detected</h2>
        <p id="approval-desc" className="approval-desc">
          A containment action requires your approval before it can be executed.
        </p>

        <dl className="approval-details">
          <div className="approval-row">
            <dt>Source</dt>
            <dd className="mono">{pending.source}</dd>
          </div>
          <div className="approval-row">
            <dt>Severity</dt>
            <dd><span className={`badge ${meta.className}`}>{meta.label}</span></dd>
          </div>
          <div className="approval-row">
            <dt>Recommended action</dt>
            <dd>{pending.recommendedAction}</dd>
          </div>
          <div className="approval-row">
            <dt>Time</dt>
            <dd className="mono">{pending.timestamp}</dd>
          </div>
        </dl>

        <div className="approval-actions">
          <button className="btn btn-danger" onClick={() => provider.approveContainment()} autoFocus>
            Approve Containment
          </button>
          <button className="btn btn-secondary" onClick={() => provider.ignoreContainment()}>
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}