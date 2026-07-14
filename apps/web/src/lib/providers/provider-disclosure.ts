/**
 * Tiered disclosure for provider profile contact/location data.
 *
 * - anon: marketing-safe fields only (no description, hours, street address, geo, phone, socials)
 * - authed: logged-in customer — description, hours, website, socials; area only for locations
 * - booked: customer with a confirmed booking — full address, geo, location phone
 */
import type { NextRequest } from "next/server";
import type { PublicProviderDetail, ProviderLocation } from "@/types/beautonomi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { optionalAuthInApi } from "@/lib/supabase/api-helpers";

export type ViewerTier = "anon" | "authed" | "booked";

/** Booking statuses that unlock Tier C (confirmed / in-flight / completed visit). */
export const DISCLOSURE_BOOKED_STATUSES = [
  "confirmed",
  "in_progress",
  "completed",
  "waiting",
  "checked_in",
] as const;

type LocationLike = Partial<ProviderLocation> & {
  id: string;
  name?: string;
  city?: string;
  state?: string | null;
  country?: string;
  location_type?: "salon" | "base";
  is_primary?: boolean;
  is_active?: boolean;
  provider_id?: string;
  created_at?: string;
  updated_at?: string;
};

function stripLocationSensitiveFields(loc: LocationLike): LocationLike {
  const { address_line1, address_line2, postal_code, latitude, longitude, phone, working_hours, ...rest } =
    loc;
  void address_line1;
  void address_line2;
  void postal_code;
  void latitude;
  void longitude;
  void phone;
  void working_hours;
  return { ...rest };
}

export function redactLocationsForTier<T extends LocationLike>(
  locations: T[],
  tier: ViewerTier,
): T[] {
  if (tier === "booked") return locations;

  return locations.map((loc) => {
    const base = stripLocationSensitiveFields(loc) as T;
    if (tier === "authed") {
      return { ...base, working_hours: loc.working_hours } as T;
    }
    return base;
  });
}

export function redactProviderDetailForTier<T extends PublicProviderDetail>(
  detail: T,
  tier: ViewerTier,
): T & { disclosure_tier: ViewerTier } {
  const locations = redactLocationsForTier(detail.locations ?? [], tier);

  if (tier === "anon") {
    return {
      ...detail,
      description: "",
      website: null,
      social_media_links: {},
      locations,
      disclosure_tier: tier,
    };
  }

  if (tier === "authed") {
    return {
      ...detail,
      locations,
      disclosure_tier: tier,
    };
  }

  return {
    ...detail,
    locations,
    disclosure_tier: tier,
  };
}

export async function customerHasBookedProvider(
  customerId: string,
  providerId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("customer_id", customerId)
    .eq("provider_id", providerId)
    .in("status", [...DISCLOSURE_BOOKED_STATUSES])
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("customerHasBookedProvider:", error);
    return false;
  }
  return Boolean(data);
}

/**
 * Resolve viewer tier from an incoming API request.
 * Returns `anon` when unauthenticated.
 */
export async function resolveViewerTier(
  providerId: string,
  request?: NextRequest | Request,
): Promise<{ tier: ViewerTier; userId: string | null }> {
  const auth = await optionalAuthInApi(
    ["customer", "provider_owner", "provider_staff", "superadmin"],
    request,
  );
  const userId = auth.user?.id ?? null;
  if (!userId) return { tier: "anon", userId: null };

  const booked = await customerHasBookedProvider(userId, providerId);
  return { tier: booked ? "booked" : "authed", userId };
}

/** Contact payload returned by GET /api/providers/[slug]/contact */
export type ProviderContactDisclosure = {
  disclosure_tier: ViewerTier;
  description: string | null;
  website: string | null;
  social_media_links: PublicProviderDetail["social_media_links"];
  operating_hours?: unknown;
  locations: ProviderLocation[];
};

export function toContactDisclosure(
  detail: PublicProviderDetail,
  tier: ViewerTier,
): ProviderContactDisclosure {
  const redacted = redactProviderDetailForTier(detail, tier);
  const primary =
    redacted.locations.find((l) => l.is_primary) ?? redacted.locations[0];
  return {
    disclosure_tier: tier,
    description: redacted.description ?? null,
    website: redacted.website ?? null,
    social_media_links: redacted.social_media_links ?? {},
    operating_hours: primary?.working_hours,
    locations: redacted.locations,
  };
}
