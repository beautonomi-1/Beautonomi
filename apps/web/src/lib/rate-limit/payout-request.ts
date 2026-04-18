/**
 * Wave 2.4 (audit 2026-04 final 100/100): rate limit for provider payout
 * requests. Previously POST /api/provider/payouts had no rate limit at
 * all, so a leaked provider token (or a confused front-end retry loop)
 * could fire dozens of payout requests per minute. The concurrent-payout
 * guard inside the route catches this *eventually*, but each spurious
 * request still goes through balance reads, RLS checks and an INSERT —
 * pure CPU + DB pressure on the hottest money path.
 *
 * Limit: 5 requests / minute / authenticated provider, with a generous
 * 30-request hourly burst ceiling so legitimate payroll runs are not
 * blocked. Rate limit is keyed on user id when available, falling back
 * to client IP for anonymous spoofing attempts.
 */
import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const PAYOUT_REQUEST_PER_MINUTE = {
  prefix: "payout-request:1m",
  limit: 5,
  windowSeconds: 60,
} as const;

const PAYOUT_REQUEST_PER_HOUR = {
  prefix: "payout-request:1h",
  limit: 30,
  windowSeconds: 60 * 60,
} as const;

export type PayoutRateLimitResult = RateLimitResult;

export async function checkPayoutRequestRateLimit(
  request: Request,
  userId: string | null,
): Promise<PayoutRateLimitResult> {
  const key = userId?.trim() || `ip:${getClientIp(request)}`;
  const fast = await checkRateLimit(PAYOUT_REQUEST_PER_MINUTE, key);
  if (!fast.allowed) return fast;
  const slow = await checkRateLimit(PAYOUT_REQUEST_PER_HOUR, key);
  return slow;
}
