import { api } from "@/lib/api-client";
import { hasValidAddressCoords } from "./state";
import type { OnboardingAddress, ZoneSuggestStatus } from "./types";

export type SuggestZonesResult = {
  status: ZoneSuggestStatus;
  zoneIds: string[];
};

export async function suggestZonesForOnboardingAddress(
  address: OnboardingAddress | undefined,
): Promise<SuggestZonesResult> {
  if (!address || !hasValidAddressCoords(address.latitude, address.longitude)) {
    return { status: "no_coords", zoneIds: [] };
  }

  try {
    const res = await api.post<{ suggested_zones: Array<{ id: string }> }>(
      "/api/provider/onboarding/suggest-zones",
      {
        address: address.line1 || "",
        latitude: address.latitude,
        longitude: address.longitude,
        city: address.city || "",
        postal_code: address.postal_code || "",
        country: address.country || "",
      },
    );
    const list = res.data?.suggested_zones ?? [];
    if (list.length > 0) {
      return { status: "matched", zoneIds: list.map((z) => z.id) };
    }
    return { status: "none", zoneIds: [] };
  } catch {
    return { status: "error", zoneIds: [] };
  }
}
