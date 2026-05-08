import { useMemo } from "react";
import { differenceInMinutes } from "date-fns";
import { formatDateKeyInTimeZone } from "@beautonomi/utils";
import { parseApiDateTime, addCalendarDaysToDateKey } from "@/components/calendar/calendar-layout";
import { paymentNeedsAttention } from "@/lib/calendar-payment-label";
import { formatCurrency, formatTimeInZone } from "@/lib/format";
import type { CalendarBooking } from "@/components/calendar/calendar-booking-types";

interface UseProviderCalendarSummaryOptions {
  bookings: CalendarBooking[] | null;
  filteredBookings: CalendarBooking[];
  selectedDate: Date;
  providerTimezone: string | null;
  providerTodayKey: string;
  currency: string;
  waitingRoomCount: number;
}

export function useProviderCalendarSummary({
  bookings,
  filteredBookings,
  selectedDate,
  providerTimezone,
  providerTodayKey,
  currency,
  waitingRoomCount,
}: UseProviderCalendarSummaryOptions) {
  const calendarDateKey = (d: Date) => formatDateKeyInTimeZone(d, providerTimezone);

  const todayBookingCount = useMemo(() => {
    const dayKey = calendarDateKey(selectedDate);
    return filteredBookings.filter((b) => {
      if (b.status === "cancelled") return false;
      const d = parseApiDateTime(b.scheduled_at);
      return d != null && calendarDateKey(d) === dayKey;
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBookings, selectedDate, providerTimezone]);

  const pendingAttentionCount = useMemo(() => {
    if (!bookings) return 0;
    const endExclusive = addCalendarDaysToDateKey(providerTodayKey, 8);
    return bookings.filter((b) => {
      if (b.status === "cancelled" || b.db_status !== "pending") return false;
      const d = parseApiDateTime(b.scheduled_at);
      if (!d) return false;
      const bk = calendarDateKey(d);
      return bk >= providerTodayKey && bk < endExclusive;
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, providerTodayKey, providerTimezone]);

  const urgentPendingCount = useMemo(() => {
    if (!bookings) return 0;
    const now = new Date();
    return bookings.filter((b) => {
      if (b.db_status !== "pending") return false;
      const d = parseApiDateTime(b.scheduled_at);
      if (!d) return false;
      const mins = differenceInMinutes(d, now);
      return mins >= 0 && mins <= 120;
    }).length;
  }, [bookings]);

  const paymentAttentionCount = useMemo(
    () => filteredBookings.filter((b) => b.status !== "cancelled" && paymentNeedsAttention(b)).length,
    [filteredBookings],
  );

  const scheduledValueLabel = useMemo(() => {
    const dayKey = calendarDateKey(selectedDate);
    let sum = 0;
    for (const b of filteredBookings) {
      if (b.status === "cancelled") continue;
      const d = parseApiDateTime(b.scheduled_at);
      if (!d || calendarDateKey(d) !== dayKey) continue;
      sum += Number(b.total_amount ?? 0);
    }
    return sum > 0 ? formatCurrency(sum, currency) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBookings, selectedDate, providerTimezone, currency]);

  const nextUpcomingLabel = useMemo(() => {
    const dayKey = calendarDateKey(selectedDate);
    const now = new Date();
    const candidates = filteredBookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({ b, d: parseApiDateTime(b.scheduled_at) }))
      .filter((x): x is { b: CalendarBooking; d: Date } => {
        return !!x.d && calendarDateKey(x.d) === dayKey && x.d >= now;
      })
      .sort((a, b) => a.d.getTime() - b.d.getTime());
    const first = candidates[0];
    if (!first) return null;
    const name =
      first.b.customers?.full_name?.trim() ||
      first.b.calendar_service_name ||
      "Appointment";
    return `${formatTimeInZone(first.b.scheduled_at, providerTimezone)} · ${name}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBookings, selectedDate, providerTimezone]);

  return {
    todayBookingCount,
    pendingAttentionCount,
    urgentPendingCount,
    paymentAttentionCount,
    scheduledValueLabel,
    nextUpcomingLabel,
    waitingRoomCount,
  };
}
