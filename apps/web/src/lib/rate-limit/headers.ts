export interface RateLimitHeaderInput {
  limit?: number;
  remaining?: number;
  retryAfterSeconds?: number;
}

export function applyRateLimitHeaders(
  response: Response,
  input: RateLimitHeaderInput,
): Response {
  if (typeof input.limit === "number") {
    response.headers.set("x-ratelimit-limit", String(input.limit));
  }
  if (typeof input.remaining === "number") {
    response.headers.set("x-ratelimit-remaining", String(Math.max(0, input.remaining)));
  }
  if (typeof input.retryAfterSeconds === "number") {
    response.headers.set("retry-after", String(Math.max(1, Math.floor(input.retryAfterSeconds))));
  }
  return response;
}

/**
 * Returns rate-limit headers as a plain `Record<string, string>` suitable for
 * passing directly to `NextResponse.json({ ... }, { headers: getRateLimitHeaders(result) })`.
 */
export function getRateLimitHeaders(input: RateLimitHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof input.limit === "number") {
    headers["x-ratelimit-limit"] = String(input.limit);
  }
  if (typeof input.remaining === "number") {
    headers["x-ratelimit-remaining"] = String(Math.max(0, input.remaining));
  }
  if (typeof input.retryAfterSeconds === "number") {
    headers["retry-after"] = String(Math.max(1, Math.floor(input.retryAfterSeconds)));
  }
  return headers;
}
