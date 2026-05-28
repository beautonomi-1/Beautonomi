"use client";

import { useEffect } from "react";

// Only send when ingest server URL is set (avoids ERR_CONNECTION_REFUSED when server isn't running)
const DEBUG_LOG_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEBUG_INGEST_URL
    ? process.env.NEXT_PUBLIC_DEBUG_INGEST_URL
    : undefined;
const SESSION_ID = "50ed8b";

function isSupabaseAuthLockError(value: unknown): boolean {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.includes("Lock ") && message.includes("was released because another request stole it");
}

/**
 * Returns true for AbortErrors and cancelled-request errors that are expected
 * from browser back-gestures, Next.js route transitions, component unmounts,
 * and fetch timeouts. These are operational noise, not real errors.
 */
function isExpectedAbortOrCancelError(value: unknown): boolean {
  if (!(value instanceof Error)) return false;
  if (value.name === "AbortError") return true;
  if (value.name === "FetchTimeoutError") return true;
  const msg = value.message ?? "";
  return (
    msg.includes("signal is aborted") ||
    msg.includes("Request was cancelled") ||
    msg.includes("Request timed out") ||
    msg.includes("The user aborted a request") ||
    // Next.js navigation / RSC fetch cancellations (common on Mobile Safari back swipe)
    msg.includes("AbortError")
  );
}

function sendLog(data: Record<string, any>) {
  if (!DEBUG_LOG_URL) return;
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
      // Suppress expected operational noise — prevents Sentry/monitoring noise in production.
      // These occur routinely from: Mobile Safari back-swipe cancelling in-flight fetches,
      // Next.js route transitions aborting RSC requests, component unmounts, and fetch timeouts.
      if (isSupabaseAuthLockError(err) || isExpectedAbortOrCancelError(err)) {
        event.preventDefault();
        return;
      }
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
