import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { publicEnv } from "@/config/publicEnv";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
  isChunkLoadError?: boolean;
}

function isChunkLoadErrorMessage(message?: string): boolean {
  if (!message) return false;
  return (
    message.includes("dynamically imported module") ||
    message.includes("Failed to fetch") ||
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Importing a module script failed")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
      isChunkLoadError: isChunkLoadErrorMessage(error.message),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("admin-web ErrorBoundary:", error, info);
    if (publicEnv.sentryDsn) {
      void import("@sentry/react").then(({ captureException }) => {
        captureException(error, { extra: { componentStack: info.componentStack } });
      });
    }
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.isChunkLoadError
        ? "A new version is available. Please reload the page."
        : this.state.message ?? "Please refresh or try again.";

      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-900">
            <h2 className="text-lg font-semibold">
              {this.state.isChunkLoadError ? "New version available" : "Something went wrong"}
            </h2>
            <p className="mt-2 text-sm">{message}</p>
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
