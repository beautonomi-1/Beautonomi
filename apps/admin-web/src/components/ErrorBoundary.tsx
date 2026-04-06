import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("admin-web ErrorBoundary:", error, info);
    if (import.meta.env.VITE_SENTRY_DSN) {
      void import("@sentry/react").then(({ captureException }) => {
        captureException(error, { extra: { componentStack: info.componentStack } });
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-900">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="mt-2 text-sm">{this.state.message ?? "Please refresh or try again."}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm text-white"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
