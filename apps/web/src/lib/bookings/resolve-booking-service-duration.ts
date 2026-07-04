import { getSupabaseAdmin } from "@/lib/supabase/admin";

type BookingServiceDurationRow = {
  duration_minutes?: number | null;
  offerings?: { duration_minutes?: number | null } | null;
};

/**
 * Sum scheduled service minutes for a booking from booking_services rows.
 * Falls back to linked offering duration when the line item has no override.
 */
export async function resolveBookingServiceDurationMinutes(
  bookingId: string,
): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("booking_services")
    .select("duration_minutes, offerings:offerings(duration_minutes)")
    .eq("booking_id", bookingId);

  if (error || !rows?.length) {
    return null;
  }

  let total = 0;
  for (const raw of rows as BookingServiceDurationRow[]) {
    const dur =
      typeof raw.duration_minutes === "number" && raw.duration_minutes > 0
        ? raw.duration_minutes
        : typeof raw.offerings?.duration_minutes === "number" &&
            raw.offerings.duration_minutes > 0
          ? raw.offerings.duration_minutes
          : 60;
    total += dur;
  }

  return total > 0 ? total : null;
}

/** Human-readable duration for notification templates. */
export function formatServiceDurationForNotification(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return hrs === 1 ? "1 hr" : `${hrs} hr`;
  return hrs === 1 ? `1 hr ${mins} min` : `${hrs} hr ${mins} min`;
}

/**
 * Strip a trailing "Estimated duration:" fragment when duration is unknown.
 */
export function finalizeServiceStartedNotificationBody(
  body: string,
  serviceDuration: string,
): string {
  if (serviceDuration.trim()) return body;
  return body
    .replace(/\.\s*Estimated duration:\s*\.?\s*$/i, ".")
    .replace(/\s*Estimated duration:\s*\.?\s*$/i, "")
    .replace(/\.\.+$/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}
