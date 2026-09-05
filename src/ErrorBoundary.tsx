import { Component, ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void window.moneyball.reportRendererError(error.message, info.componentStack || '').catch(() => undefined);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="fatalPanel">
      <div className="panel">
        <h1>Die Oberfläche wurde sicher angehalten</h1>
        <p>Deine Daten wurden nicht gelöscht. Der Fehler wurde lokal protokolliert.</p>
        <button className="primary" onClick={() => window.location.reload()}>Oberfläche neu laden</button>
      </div>
    </main>;
  }
}
