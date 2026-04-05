import "server-only";

import { NextRequest } from "next/server";
import { headers } from "next/headers";

/**
 * Build a NextRequest for the current incoming request (cookies + forwarded headers)
 * so server-only code can invoke route handlers or shared `getXxxResponse(request)` logic
 * without an HTTP round-trip (best TTFB for RSC).
 */
export async function createNextRequestFromHeaders(pathWithQuery: string): Promise<NextRequest> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const forwardedProto = h.get("x-forwarded-proto");
  const proto =
    forwardedProto ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const url = new URL(`${proto}://${host}${path}`);
  return new NextRequest(url, { headers: h });
}
