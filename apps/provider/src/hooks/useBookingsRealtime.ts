import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";

/**
 * Debounced bookings + overlay refresh when bookings, line items, time blocks,
 * or availability blocks change. Uses {@link nextRealtimeTopic} so remounts never
 * reuse a Supabase channel topic still winding down from cleanup.
 */
export function useBookingsRealtime(
  providerId: string | undefined,
  isFocused: boolean,
  refreshBookings: () => void | Promise<void>,
  refreshOverlays?: () => void | Promise<void>,
  onBookingInsert?: () => void,
): void {
  const refreshRef = useRef(refreshBookings);
  const refreshOverlaysRef = useRef(refreshOverlays);
  const onInsertRef = useRef(onBookingInsert);
  useEffect(() => {
    refreshRef.current = refreshBookings;
  }, [refreshBookings]);
  useEffect(() => {
    refreshOverlaysRef.current = refreshOverlays;
  }, [refreshOverlays]);
  useEffect(() => {
    onInsertRef.current = onBookingInsert;
  }, [onBookingInsert]);

  useEffect(() => {
    if (!isFocused || !providerId) return;
    let bookingsTimer: ReturnType<typeof setTimeout> | null = null;
    let overlaysTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleBookingsRefresh = () => {
      if (bookingsTimer) return;
      bookingsTimer = setTimeout(() => {
        bookingsTimer = null;
        void refreshRef.current();
      }, 400);
    };

    const scheduleOverlayRefresh = () => {
      if (!refreshOverlaysRef.current || overlaysTimer) return;
      overlaysTimer = setTimeout(() => {
        overlaysTimer = null;
        void refreshOverlaysRef.current?.();
      }, 700);
    };

    const topic = nextRealtimeTopic(`bookings-realtime:${providerId}`);
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${providerId}`,
        },
        (payload: { eventType?: string }) => {
          if (payload.eventType === "INSERT") {
            onInsertRef.current?.();
          }
          scheduleBookingsRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "time_blocks",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "availability_blocks",
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .subscribe();

    return () => {
      if (bookingsTimer) clearTimeout(bookingsTimer);
      if (overlaysTimer) clearTimeout(overlaysTimer);
      supabase.removeChannel(channel);
    };
  }, [isFocused, providerId]);
}
