import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { AdminSessionProvider } from "@/providers/AdminSessionProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import App from "./App";
import "./index.css";
import { publicEnv } from "@/config/publicEnv";

const rootEl = document.getElementById("root")!;

function renderApp() {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter basename="/admin">
            <AdminSessionProvider>
              <App />
              <Toaster richColors closeButton position="top-center" />
            </AdminSessionProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

const sentryDsn = publicEnv.sentryDsn;
if (sentryDsn) {
  void import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn: sentryDsn,
      environment: publicEnv.sentryEnvironment || import.meta.env.MODE,
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      ignoreErrors: [/ResizeObserver loop/i, /^Non-Error promise rejection captured/],
      beforeSend(event, hint) {
        const ex = hint.originalException;
        if (
          ex &&
          typeof ex === "object" &&
          "name" in ex &&
          (ex as Error).name === "AdminApiError" &&
          "status" in ex &&
          typeof (ex as { status: unknown }).status === "number"
        ) {
          const st = (ex as { status: number }).status;
          if (st === 401 || st === 403) return null;
        }
        return event;
      },
    });
    renderApp();
  });
} else {
  renderApp();
}
