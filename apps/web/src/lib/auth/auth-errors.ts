export class AuthRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Too many attempts. Please try again later.") {
    super(message);
    this.name = "AuthRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function parseRetryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
