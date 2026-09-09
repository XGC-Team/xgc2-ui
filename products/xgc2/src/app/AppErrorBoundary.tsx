import { AlertTriangle,RotateCcw } from 'lucide-react';
import { Component,type ErrorInfo,type ReactNode } from 'react';
import { ControlButton } from '../components/controls/ControlButton';
import '../styles/app-error-boundary.css';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps,AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error,info: ErrorInfo) {
    console.error('Unhandled application render error',error,info.componentStack);
  }

  private readonly retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-error-boundary-page" role="alert" data-xgc-role="app-error-boundary" data-xgc-id="app-error-boundary">
        <AlertTriangle aria-hidden="true" size={34} />
        <h1>Unable to render this view</h1>
        <p>The application hit an unexpected display error. Retry the view or reload if the problem continues.</p>
        <ControlButton onClick={this.retry} dataXgcRole="app-error-retry" dataXgcId="app-error-retry">
          <RotateCcw aria-hidden="true" size={14} />
          Retry
        </ControlButton>
      </main>
    );
  }
}
