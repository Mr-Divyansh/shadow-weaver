import React, { ReactNode, ErrorInfo } from "react";

interface ErrorBoundaryProps {
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log error for debugging (in development only)
    if (import.meta.env.DEV) {
      console.error("React Error Boundary caught:", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      // Show fallback UI when there's an error
      return this.props.fallback;
    }
    // Render children when there's no error
    return this.props.children as ReactNode;
  }
}