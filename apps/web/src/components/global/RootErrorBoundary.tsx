"use client";

import React from "react";

// Only send debug logs when ingest server URL is set (e.g. local debug server on 7243)
const DEBUG_LOG_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEBUG_INGEST_URL
    ? process.env.NEXT_PUBLIC_DEBUG_INGEST_URL
    : undefined;
const SESSION_ID = "50ed8b";

function logError(error: Error) {
  if (!DEBUG_LOG_URL) return;
  const payload = {
    sessionId: SESSION_ID,
    location: "RootErrorBoundary",
    message: "Root error boundary caught",
    data: {
      errorMessage: error.message,
      errorStack: error.stack ?? "",
      errorName: error.name,
    },
    timestamp: Date.now(),
    hypothesisId: "white-screen",
  };
  fetch(DEBUG_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION_ID },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    logError(error);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 600 }}>
          <h1 style={{ color: "#c00", marginBottom: 16 }}>Something went wrong</h1>
          <p style={{ marginBottom: 8 }}><strong>{this.state.error.name}:</strong> {this.state.error.message}</p>
          {this.state.error.stack && (
            <pre style={{ fontSize: 12, overflow: "auto", background: "#f5f5f5", padding: 12 }}>{this.state.error.stack}</pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
