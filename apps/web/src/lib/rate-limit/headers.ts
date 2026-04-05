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
