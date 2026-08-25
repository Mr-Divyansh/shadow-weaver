import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Label used in the fallback message, e.g. "Settings". */
  label: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Scoped error boundary. If something inside `children` throws during render,
// only that subtree is replaced with a small inline fallback — the rest of
// the app (the dashboard behind it) keeps rendering normally. This is what
// prevents a bug in, e.g., the Settings panel from ever blanking the whole
// SOC Dashboard.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] crashed:`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary-fallback" role="alert">
          <span className="status-dot dot-critical" aria-hidden="true" />
          <span>
            {this.props.label} hit an unexpected error and was closed to keep the dashboard running.
          </span>
          <button type="button" className="btn btn-ghost" onClick={this.reset}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
