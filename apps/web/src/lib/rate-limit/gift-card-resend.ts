import { checkRateLimit, type RateLimitResult } from "./store";

/** POST /api/me/gift-cards/[id]/resend — 3 resends per card per owner per day. */
export const GIFT_CARD_RESEND_CONFIG = {
  prefix: "gift-card-resend:card",
  limit: 3,
  windowSeconds: 24 * 60 * 60,
} as const;

export async function checkGiftCardResendRateLimit(
  userId: string,
  giftCardId: string,
): Promise<RateLimitResult> {
  return checkRateLimit(GIFT_CARD_RESEND_CONFIG, `${userId}:${giftCardId}`);
}
