import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryTransaction } from "./src/lib/sentry/before-send";

const dsn = process.env.SENTRY_DSN ?? "";

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryTransaction,
  });
}
