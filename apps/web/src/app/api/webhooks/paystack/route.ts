/**
 * @deprecated This legacy endpoint forwards all requests to /api/payments/webhook.
 *
 * If your Paystack dashboard is still configured with this URL, update it to point
 * directly to /api/payments/webhook. This shim will be removed in a future release.
 *
 * Proxying here prevents the old handler's duplicate business logic from running
 * alongside the canonical handler, which would cause double-processing of events.
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // Forward all headers and the raw body to the canonical webhook endpoint.
    const targetUrl = new URL("/api/payments/webhook", request.url);

    const forwardedHeaders = new Headers();
    const passthroughHeaders = [
      "x-paystack-signature",
      "content-type",
      "user-agent",
      "x-forwarded-for",
    ];
    for (const h of passthroughHeaders) {
      const val = request.headers.get(h);
      if (val) forwardedHeaders.set(h, val);
    }

    const response = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: forwardedHeaders,
      body,
    });

    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[legacy webhook proxy] Failed to forward to /api/payments/webhook:", err);
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}
