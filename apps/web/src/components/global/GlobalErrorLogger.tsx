"use client";

import { useEffect } from "react";

const DEBUG_LOG_URL = "http://127.0.0.1:7243/ingest/89f3cdbd-444d-401b-9bce-c59a37625210";
const SESSION_ID = "50ed8b";

function sendLog(data: Record<string, unknown>) {
  fetch(DEBUG_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION_ID },
    body: JSON.stringify({ sessionId: SESSION_ID, timestamp: Date.now(), ...data }),
  }).catch(() => {});
}

export default function GlobalErrorLogger() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      sendLog({
        location: "GlobalErrorLogger.onerror",
        message: "window.onerror",
        data: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error?.stack ?? String(event.error),
        },
        hypothesisId: "white-screen",
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason;
      sendLog({
        location: "GlobalErrorLogger.unhandledrejection",
        message: "unhandledrejection",
        data: {
          errorMessage: err?.message ?? String(err),
          errorStack: err?.stack ?? "",
        },
        hypothesisId: "white-screen",
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
