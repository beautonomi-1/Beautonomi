import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import type { AvailabilitySlot } from "@/types/beautonomi";
import {
  PUBLIC_BOOKING_MAX_ADVANCE_DAYS,
  PUBLIC_BOOKING_MIN_NOTICE_MINUTES,
} from "@/lib/provider-booking/public-booking-slot-policy";

export type EffectiveOnlineBookingWindows = {
  minNoticeMinutes: number;
  maxAdvanceDays: number;
};

export async function loadEffectiveOnlineBookingWindows(
  supabase: SupabaseClient,
  providerId: string,
): Promise<EffectiveOnlineBookingWindows> {
  const { data: obSettings } = await supabase
    .from("provider_online_booking_settings")
    .select("min_notice_minutes, max_advance_days")
    .eq("provider_id", providerId)
    .maybeSingle();

  const rawNotice = obSettings?.min_notice_minutes;
  const minNotice =
    typeof rawNotice === "number"
      ? rawNotice
      : typeof rawNotice === "string"
        ? parseInt(rawNotice, 10)
        : PUBLIC_BOOKING_MIN_NOTICE_MINUTES;
  const effectiveMinNotice =
    Number.isFinite(minNotice) && minNotice >= 0 ? minNotice : PUBLIC_BOOKING_MIN_NOTICE_MINUTES;

  const rawAdvance = (obSettings as { max_advance_days?: number | string | null } | null)
    ?.max_advance_days;
  const maxAdvance =
    typeof rawAdvance === "number"
      ? rawAdvance
      : typeof rawAdvance === "string"
        ? parseInt(rawAdvance, 10)
        : null;
  const effectiveMaxAdvance =
    typeof maxAdvance === "number" && Number.isFinite(maxAdvance) && maxAdvance >= 1
      ? Math.floor(maxAdvance)
      : PUBLIC_BOOKING_MAX_ADVANCE_DAYS;

  return { minNoticeMinutes: effectiveMinNotice, maxAdvanceDays: effectiveMaxAdvance };
}

/** Calendar-day offset from provider business today to `dateStr` (YYYY-MM-DD). */
export function daysFromTodayInProviderZone(
  dateStr: string,
  providerTimeZone: string | null,
): number {
  const now = new Date();
  const todayYmd = providerTimeZone
    ? formatInTimeZone(now, providerTimeZone, "yyyy-MM-dd")
    : now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{4}-\d{2}-\d{2}$/.test(todayYmd)) {
    return NaN;
  }
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const [ry, rm, rd] = dateStr.split("-").map(Number);
  const tUtc = Date.UTC(ty, tm - 1, td);
  const rUtc = Date.UTC(ry, rm - 1, rd);
  return Math.round((rUtc - tUtc) / (24 * 60 * 60 * 1000));
}

export function isDateBeyondMaxAdvance(
  dateStr: string,
  maxAdvanceDays: number,
  providerTimeZone: string | null,
): boolean {
  const days = daysFromTodayInProviderZone(dateStr, providerTimeZone);
  return Number.isFinite(days) && days > maxAdvanceDays;
}

export function filterPublicSlotsByMinNotice(
  slots: AvailabilitySlot[],
  minNoticeMinutes: number,
): AvailabilitySlot[] {
  if (!Number.isFinite(minNoticeMinutes) || minNoticeMinutes <= 0) {
    return slots;
  }
  const cutoff = new Date(Date.now() + minNoticeMinutes * 60 * 1000);
  return slots.filter((s) => new Date(s.start) >= cutoff);
}
