import { fetcher } from "@/lib/http/fetcher";
import { hasValidAddressCoords, type ZoneSuggestStatus } from "./onboarding-helpers";

export type SuggestZonesResult = {
  status: ZoneSuggestStatus;
  zoneIds: string[];
  suggestedZones: Array<{ id: string; name?: string }>;
};

export async function suggestZonesForOnboardingAddress(address: {
  line1?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}): Promise<SuggestZonesResult> {
  if (!hasValidAddressCoords(address.latitude, address.longitude)) {
    return { status: "no_coords", zoneIds: [], suggestedZones: [] };
  }

  try {
    const response = await fetcher.post<{ data: { suggested_zones: Array<{ id: string }> } }>(
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
    const suggestedZones = response.data?.suggested_zones || [];
    if (suggestedZones.length > 0) {
      return {
        status: "matched",
        zoneIds: suggestedZones.map((z) => z.id),
        suggestedZones,
      };
    }
    return { status: "none", zoneIds: [], suggestedZones: [] };
  } catch {
    return { status: "error", zoneIds: [], suggestedZones: [] };
  }
}
