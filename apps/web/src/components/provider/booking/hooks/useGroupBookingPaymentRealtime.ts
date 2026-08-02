"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Debounced refresh when child bookings for a group session change (payments, refunds).
 */
export function useGroupBookingPaymentRealtime(
  groupBookingId: string | undefined,
  enabled: boolean,
  onPaymentChange: () => void | Promise<void>,
): void {
  const onChangeRef = useRef(onPaymentChange);
  useEffect(() => {
    onChangeRef.current = onPaymentChange;
  }, [onPaymentChange]);

  useEffect(() => {
    if (!enabled || !groupBookingId) return;
    const supabase = getSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void onChangeRef.current();
      }, 400);
    };

    const channel = supabase
      .channel(`group-booking-payment:${groupBookingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `group_booking_id=eq.${groupBookingId}`,
        },
        () => scheduleRefresh(),
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, groupBookingId]);
}
