import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useToast } from '@/components/ui/Toast';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 'page': an inline card inside the layout (menus keep working); 'app': full screen. */
  variant?: 'app' | 'page';
  /** When this changes (e.g. the route), a shown error is cleared and the children render again. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a crash while rendering, so the app shows a way out instead of a
 * blank white page. The error is logged to the browser console.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen crashed', error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private retry = () => this.setState({ error: null });

  private goHome = () => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;
    const page = this.props.variant === 'page';
    const card = (
      <div className="card" role="alert" style={{ maxWidth: 460, width: '100%', padding: '28px 26px', margin: page ? '24px auto' : undefined }}>
        <h1 className="card-title" style={{ marginTop: 0 }}>
          Something went wrong
        </h1>
        <p className="text-muted" style={{ margin: '8px 0 18px' }}>
          {page
            ? 'This page hit an unexpected problem. Your saved data is safe. Try again, or open another page from the menu.'
            : 'This screen hit an unexpected problem. Your saved data is safe. Reload the page, or go back to the start.'}
        </p>
        <div className="row" style={{ gap: 8 }}>
          {page ? (
            <button type="button" className="btn btn-primary" onClick={this.retry}>
              Try again
            </button>
          ) : null}
          <button type="button" className={page ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => window.location.reload()}>
            Reload page
          </button>
          {page ? null : (
            <button type="button" className="btn btn-secondary" onClick={this.goHome}>
              Go to start
            </button>
          )}
        </div>
      </div>
    );
    if (page) return card;
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>{card}</div>;
  }
}

/** Wraps a layout's page area: a crash stays inside that page and clears when you navigate. */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary variant="page" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  );
}

function messageOf(reason: unknown): string | null {
  if (reason && typeof reason === 'object' && (reason as { name?: string }).name === 'AbortError') return null;
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string' && reason) return reason;
  return 'Something went wrong. Please try again.';
}

/**
 * Shows a message for any action that failed without handling its own error
 * (e.g. a download button), instead of failing silently.
 */
export function UnhandledErrorNotifier() {
  const toast = useToast();
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const message = messageOf(event.reason);
      if (!message) return;
      console.error('Unhandled error', event.reason);
      toast.error(message);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [toast]);
  return null;
}
