import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { isDeviceOffline } from "@/lib/connectivity";
import { isTransientApiFailure } from "@/lib/api-error";

let sentryRecording = false;

/** DSN for mobile-provider project (from .env.local / app.config.js extra or process.env). */
function getSentryDsn(): string {
  const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.EXPO_PUBLIC_SENTRY_DSN;
  return fromExtra ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
}

function sentryEnableInDev(): boolean {
  return (
    process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV === "1" ||
    process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV === "true"
  );
}

/**
 * Initialize Sentry error reporting.
 * Set EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=1 to capture breadcrumbs/events during local dev.
 */
export function initSentry() {
  const dsn = getSentryDsn();
  if (!dsn) {
    sentryRecording = false;
    return;
  }
  const enabled = !__DEV__ || sentryEnableInDev();
  Sentry.init({
    dsn,
    enabled,
    tracesSampleRate: 0.2,
    environment: __DEV__ ? "development" : "production",
    beforeSend(event) {
      if (event.user) {
        delete event.user.ip_address;
      }
      return event;
    },
  });
  sentryRecording = enabled;
}

export function isSentryEnabled(): boolean {
  return sentryRecording;
}

export function setMobileAppTag(app: "customer" | "provider"): void {
  if (!isSentryEnabled()) return;
  Sentry.setTag("mobile_app", app);
}

export function setAuthFlowTags(tags: {
  auth_state?: string;
  route_group?: string;
  guard_name?: string;
}): void {
  if (!isSentryEnabled()) return;
  if (tags.auth_state !== undefined) Sentry.setTag("auth_state", tags.auth_state);
  if (tags.route_group !== undefined) Sentry.setTag("route_group", tags.route_group);
  if (tags.guard_name !== undefined) Sentry.setTag("guard_name", tags.guard_name);
}

export function setAuthGateContext(name: string, data: Record<string, unknown>): void {
  if (!isSentryEnabled()) return;
  Sentry.setContext(`gate_${name}`, data);
}

export function authFlowBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!isSentryEnabled()) return;
  Sentry.addBreadcrumb({
    category: "auth_flow",
    message,
    level: "info",
    data,
  });
}

export function logLoginSuccessBreadcrumb(method: string): void {
  authFlowBreadcrumb("login_success", { method });
}

export async function withAuthNavigationSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!isSentryEnabled()) return fn();
  return Sentry.startSpan({ name, op: "navigation" }, async () => fn());
}

export function setSentryUser(userId: string, _email?: string) {
  if (!isSentryEnabled()) return;
  Sentry.setUser({ id: userId });
}

export function clearSentryUser() {
  if (!isSentryEnabled()) return;
  Sentry.setUser(null);
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!isSentryEnabled()) return;
  // Don't report failures that are just the device being offline — the user is
  // already told via the OfflineBar and the request retries on reconnect. We
  // still report transient-looking failures when ONLINE, since "could not reach
  // the server" can then indicate a real outage or misconfigured API URL.
  if (isDeviceOffline() && isTransientApiFailure(error)) return;
  if (context) {
    Sentry.setContext("extra", context);
  }
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(String(error));
  }
}

export function captureAuthMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "warning",
  extra?: Record<string, unknown>,
): void {
  if (!isSentryEnabled()) return;
  Sentry.captureMessage(message, { level, extra });
}

export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
) {
  if (!isSentryEnabled()) return;
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

export { Sentry };
