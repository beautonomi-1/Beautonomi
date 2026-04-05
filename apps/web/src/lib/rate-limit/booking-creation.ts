import { checkRateLimit, getClientIp, type RateLimitResult } from "./store";

const BOOKING_CREATION_CONFIG = {
  prefix: "booking-create",
  limit: 20,
  windowSeconds: 60 * 60,
} as const;

export { getClientIp };
export type BookingRateLimitResult = RateLimitResult;

export async function checkBookingCreationRateLimit(
  request: Request,
): Promise<BookingRateLimitResult> {
  const ip = getClientIp(request);
  return checkRateLimit(BOOKING_CREATION_CONFIG, ip);
}

/** @deprecated Distributed store increments atomically. Kept for call-site compatibility. */
export function incrementBookingCreation(_request: Request): void {}
