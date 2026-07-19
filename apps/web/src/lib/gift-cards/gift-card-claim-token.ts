import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.GIFT_CARD_CLAIM_SECRET ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "gift-card-claim-dev-secret";

export function signGiftCardClaimToken(giftCardId: string, recipientEmail: string): string {
  const payload = `${giftCardId}:${recipientEmail.toLowerCase().trim()}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyGiftCardClaimToken(
  token: string,
): { giftCardId: string; recipientEmail: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const recipientEmail = parts.pop()!;
    const giftCardId = parts.join(":");
    const payload = `${giftCardId}:${recipientEmail}`;
    const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { giftCardId, recipientEmail };
  } catch {
    return null;
  }
}
