import { randomUUID } from "crypto";

type MetricLevel = "info" | "error";

function emit(level: MetricLevel, payload: Record<string, unknown>) {
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else {
    console.info(line);
  }
}

/**
 * Emit a single counter-style metric. Use for post-booking effect failures so ops
 * dashboards can alert on `booking_post_effects_failure_total > N`.
 */
export function emitMetric(name: string, tags: Record<string, string | number | boolean | null | undefined>): void {
  emit("info", {
    event: "metric",
    metric: name,
    ...tags,
    emitted_at: new Date().toISOString(),
  });
}

/**
 * Run an async side-effect that must NEVER break the parent request. Errors are
 * logged, reported to Sentry when available, and counted via `emitMetric`.
 *
 * Usage:
 *   await safely(
 *     () => notifyProvider(bookingId),
 *     { metric: "booking_post_effects_failure_total", tags: { op: "notifyProvider" } },
 *   );
 */
export async function safely<T>(
  op: () => Promise<T>,
  context: { metric: string; tags?: Record<string, string | number | boolean | null | undefined> },
): Promise<T | null> {
  try {
    return await op();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitMetric(context.metric, { ...context.tags, status: "error", message });
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(error, { tags: { ...context.tags, metric: context.metric } as Record<string, string> });
    } catch {
      // Sentry not configured — swallow.
    }
    return null;
  }
}

export async function withRouteMetrics(
  request: Request,
  route: string,
  method: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") || randomUUID();

  try {
    const response = await handler();
    const durationMs = Date.now() - startedAt;

    try {
      response.headers.set("x-request-id", requestId);
    } catch {
      // Best-effort; do not fail response if headers are immutable.
    }

    emit("info", {
      event: "api_route_completed",
      request_id: requestId,
      route,
      method,
      status: response.status,
      duration_ms: durationMs,
    });

    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    emit("error", {
      event: "api_route_failed",
      request_id: requestId,
      route,
      method,
      status: 500,
      duration_ms: durationMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
