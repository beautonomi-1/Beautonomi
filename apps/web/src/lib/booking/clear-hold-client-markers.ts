/**
 * Public web booking stores hold id + expiry in sessionStorage and may set a short-lived
 * `beautonomi_hold_id` cookie during OAuth / OTP in `BeautonomiGateModal`.
 */

export function clearBeautonomiHoldIdCookie() {
  try {
    if (typeof document !== "undefined") {
      document.cookie = "beautonomi_hold_id=; path=/; max-age=0; SameSite=Lax";
    }
  } catch {
    // ignore
  }
}

/** Clear session hold draft + cookie — use after consume, failed hold load, or checkout completion. */
export function clearBeautonomiHoldClientMarkers() {
  try {
    sessionStorage.removeItem("beautonomi_hold_id");
    sessionStorage.removeItem("beautonomi_hold_expires_at");
  } catch {
    // ignore
  }
  clearBeautonomiHoldIdCookie();
}
