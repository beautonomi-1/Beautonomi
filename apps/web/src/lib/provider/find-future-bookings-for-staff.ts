import type { SupabaseClient } from "@supabase/supabase-js";

export type FutureStaffBooking = {
  id: string;
  booking_number: string | null;
  scheduled_at: string;
  status: string;
  service_titles: string[];
  location_id?: string | null;
};

/** Weekly working-hours entry (staff_schedules shape). `day_of_week` 0 = Sunday. */
export type WorkingHoursDay = {
  day_of_week: number;
  start_time: string | null; // "HH:MM"
  end_time: string | null; // "HH:MM"
  is_working?: boolean | null;
};

export type OutsideHoursOptions = {
  /** New hours. Days not listed are treated as unchanged (not checked). */
  days: WorkingHoursDay[];
  /** IANA timezone used to place bookings on a weekday/time. Defaults to UTC. */
  timezone?: string;
};

export type FindFutureBookingsOptions = {
  serviceIds?: string[];
  /** When set, only bookings starting before this ISO timestamp. */
  before?: string;
  /** Return only bookings that fall outside the given (new) working hours. */
  outsideHours?: OutsideHoursOptions;
  /** Return only bookings at a location NOT in this list (location unassignment guard). */
  notAtLocationIds?: string[];
};

type LocalTime = { dayOfWeek: number; minutes: number };

function toLocalTime(iso: string, timezone?: string): LocalTime | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(d);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    return { dayOfWeek: dayOfWeek < 0 ? 0 : dayOfWeek, minutes: hour * 60 + minute };
  } catch {
    return { dayOfWeek: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
}

function hhmmToMinutes(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Pure check used by the guards: does a booking start fall outside the new
 * hours for its weekday? Days not present in `days` are not checked.
 */
export function bookingFallsOutsideHours(
  scheduledAtIso: string,
  hours: OutsideHoursOptions,
): boolean {
  const local = toLocalTime(scheduledAtIso, hours.timezone);
  if (!local) return false;
  const day = hours.days.find((d) => d.day_of_week === local.dayOfWeek);
  if (!day) return false;
  if (day.is_working === false) return true;
  const start = hhmmToMinutes(day.start_time);
  const end = hhmmToMinutes(day.end_time);
  if (start == null || end == null) return false;
  return local.minutes < start || local.minutes >= end;
}

/**
 * Future confirmed/pending bookings where the staff member is assigned on at least one line.
 * Supports guards for service unassignment (`serviceIds`), hours changes
 * (`outsideHours`) and location changes (`notAtLocationIds`).
 */
export async function findFutureBookingsForStaff(
  supabase: SupabaseClient,
  providerId: string,
  staffId: string,
  options: FindFutureBookingsOptions = {},
): Promise<FutureStaffBooking[]> {
  const nowIso = options.before ?? new Date().toISOString();

  let serviceQuery = supabase
    .from("booking_services")
    .select("booking_id, offering_id, offerings:offering_id(title)")
    .eq("staff_id", staffId);

  if (options.serviceIds?.length) {
    serviceQuery = serviceQuery.in("offering_id", options.serviceIds);
  }

  const { data: serviceRows, error: svcErr } = await serviceQuery;
  if (svcErr) throw svcErr;

  const bookingIds = [...new Set((serviceRows ?? []).map((r: { booking_id: string }) => r.booking_id))];
  if (bookingIds.length === 0) return [];

  const { data: bookings, error: bookErr } = await supabase
    .from("bookings")
    .select("id, booking_number, scheduled_at, status, location_id")
    .eq("provider_id", providerId)
    .in("id", bookingIds)
    .gte("scheduled_at", nowIso)
    .not("status", "in", '("cancelled","completed","no_show")')
    .order("scheduled_at", { ascending: true });

  if (bookErr) throw bookErr;

  const titlesByBooking = new Map<string, string[]>();
  for (const row of serviceRows ?? []) {
    const bid = (row as { booking_id: string }).booking_id;
    const title = (row as { offerings?: { title?: string } | null }).offerings?.title ?? "Service";
    const list = titlesByBooking.get(bid) ?? [];
    list.push(title);
    titlesByBooking.set(bid, list);
  }

  let result: FutureStaffBooking[] = (bookings ?? []).map((b: any) => ({
    id: b.id,
    booking_number: b.booking_number ?? null,
    scheduled_at: b.scheduled_at,
    status: b.status,
    service_titles: titlesByBooking.get(b.id) ?? [],
    location_id: b.location_id ?? null,
  }));

  if (options.outsideHours) {
    const hours = options.outsideHours;
    result = result.filter((b) => bookingFallsOutsideHours(b.scheduled_at, hours));
  }

  if (options.notAtLocationIds) {
    const keep = new Set(options.notAtLocationIds);
    result = result.filter((b) => b.location_id != null && !keep.has(b.location_id));
  }

  return result;
}

export function futureBookingsConflictResponse(bookings: FutureStaffBooking[]) {
  return {
    error: "Future bookings conflict",
    code: "FUTURE_BOOKINGS_CONFLICT",
    message: `${bookings.length} future booking(s) are assigned to this staff member. Reassign or supply reassign_to to proceed.`,
    affected_bookings: bookings.slice(0, 25),
    count: bookings.length,
  };
}

export type ReassignFutureBookingsResult = {
  bookingIds: string[];
  bookingServiceIds: string[];
};

/**
 * Move every future booking line from one staff member to another. Updates
 * `booking_services.staff_id` and `bookings.staff_id` (where it pointed at the
 * old staff). Returns the touched ids so callers can post earnings reversals
 * (prepaid bookings) and notify the new assignee.
 */
export async function reassignFutureBookingsForStaff(
  supabase: SupabaseClient,
  providerId: string,
  fromStaffId: string,
  toStaffId: string,
  options: { before?: string } = {},
): Promise<ReassignFutureBookingsResult> {
  if (fromStaffId === toStaffId) return { bookingIds: [], bookingServiceIds: [] };

  const future = await findFutureBookingsForStaff(supabase, providerId, fromStaffId, {
    before: options.before,
  });
  const bookingIds = future.map((b) => b.id);
  if (bookingIds.length === 0) return { bookingIds: [], bookingServiceIds: [] };

  const { data: lines, error: linesErr } = await supabase
    .from("booking_services")
    .select("id")
    .eq("staff_id", fromStaffId)
    .in("booking_id", bookingIds);
  if (linesErr) throw linesErr;
  const bookingServiceIds = (lines ?? []).map((l: { id: string }) => l.id);

  if (bookingServiceIds.length > 0) {
    const { error: updErr } = await supabase
      .from("booking_services")
      .update({ staff_id: toStaffId })
      .in("id", bookingServiceIds);
    if (updErr) throw updErr;
  }

  const { error: bookErr } = await supabase
    .from("bookings")
    .update({ staff_id: toStaffId })
    .eq("provider_id", providerId)
    .eq("staff_id", fromStaffId)
    .in("id", bookingIds);
  if (bookErr && (bookErr as { code?: string }).code !== "42703") {
    // 42703 = column does not exist (bookings.staff_id absent on some schemas)
    throw bookErr;
  }

  return { bookingIds, bookingServiceIds };
}
