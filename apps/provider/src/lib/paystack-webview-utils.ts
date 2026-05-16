import * as ExpoLinking from "expo-linking";

/** Extract Paystack `reference` / `trxref` from a return URL (app scheme or https). */
export function extractPaystackReferenceFromUrl(url: string): string | null {
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
    return (u.searchParams.get("reference") || u.searchParams.get("trxref"))?.trim() || null;
  } catch {
    return null;
  }
}

export function isCancelledPaystackUrl(url: string): boolean {
  try {
    const parsed = ExpoLinking.parse(url);
    if (parsed.queryParams?.cancelled === "1") return true;
  } catch {
    /* fall through */
  }
  try {
    return new URL(url).searchParams.get("cancelled") === "1";
  } catch {
    return false;
  }
}

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
