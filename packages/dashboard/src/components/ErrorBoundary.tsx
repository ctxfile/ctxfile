import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  /** Reset the boundary when this changes (e.g. active view id). */
  resetKey: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  keyAtError: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, keyAtError: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(): void {
    this.setState({ keyAtError: this.props.resetKey });
  }

  override componentDidUpdate(): void {
    if (this.state.error !== null && this.state.keyAtError !== this.props.resetKey) {
      this.setState({ error: null, keyAtError: null });
    }
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="empty-state view-error" role="alert">
          <div className="empty-title">This view hit an unexpected error</div>
          <div className="empty-body">Switching views or refreshing usually clears it.</div>
          <div className="empty-action">
            <button
              type="button"
              className="btn"
              onClick={() => this.setState({ error: null, keyAtError: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
