import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type WorkingHoursDay = {
  is_open?: boolean;
  open_time?: string;
  close_time?: string;
  open?: string;
  close?: string;
  closed?: boolean;
};

export type StaffScheduleSeedRow = {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  is_working: boolean;
};

/** Explicit location working_hours keys only — missing days get no row. */
export function staffScheduleRowsFromLocationWorkingHours(
  workingHours: unknown,
): StaffScheduleSeedRow[] {
  if (!workingHours || typeof workingHours !== "object" || Array.isArray(workingHours)) {
    return [];
  }
  const wh = workingHours as Record<string, WorkingHoursDay>;
  const rows: StaffScheduleSeedRow[] = [];

  DAY_KEYS.forEach((dayKey, dayIndex) => {
    const day = wh[dayKey];
    if (day === undefined) return;

    const isClosed = day.is_open === false || day.closed === true;
    if (isClosed) {
      rows.push({ day_of_week: dayIndex, start_time: null, end_time: null, is_working: false });
      return;
    }

    const openTime = (day.open_time || day.open || "09:00").trim().slice(0, 5);
    const closeTime = (day.close_time || day.close || "17:00").trim().slice(0, 5);
    rows.push({
      day_of_week: dayIndex,
      start_time: openTime,
      end_time: closeTime,
      is_working: true,
    });
  });

  return rows;
}

export async function copyStaffScheduleRows(
  supabase: SupabaseClient,
  fromStaffId: string,
): Promise<StaffScheduleSeedRow[]> {
  const { data } = await supabase
    .from("staff_schedules")
    .select("day_of_week, start_time, end_time, is_working")
    .eq("staff_id", fromStaffId);

  return (data ?? []).map((r: {
    day_of_week: number;
    start_time: string | null;
    end_time: string | null;
    is_working: boolean | null;
  }) => ({
    day_of_week: r.day_of_week,
    start_time: r.start_time ? String(r.start_time).slice(0, 5) : null,
    end_time: r.end_time ? String(r.end_time).slice(0, 5) : null,
    is_working: r.is_working !== false,
  }));
}

export async function upsertStaffScheduleRows(
  supabase: SupabaseClient,
  staffId: string,
  rows: StaffScheduleSeedRow[],
): Promise<void> {
  if (rows.length === 0) return;

  for (const row of rows) {
    const { data: existing } = await supabase
      .from("staff_schedules")
      .select("id")
      .eq("staff_id", staffId)
      .eq("day_of_week", row.day_of_week)
      .maybeSingle();

    const payload = {
      staff_id: staffId,
      day_of_week: row.day_of_week,
      start_time: row.is_working ? row.start_time : null,
      end_time: row.is_working ? row.end_time : null,
      is_working: row.is_working,
    };

    if (existing?.id) {
      await supabase.from("staff_schedules").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("staff_schedules").insert(payload);
    }
  }
}

export type HoursSourceInput =
  | { type: "location"; locationId: string }
  | { type: "staff"; staffId: string };

export async function seedStaffSchedulesOnCreate(
  supabase: SupabaseClient,
  providerId: string,
  newStaffId: string,
  primaryLocationId: string | null,
  hoursSource: HoursSourceInput | null | undefined,
): Promise<{ seeded: boolean }> {
  if (!hoursSource) return { seeded: false };

  let rows: StaffScheduleSeedRow[] = [];

  if (hoursSource.type === "staff") {
    rows = await copyStaffScheduleRows(supabase, hoursSource.staffId);
    if (rows.length === 0 && primaryLocationId) {
      const { data: loc } = await supabase
        .from("provider_locations")
        .select("working_hours")
        .eq("id", primaryLocationId)
        .eq("provider_id", providerId)
        .maybeSingle();
      rows = staffScheduleRowsFromLocationWorkingHours(
        (loc as { working_hours?: unknown } | null)?.working_hours,
      );
    }
  } else {
    const locId = hoursSource.locationId || primaryLocationId;
    if (!locId) return { seeded: false };
    const { data: loc } = await supabase
      .from("provider_locations")
      .select("working_hours")
      .eq("id", locId)
      .eq("provider_id", providerId)
      .maybeSingle();
    rows = staffScheduleRowsFromLocationWorkingHours(
      (loc as { working_hours?: unknown } | null)?.working_hours,
    );
  }

  await upsertStaffScheduleRows(supabase, newStaffId, rows);
  return { seeded: rows.length > 0 };
}
