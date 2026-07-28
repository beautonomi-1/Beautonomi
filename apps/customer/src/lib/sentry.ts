import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

/** True after init when DSN exists and SDK is enabled (preview/prod, or dev with EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV). */
let sentryRecording = false;

function getExpoExtra(): Record<string, string | undefined> {
  return (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
}

/** DSN for mobile-customer project (from .env.local → app.config.js extra or process.env). */
function getSentryDsn(): string {
  const fromExtra = getExpoExtra().EXPO_PUBLIC_SENTRY_DSN;
  return fromExtra ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
}

function sentryEnableInDev(): boolean {
  const v =
    getExpoExtra().EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV ??
    process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV;
  return v === "1" || v === "true";
}

/** Release + dist help Sentry group events and match source maps (EAS builds). */
function getSentryReleaseAndDist(): { release?: string; dist?: string } {
  const cfg = Constants.expoConfig;
  if (!cfg) return {};
  const slug = cfg.slug ?? "customer";
  const version = cfg.version ?? "0.0.0";
  const release = `${slug}@${version}`;
  const dist =
    Platform.OS === "ios"
      ? (cfg.ios as { buildNumber?: string } | undefined)?.buildNumber
      : (cfg.android as { versionCode?: number } | undefined)?.versionCode != null
        ? String((cfg.android as { versionCode: number }).versionCode)
        : undefined;
  return { release, ...(dist ? { dist } : {}) };
}

/** Fabric/Reanimated race during navigation — recoverable, not actionable. */
function isRetryableMountingLayerNoise(event: Sentry.Event): boolean {
  const values = event.exception?.values ?? [];
  return values.some(
    (ex) =>
      ex.type === "RetryableMountingLayerException" ||
      (typeof ex.value === "string" && ex.value.includes("Unable to find viewState for tag")),
  );
}

/**
 * Initialize Sentry error reporting.
 * Call once during app startup (root layout).
 * Set EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=1 to capture breadcrumbs/events during local dev.
 */
export function initSentry() {
  const dsn = getSentryDsn();
  if (!dsn) {
    sentryRecording = false;
    return;
  }
  const enabled = !__DEV__ || sentryEnableInDev();
  const { release, dist } = getSentryReleaseAndDist();
  Sentry.init({
    dsn,
    enabled,
    tracesSampleRate: 0.2,
    environment: __DEV__ ? "development" : "production",
    ...(release ? { release } : {}),
    ...(dist ? { dist } : {}),
    beforeSend(event) {
      if (isRetryableMountingLayerNoise(event)) {
        return null;
      }
      if (event.user) {
        delete event.user.ip_address;
      }
      return event;
    },
  });
  sentryRecording = enabled;
}

/** True when Sentry will record breadcrumbs and events. */
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

/** Namespaced context for gate/bootstrap state (search in Sentry issue "Contexts"). */
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

/** Call once from login screens after credentials/OAuth succeed (before navigation). `method` is a coarse channel name, not PII. */
export function logLoginSuccessBreadcrumb(method: string): void {
  authFlowBreadcrumb("login_success", { method });
}

/** Post-login navigation / API bootstrap (shows under Performance / traces when sampled). */
export async function withAuthNavigationSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!isSentryEnabled()) return fn();
  return Sentry.startSpan({ name, op: "navigation" }, async () => fn());
}

/** Identify the current user for Sentry context (email omitted to minimize PII) */
export function setSentryUser(userId: string, _email?: string) {
  if (!isSentryEnabled()) return;
  Sentry.setUser({ id: userId });
}

/** Clear user on logout */
export function clearSentryUser() {
  if (!isSentryEnabled()) return;
  Sentry.setUser(null);
}

/** Capture a non-fatal error */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!isSentryEnabled()) return;
  if (context) {
    Sentry.setContext("extra", context);
  }
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(String(error));
  }
}

/** Warning/info diagnostics for hangs, timeouts, or ambiguous states (not always exceptions). */
export function captureAuthMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "warning",
  extra?: Record<string, unknown>,
): void {
  if (!isSentryEnabled()) return;
  Sentry.captureMessage(message, { level, extra });
}

/** Capture a breadcrumb for debugging (non-auth categories) */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
) {
  if (!isSentryEnabled()) return;
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

export { Sentry };
