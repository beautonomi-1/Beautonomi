import type { SupabaseClient } from "@supabase/supabase-js";
import { isPubliclyBookableStaff } from "@/lib/provider/staff-public-bookable";

/**
 * Express links may preselect staff; only publicly bookable active members are allowed.
 */
export async function validateExpressLinkStaffIds(
  supabase: SupabaseClient,
  providerId: string,
  staffIds: string[],
  providerTimeZone?: string | null,
): Promise<string | null> {
  const unique = [...new Set(staffIds.filter(Boolean))];
  if (unique.length === 0) return null;

  const { data: rows, error } = await supabase
    .from("provider_staff")
    .select("id, is_active, is_service_provider, enable_in_online_booking, bookable_from")
    .eq("provider_id", providerId)
    .in("id", unique)
    .is("deleted_at", null);

  if (error) throw error;

  const found = new Set((rows ?? []).map((r: { id: string }) => r.id));
  if (found.size !== unique.length) {
    return "One or more selected team members were not found.";
  }

  for (const row of rows ?? []) {
    if (!isPubliclyBookableStaff(row, providerTimeZone)) {
      return "One or more selected team members are not available for online booking.";
    }
  }

  return null;
}
