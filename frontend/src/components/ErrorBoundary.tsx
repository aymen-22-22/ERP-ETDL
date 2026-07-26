import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Generic reusable boundary — React only supports catching render errors via
 * a class component, there's no hook equivalent. Wrap any subtree (a route,
 * a widget) that shouldn't take the whole app down with it; falls back to
 * ServerErrorPage-shaped UI by default, or a custom `fallback` render prop.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-sm text-sm">{error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }
}
