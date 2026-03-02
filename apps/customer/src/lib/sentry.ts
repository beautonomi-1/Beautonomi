import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

/** DSN for mobile-customer project (from .env.local → app.config.js extra or process.env). */
function getSentryDsn(): string {
  const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.EXPO_PUBLIC_SENTRY_DSN;
  return fromExtra ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
}

/**
 * Initialize Sentry error reporting.
 * Call once during app startup (root layout).
 */
export function initSentry() {
  const dsn = getSentryDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Disable in dev to avoid noise
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    environment: __DEV__ ? "development" : "production",
    beforeSend(event) {
      // Strip PII if needed
      if (event.user) {
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

/** Identify the current user for Sentry context */
export function setSentryUser(userId: string, email?: string) {
  Sentry.setUser({ id: userId, email });
}

/** Clear user on logout */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/** Capture a non-fatal error */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (context) {
    Sentry.setContext("extra", context);
  }
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(String(error));
  }
}

/** Capture a breadcrumb for debugging */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

export { Sentry };
