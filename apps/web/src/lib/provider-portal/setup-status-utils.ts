/**
 * Invalidate cached setup status so the next fetch gets fresh data.
 * Call this when the user saves/changes setup-related data (e.g. operating hours, locations).
 */
export const PROVIDER_SETUP_STATUS_CHANGED = "provider-setup-status-changed";

export function invalidateSetupStatusCache(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("quickStartBannerStatus");
  sessionStorage.setItem("shouldRefreshSetupStatus", "true");
  window.dispatchEvent(new CustomEvent(PROVIDER_SETUP_STATUS_CHANGED));
}
