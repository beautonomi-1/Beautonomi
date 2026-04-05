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
