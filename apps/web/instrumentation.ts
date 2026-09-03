import * as Sentry from "@sentry/nextjs";
import { validateServerEnv } from "./src/lib/env";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateServerEnv({ failFast: true });
    await import("./sentry.server.config");
    // F26 — start OTel only when enabled via env.
    if (process.env.OTEL_ENABLED === "1") {
      try {
        const { registerOtel } = await import("./src/lib/otel/register");
        await registerOtel();
      } catch (err) {
        console.warn("[otel] failed to import registration module", err);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
