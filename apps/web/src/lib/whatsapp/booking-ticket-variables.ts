import type { SupabaseClient } from "@supabase/supabase-js";
import { mintGuestPortalTokenForBooking } from "@/lib/portal/guest-booking-link-delivery";

export async function buildPortalAndMapsUrlsForBooking(params: {
  supabaseAdmin: SupabaseClient;
  bookingId: string;
  scheduledAt: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{ portal_url: string; maps_url: string }> {
  const { portalUrl } = await mintGuestPortalTokenForBooking(
    params.supabaseAdmin,
    params.bookingId,
    params.scheduledAt,
  );
  let maps_url = portalUrl;
  const lat = params.latitude != null ? Number(params.latitude) : NaN;
  const lng = params.longitude != null ? Number(params.longitude) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    maps_url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return { portal_url: portalUrl, maps_url };
}
