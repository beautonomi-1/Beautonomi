import { useEffect, useMemo, useRef } from "react";
import { isSameDay } from "date-fns";
import { useLocalSearchParams } from "expo-router";
import { parseCalendarDateParam, calendarDateKey } from "@/features/calendar/utils/timezone";

export function useCalendarDeepLinks(providerTimezone: string | null | undefined) {
  const searchParams = useLocalSearchParams<{ date?: string; booking_id?: string }>();
  const deepLinkDate = useMemo(() => {
    if (typeof searchParams.date !== "string" || !searchParams.date) return null;
    return parseCalendarDateParam(searchParams.date, providerTimezone ?? null);
  }, [searchParams.date, providerTimezone]);

  const handledBookingDeepLinkRef = useRef<string | null>(null);
  const initialBookingId =
    typeof searchParams.booking_id === "string" && searchParams.booking_id ? searchParams.booking_id : null;

  useEffect(() => {
    const bookingId = typeof searchParams.booking_id === "string" ? searchParams.booking_id : "";
    if (bookingId && handledBookingDeepLinkRef.current !== bookingId) {
      handledBookingDeepLinkRef.current = bookingId;
    }
  }, [searchParams.booking_id]);

  return {
    deepLinkDate,
    highlightedBookingId: initialBookingId,
    isSameDayFn: (a: Date, b: Date) => isSameDay(a, b),
    calendarDateKey,
  };
}
