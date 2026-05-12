import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/metrics
 *
 * Best-effort client telemetry sink. The provider portal flushes
 * `route-metrics` buffers via `navigator.sendBeacon`, which cannot attach
 * custom headers (no CSRF token) and never reads the response.
 *
 * §Provider-audit 2026-05: previously this endpoint was missing entirely,
 * which surfaced as `403 /api/metrics` in browser consoles for every
 * provider portal session (the CSRF middleware fired before any route
 * lookup). Add a small, always-200 sink that silently discards the body
 * if the JSON is malformed; do not log to Sentry — the volume would dwarf
 * real errors. `/api/metrics` is also exempt from CSRF in `src/proxy.ts`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Reading the body keeps the connection well-formed; we don't persist
    // anything in this minimal implementation. Future revisions can pipe
    // entries to OpenTelemetry / a self-hosted analytics endpoint.
    await request.text();
  } catch {
    // Swallow parse errors — beacons are best-effort.
  }
  return new NextResponse(null, { status: 204 });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
