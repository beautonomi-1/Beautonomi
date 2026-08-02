/**
 * Phase 3 adapter: read device-reported age range signals (e.g. Play/App Store APIs).
 * When a signal is available, POST it to /api/me/age-signal (non-blocking).
 */
import { api } from "@/lib/api-client";

export type DeviceAgeRange = {
  lower_bound: number | null;
  upper_bound: number | null;
  source: string;
};

export function getDeviceAgeRange(): DeviceAgeRange | null {
  // Platform APIs (Declared Age Range on iOS 26+, Play Age Signals) wired when SDK supports them.
  return null;
}

export function syncDeviceAgeSignalIfAvailable(): void {
  const range = getDeviceAgeRange();
  if (!range || (range.lower_bound == null && range.upper_bound == null)) return;
  void api
    .post("/api/me/age-signal", {
      lower_bound: range.lower_bound ?? undefined,
      upper_bound: range.upper_bound ?? undefined,
      source: range.source,
    })
    .catch(() => {});
}
