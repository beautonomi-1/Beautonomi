import { fetcher } from "@/lib/http/fetcher";
import type { ProviderContactDisclosure } from "@/lib/providers/provider-disclosure";

type ContactApiResponse = {
  data: ProviderContactDisclosure | null;
  error: { message?: string; code?: string } | null;
};

/**
 * Load authenticated provider contact disclosure (Tier B/C).
 * Never cached — tier can change when a booking is confirmed.
 */
export async function fetchProviderContactDisclosure(
  slug: string,
  options?: { lat?: number; lng?: number },
): Promise<ProviderContactDisclosure | null> {
  const params = new URLSearchParams();
  if (options?.lat != null && options?.lng != null) {
    params.set("lat", String(options.lat));
    params.set("lng", String(options.lng));
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  try {
    const res = await fetcher.get<ContactApiResponse>(
      `/api/providers/${encodeURIComponent(slug)}/contact${qs}`,
      { staleTimeMs: 0 },
    );
    return res?.data ?? null;
  } catch {
    return null;
  }
}

/** Salon location subtitle when street address may be redacted. */
export function formatPublicLocationSubtitle(loc: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  if (loc.address_line1?.trim()) {
    return [loc.address_line1, loc.address_line2, loc.city, loc.state, loc.country].filter(Boolean).join(", ");
  }
  const area = [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
  return area || "Service area";
}
