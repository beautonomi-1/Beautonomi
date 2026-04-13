const STORAGE_KEY = "beautonomi_guest_fp";

/**
 * Stable per-browser fingerprint for booking hold de-duplication.
 * Stored in sessionStorage so it survives page refreshes within a tab
 * but isolates across tabs/incognito windows.
 */
export function getGuestFingerprintHash(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let fp = sessionStorage.getItem(STORAGE_KEY);
    if (!fp) {
      fp = crypto.randomUUID();
      sessionStorage.setItem(STORAGE_KEY, fp);
    }
    return fp;
  } catch {
    return null;
  }
}
