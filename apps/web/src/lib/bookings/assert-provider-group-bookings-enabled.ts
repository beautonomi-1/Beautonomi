import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertProviderStaffGroupBookingsEnabled(
  supabase: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("providers")
    .select("group_booking_enabled")
    .eq("id", providerId)
    .maybeSingle();
  if (error) {
    console.error("[assertProviderStaffGroupBookingsEnabled]", error);
    return false;
  }
  return Boolean((data as { group_booking_enabled?: boolean } | null)?.group_booking_enabled);
}
