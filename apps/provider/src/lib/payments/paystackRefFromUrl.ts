import * as ExpoLinking from "expo-linking";

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
