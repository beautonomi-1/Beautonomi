import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { addMinutes } from "date-fns";

const SLOT_START_H = 6;
const SLOT_END_H = 22;
const SLOT_INTERVAL_MIN = 15;

function getSlotTimes(): string[] {
  const slots: string[] = [];
  for (let h = SLOT_START_H; h <= SLOT_END_H; h++) {
    for (let m = 0; m < 60; m += SLOT_INTERVAL_MIN) {
      if (h === SLOT_END_H && m > 0) break;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

/**
 * GET /api/provider/bookings/available-slots?date=YYYY-MM-DD&duration_minutes=60&staff_ids=id1,id2&location_id=...
 * Returns time slot strings (HH:mm) that are available for the given date considering:
 * - Existing bookings (non-cancelled)
 * - Time blocks (breaks, time off)
 * Staff/location filter applied when provided.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const sp = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const dateStr = sp.get("date");
    const durationMinutes = Math.max(15, Math.min(480, parseInt(sp.get("duration_minutes") || "60", 10)));
    const staffIdsParam = sp.get("staff_ids");
    const locationId = sp.get("location_id");

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return handleApiError(new Error("date is required (YYYY-MM-DD)"), "VALIDATION_ERROR", 400);
    }

    const staffIds = staffIdsParam ? staffIdsParam.split(",").filter(Boolean) : [];
    const slotTimes = getSlotTimes();
    const available: string[] = [];

    // Fetch all bookings for that day
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, scheduled_at, booking_services(duration_minutes, staff_id)")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", `${dateStr}T00:00:00`)
      .lte("scheduled_at", `${dateStr}T23:59:59`);
    if (locationId) bookingsQuery = bookingsQuery.eq("location_id", locationId);
    const { data: dayBookings } = await bookingsQuery;

    // Fetch time blocks for that day
    const { data: timeBlocks } = await supabaseAdmin
      .from("time_blocks")
      .select("id, staff_id, date, start_time, end_time, is_active")
      .eq("provider_id", providerId)
      .eq("date", dateStr)
      .eq("is_active", true);

    for (const slot of slotTimes) {
      const startTime = new Date(`${dateStr}T${slot}:00`);
      const endTime = addMinutes(startTime, durationMinutes);
      let blocked = false;

      for (const b of dayBookings || []) {
        const bStart = new Date(b.scheduled_at);
        const bDuration = (b.booking_services || []).reduce((s: number, bs: any) => s + (bs.duration_minutes || 30), 0);
        const bEnd = addMinutes(bStart, bDuration);
        if (startTime < bEnd && endTime > bStart) {
          if (staffIds.length > 0) {
            const bookingStaffIds = (b.booking_services || []).map((bs: any) => bs.staff_id).filter(Boolean);
            if (bookingStaffIds.length === 0 || staffIds.some((sid: string) => bookingStaffIds.includes(sid))) {
              blocked = true;
              break;
            }
          } else {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      for (const block of timeBlocks || []) {
        const startPart = typeof block.start_time === "string" ? block.start_time.slice(0, 5) : "00:00";
        const endPart = typeof block.end_time === "string" ? block.end_time.slice(0, 5) : "23:59";
        const blockStart = new Date(`${block.date}T${startPart}:00`);
        const blockEnd = new Date(`${block.date}T${endPart}:00`);
        if (startTime < blockEnd && endTime > blockStart) {
          if (!block.staff_id || staffIds.length === 0 || staffIds.includes(block.staff_id)) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) available.push(slot);
    }

    return successResponse({ slots: available, date: dateStr });
  } catch (error) {
    return handleApiError(error, "Failed to get available slots");
  }
}
