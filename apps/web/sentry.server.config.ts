import type { NodeOptions } from "@sentry/node";
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryTransaction } from "./src/lib/sentry/before-send";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
const environment =
  process.env.SENTRY_ENVIRONMENT ??
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
  process.env.VERCEL_ENV ??
  process.env.NODE_ENV ??
  "production";

if (dsn) {
  Sentry.init({
    dsn,
    release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    beforeSend: scrubSentryEvent as NonNullable<NodeOptions["beforeSend"]>,
    beforeSendTransaction: scrubSentryTransaction as NonNullable<NodeOptions["beforeSendTransaction"]>,
  });
}
