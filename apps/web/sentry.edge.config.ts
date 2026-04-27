import type { VercelEdgeOptions } from "@sentry/vercel-edge";
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryTransaction } from "./src/lib/sentry/before-send";

const dsn = process.env.SENTRY_DSN ?? "";

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    beforeSend: scrubSentryEvent as NonNullable<VercelEdgeOptions["beforeSend"]>,
    beforeSendTransaction: scrubSentryTransaction as NonNullable<VercelEdgeOptions["beforeSendTransaction"]>,
  });
}
