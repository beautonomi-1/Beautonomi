import { NextResponse } from "next/server";
import { logAuthMetric } from "@/lib/auth/auth-metrics";

export function jsonRateLimited(message: string, retryAfterSeconds: number, route: string) {
  logAuthMetric("auth_rate_limited", { route, retryAfterSeconds });
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}
