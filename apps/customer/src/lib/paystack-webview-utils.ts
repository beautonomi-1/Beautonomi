import * as ExpoLinking from "expo-linking";

/** Extract Paystack `reference` / `trxref` from a return URL (app scheme or https). */
/** Stripe Checkout success URLs include `session_id=cs_…`. */
export function extractStripeCheckoutSessionIdFromUrl(url: string): string | null {
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

export function extractFlutterwaveTransactionIdFromUrl(url: string): string | null {
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

export function extractHostedCheckoutReturn(url: string): {
  reference: string | null;
  transactionId: string | null;
  status: string | null;
  sessionId: string | null;
} {
  return {
    reference: extractPaystackReferenceFromUrl(url),
    transactionId: extractFlutterwaveTransactionIdFromUrl(url),
    status: extractHostedCheckoutStatusFromUrl(url),
    sessionId: extractStripeCheckoutSessionIdFromUrl(url),
  };
}

function extractHostedCheckoutStatusFromUrl(url: string): string | null {
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

export function isFailedHostedCheckoutReturn(url: string): boolean {
  const st = extractHostedCheckoutStatusFromUrl(url);
  return st === "failed" || st === "cancelled";
}

export function extractPaystackReferenceFromUrl(url: string): string | null {
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
      u.searchParams.get("tx_ref")
    )?.trim() || null;
  } catch {
    return null;
  }
}

export function isCancelledPaystackUrl(url: string): boolean {
  try {
    const parsed = ExpoLinking.parse(url);
    const q = parsed.queryParams ?? {};
    if (q.cancelled === "1" || q.payment_cancelled === "1") return true;
    if (q.topup_cancelled === "1" || q.card_verification_cancelled === "1") return true;
  } catch {
    /* fall through */
  }
  try {
    const u = new URL(url);
    const p = u.searchParams;
    if (p.get("cancelled") === "1" || p.get("payment_cancelled") === "1") return true;
    if (p.get("topup_cancelled") === "1" || p.get("card_verification_cancelled") === "1") return true;
    if (u.pathname.includes("/checkout/cancelled") || u.pathname.includes("/shop/cancelled")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * True when Paystack redirected to the same path as our `callback_url` / `returnUrl`
 * (Expo may use `customer://`, `exp://`, etc.).
 */
export function matchesExpoReturnUrl(url: string, returnUrl: string): boolean {
  if (!returnUrl || !url) return false;
  if (url === returnUrl) return true;
  const rBase = returnUrl.split(/[?#]/)[0];
  const uBase = url.split(/[?#]/)[0];
  if (uBase === rBase) return true;
  if (url.startsWith(returnUrl)) return true;
  if (url.startsWith(`${rBase}?`) || url.startsWith(`${rBase}#`)) return true;
  return false;
}
