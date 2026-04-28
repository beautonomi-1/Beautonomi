import type { BrowserOptions } from "@sentry/react";
import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN, SENTRY_TRACES_SAMPLE_RATE } from "./src/lib/sentry-client-config";
import { scrubSentryEvent, scrubSentryTransaction } from "./src/lib/sentry/before-send";

// Config is in a separate module so this instrumentation entry never references process,
// avoiding Turbopack HMR "module factory is not available" for the process polyfill.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // pnpm can surface two physical @sentry/core installs; Event types are nominally distinct without the cast
    beforeSend: scrubSentryEvent as NonNullable<BrowserOptions["beforeSend"]>,
    beforeSendTransaction: scrubSentryTransaction as NonNullable<BrowserOptions["beforeSendTransaction"]>,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
