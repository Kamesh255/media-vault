import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Component failures stay contained while the rest of the shell remains usable.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary">
          <h1>MediaVault needs a reset</h1>
          <p className="muted">This view failed to render. Reload the workspace to try again.</p>
          <button onClick={() => window.location.reload()}>Reload workspace</button>
        </main>
      );
    }
    return this.props.children;
  }
}
