import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { nextRealtimeTopic } from "@/lib/supabase/realtime-topic";

/**
 * Debounced detail refresh when child bookings for a group session change
 * (mark paid, refunds, payment webhooks). Scoped to `group_booking_id` so
 * open group detail stays aligned without manual pull-to-refresh.
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
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void onChangeRef.current();
      }, 400);
    };

    const topic = nextRealtimeTopic(`group-booking-payment:${groupBookingId}`);
    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `group_booking_id=eq.${groupBookingId}`,
        },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, groupBookingId]);
}
