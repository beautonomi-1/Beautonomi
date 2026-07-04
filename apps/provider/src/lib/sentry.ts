import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { isDeviceOffline } from "@/lib/connectivity";
import { getApiErrorCode, getApiErrorMessage, isTransientApiFailure } from "@/lib/api-error";

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
  const message = getApiErrorMessage(error, "Unknown error");
  // Offline + transient still lands in Sentry as a warning so sessions stay
  // observable; only skip the heavier exception capture in that case.
  if (isDeviceOffline() && isTransientApiFailure(error)) {
    Sentry.captureMessage(message, {
      level: "warning",
      extra: context,
      tags: { failure_kind: "offline_transient" },
    });
    return;
  }
  if (context) {
    Sentry.setContext("extra", context);
  }
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(message);
  }
}

/**
 * Record API failures in Sentry without coupling observability to UI blocking.
 * Always leaves a breadcrumb; emits an exception unless the failure is a
 * deliberate background cancel (`CANCELLED`).
 */
export function captureApiFailure(
  error: unknown,
  context?: Record<string, unknown>,
  options?: { uiHandled?: boolean },
): void {
  if (!isSentryEnabled()) return;

  const code = getApiErrorCode(error) ?? (typeof context?.code === "string" ? context.code : undefined);
  const message = getApiErrorMessage(error, "API request failed");
  const uiHandled = options?.uiHandled ?? false;

  addBreadcrumb(message, "api_failure", {
    ...context,
    code,
    uiHandled,
    offline: isDeviceOffline(),
    transient: isTransientApiFailure(error),
  });

  if (code === "CANCELLED") return;

  captureError(error instanceof Error ? error : new Error(message), {
    ...context,
    code,
    uiHandled,
  });
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
