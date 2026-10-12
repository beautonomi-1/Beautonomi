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
export function extractFlutterwaveTransactionIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams ?? {};
    const tid = q.transaction_id;
    if (Array.isArray(tid)) return (tid[0] ?? "").trim() || null;
    if (typeof tid === "string" && tid.trim()) return tid.trim();
  } catch {
    /* fall through */
  }
  try {
    return new URL(url).searchParams.get("transaction_id")?.trim() || null;
  } catch {
    return null;
  }
}

export function extractHostedCheckoutStatusFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams ?? {};
    const st = q.status;
    if (Array.isArray(st)) return (st[0] ?? "").trim().toLowerCase() || null;
    if (typeof st === "string" && st.trim()) return st.trim().toLowerCase();
  } catch {
    /* fall through */
  }
  try {
    return new URL(url).searchParams.get("status")?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export function extractPaystackReferenceFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams ?? {};
    const ref = q.reference ?? q.trxref ?? q.tx_ref;
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
      u.searchParams.get("tx_ref") ||
      null
    )?.trim() || null;
  } catch {
    return null;
  }
}
