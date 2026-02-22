/**
 * Invalidate cached setup status so the next fetch gets fresh data.
 * Call this when the user saves/changes setup-related data (e.g. operating hours, locations).
 */
export function invalidateSetupStatusCache(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("quickStartBannerStatus");
  sessionStorage.setItem("shouldRefreshSetupStatus", "true");
}
