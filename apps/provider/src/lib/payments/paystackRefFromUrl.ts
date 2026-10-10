import * as ExpoLinking from "expo-linking";

/** Stripe Checkout success URLs include `session_id=cs_…`. */
export function extractStripeCheckoutSessionIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams ?? {};
    const sid = q.session_id;
    if (Array.isArray(sid)) return (sid[0] ?? "").trim() || null;
    if (typeof sid === "string" && sid.trim()) return sid.trim();
  } catch {
    /* fall through */
  }
  try {
    return new URL(url).searchParams.get("session_id")?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Extract Paystack `reference` / `trxref` from a return URL.
 * Works for both Expo deep links (`provider://...`) and `https://...`.
 */
export function extractPaystackReferenceFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams ?? {};
    const ref = q.reference ?? q.trxref;
    if (Array.isArray(ref)) return (ref[0] ?? "").trim() || null;
    if (typeof ref === "string" && ref.trim()) return ref.trim();
  } catch {
    /* fall through */
  }
  try {
    const u = new URL(url);
    return (
      u.searchParams.get("reference") ||
      u.searchParams.get("trxref") ||
      null
    )?.trim() || null;
  } catch {
    return null;
  }
}
