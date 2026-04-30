import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * Debounced calendar refresh when bookings or operational overlays change.
 *
 * Bookings and overlays are refreshed separately so a burst of booking writes
 * does not force every overlay endpoint to refetch, while external block/hold
 * edits no longer leave the visible schedule stale until pull-to-refresh.
 */
export function useCalendarBookingsRealtime(
  providerId: string | undefined,
  isFocused: boolean,
  refreshBookings: () => void | Promise<void>,
  refreshOverlays?: () => void | Promise<void>,
): void {
  const refreshRef = useRef(refreshBookings);
  const refreshOverlaysRef = useRef(refreshOverlays);
  useEffect(() => {
    refreshRef.current = refreshBookings;
  }, [refreshBookings]);
  useEffect(() => {
    refreshOverlaysRef.current = refreshOverlays;
  }, [refreshOverlays]);

  const realtimeGenRef = useRef(0);

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

    const topic = `calendar-realtime:${providerId}:${++realtimeGenRef.current}`;
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "bookings", filter: `provider_id=eq.${providerId}` },
        () => {
          scheduleBookingsRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "booking_services",
          filter: `bookings!inner(provider_id=eq.${providerId})`,
        },
        () => {
          scheduleBookingsRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "time_blocks", filter: `provider_id=eq.${providerId}` },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "availability_blocks", filter: `provider_id=eq.${providerId}` },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "booking_holds", filter: `provider_id=eq.${providerId}` },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "staff_time_off", filter: `provider_id=eq.${providerId}` },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "staff_days_off", filter: `provider_id=eq.${providerId}` },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "staff_shifts", filter: `provider_id=eq.${providerId}` },
        () => {
          scheduleOverlayRefresh();
        },
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "staff_schedules", filter: `provider_id=eq.${providerId}` },
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
