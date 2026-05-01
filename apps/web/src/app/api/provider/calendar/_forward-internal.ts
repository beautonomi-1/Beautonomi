import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Headers to forward when one route handler proxies to another on the same deployment.
 * Includes auth, tenant hints, CSRF, and proxy/host context (Vercel, CDNs) so the inner
 * route sees the same client intent as a direct call.
 */
function collectForwardHeaders(request: NextRequest): Headers {
  const out = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (
      k === "authorization" ||
      k === "cookie" ||
      k.startsWith("x-") ||
      k === "accept" ||
      k === "accept-language" ||
      k === "content-type" ||
      k === "host" ||
      k === "forwarded"
    ) {
      out.set(key, value);
    }
  });
  return out;
}

export async function forwardSameOrigin(
  request: NextRequest,
  targetPathWithSearch: string,
  overrideMethod?: string,
): Promise<NextResponse> {
  const url = new URL(targetPathWithSearch, request.nextUrl.origin);
  const method = overrideMethod ?? request.method;
  const body =
    method !== "GET" && method !== "HEAD"
      ? await request.text()
      : undefined;
  const inner = await fetch(url.toString(), {
    method,
    headers: collectForwardHeaders(request),
    body,
    redirect: "manual",
  });
  const text = await inner.text();
  const ct = inner.headers.get("content-type") ?? "application/json";
  return new NextResponse(text, {
    status: inner.status,
    headers: { "content-type": ct },
  });
}
