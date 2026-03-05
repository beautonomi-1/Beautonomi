/**
 * Sentry client config. Isolated so instrumentation-client.ts does not reference
 * process.env directly (avoids Turbopack HMR "module factory is not available" for process polyfill).
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
export const SENTRY_TRACES_SAMPLE_RATE = 0.1;
