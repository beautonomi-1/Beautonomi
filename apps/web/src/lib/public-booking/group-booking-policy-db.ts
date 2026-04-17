/**
 * Load group-booking policy fields from DB — same columns as
 * GET /api/public/providers/[slug]/group-booking-settings and validateBooking.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type GroupBookingPolicyFieldsFromDb = {
  onlineGroupBookingEnabled: boolean;
  maxGroupSize: number;
  excludedServiceIds: string[];
  enabledLocationIds: string[] | null;
};

/**
 * Single source of truth for provider columns used in
 * {@link evaluateGroupBookingPolicy}.
 */
export async function fetchGroupBookingPolicyFieldsFromDb(
  supabase: SupabaseClient,
  providerId: string
): Promise<GroupBookingPolicyFieldsFromDb> {
  const { data: provGroup } = await supabase
    .from("providers")
    .select(
      "online_group_booking_enabled, max_group_size, group_booking_excluded_services, group_booking_locations"
    )
    .eq("id", providerId)
    .maybeSingle();

  const excluded = (provGroup as { group_booking_excluded_services?: string[] } | null)
    ?.group_booking_excluded_services;
  const locs = (provGroup as { group_booking_locations?: string[] } | null)
    ?.group_booking_locations;

  return {
    onlineGroupBookingEnabled: Boolean(
      (provGroup as { online_group_booking_enabled?: boolean } | null)?.online_group_booking_enabled
    ),
    maxGroupSize: Number((provGroup as { max_group_size?: number | null } | null)?.max_group_size ?? 10) || 10,
    excludedServiceIds: Array.isArray(excluded) ? excluded.filter(Boolean) : [],
    enabledLocationIds: Array.isArray(locs) ? locs.filter(Boolean) : null,
  };
}
