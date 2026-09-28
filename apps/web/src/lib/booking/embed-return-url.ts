import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.BOOKING_EMBED_RETURN_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "embed-return-dev-secret";

export function validateHttpsReturnUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    if (u.href.length > 2048) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function signEmbedReturnUrl(returnUrl: string, bookingId: string): string {
  const sig = createHmac("sha256", SECRET).update(`${bookingId}:${returnUrl}`).digest("base64url");
  return sig;
}

export function verifyEmbedReturnUrl(
  returnUrl: string,
  bookingId: string,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = signEmbedReturnUrl(returnUrl, bookingId);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function appendSignedEmbedReturnToSuccessUrl(
  successUrl: string,
  opts: { embed: boolean; returnUrl: string | null; bookingId: string },
): string {
  const url = new URL(successUrl, "https://placeholder.local");
  if (opts.embed) {
    url.searchParams.set("embed", "1");
  }
  if (opts.returnUrl) {
    url.searchParams.set("return", opts.returnUrl);
    url.searchParams.set(
      "return_sig",
      signEmbedReturnUrl(opts.returnUrl, opts.bookingId),
    );
  }
  return `${url.pathname}${url.search}`;
}
