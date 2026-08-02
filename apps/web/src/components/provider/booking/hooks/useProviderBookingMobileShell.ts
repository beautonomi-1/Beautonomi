"use client";

import { useConfigBundle } from "@/providers/ConfigBundleProvider";

/**
 * Provider booking mobile shell (Phase 5 default-on).
 *
 * The mobile-first bottom sheet is the only booking UI. Admin can disable via
 * `provider_booking_mobile_shell` in ConfigBundle for emergency rollback
 * (requires redeploy with legacy sidebar — removed in Phase 5).
 *
 * Dev override: `NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL=0` to force off during
 * local experiments (no legacy fallback after Phase 5).
 */
export function useProviderBookingMobileShell(): boolean {
  const { bundle } = useConfigBundle();
  const dev = process.env.NEXT_PUBLIC_PROVIDER_BOOKING_MOBILE_SHELL;
  if (dev === "0") return false;
  if (dev === "1") return true;

  const flag = bundle?.flags?.["provider_booking_mobile_shell"];
  if (flag !== undefined) return flag.enabled;

  return true;
}
