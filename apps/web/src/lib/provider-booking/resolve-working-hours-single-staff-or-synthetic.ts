import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSyntheticProviderStaffId } from "@beautonomi/utils";

/** Matches `working_hours` JSON shape for one weekday (provider_staff / provider_locations). */
export type WorkingHoursDayRecord = {
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
  breaks?: { start: string; end: string }[];
};

/**
 * When the portal passes a single `staff_ids` value, use that staff member's hours;
 * if it is the synthetic solo id `provider-{uuid}` matching this provider, fall back to primary location hours.
 */
export async function resolveWorkingHoursDayForSingleStaffOrSyntheticSolo(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  staffIdParam: string,
  dayKey: string
): Promise<WorkingHoursDayRecord | null | undefined> {
  const syntheticPid = parseSyntheticProviderStaffId(staffIdParam);
  const { data: staff } = await supabaseAdmin
    .from("provider_staff")
    .select("id, working_hours, work_hours_enabled")
    .eq("id", staffIdParam)
    .eq("provider_id", providerId)
    .maybeSingle();

  const staffWorkHoursEnabled = (staff as any)?.work_hours_enabled ?? false;
  const whFromStaff = (staff?.working_hours as Record<string, WorkingHoursDayRecord> | null)?.[dayKey];
  let wh: WorkingHoursDayRecord | null | undefined = whFromStaff;

  // Fall back to location hours when:
  // - staff has no entry for this day
  // - staff's work_hours_enabled is false (meaning "use location hours")
  // - synthetic provider staff ID
  const shouldFallbackToLocation =
    !wh || !staffWorkHoursEnabled || syntheticPid === providerId;

  if (shouldFallbackToLocation) {
    const { data: locs } = await supabaseAdmin
      .from("provider_locations")
      .select("working_hours")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    const loc = locs?.[0];
    const locWh = (loc?.working_hours as Record<string, WorkingHoursDayRecord> | null)?.[dayKey] ?? null;
    if (locWh) wh = locWh;
  }

  return wh;
}
