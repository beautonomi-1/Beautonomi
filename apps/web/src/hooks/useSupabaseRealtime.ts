/**
 * React hook for Supabase Realtime
 */

import { useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  subscribeToBookings,
  subscribeToCustomerBookings,
  subscribeToWaitlist,
  type RealtimeEventType,
  type RealtimeEventHandler,
} from '@/lib/websocket/supabase-realtime';

export function useSupabaseRealtime(
  supabase: SupabaseClient | null,
  providerId: string | undefined,
  eventType: RealtimeEventType,
  handler: RealtimeEventHandler
) {
  useEffect(() => {
    if (!supabase || !providerId) return;

    let unsubscribe: (() => void) | null = null;

    if (
      eventType === 'booking_created' ||
      eventType === 'booking_updated' ||
      eventType === 'booking_cancelled' ||
      eventType === 'booking_services_changed' ||
      eventType === 'availability_changed'
    ) {
      unsubscribe = subscribeToBookings(supabase, providerId, handler);
    } else if (eventType === 'waitlist_match') {
      unsubscribe = subscribeToWaitlist(supabase, providerId, handler);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [supabase, providerId, eventType, handler]);
}

/**
 * Subscribe to realtime booking updates for a customer's bookings.
 * Use on customer portal bookings page for live status updates.
 */
export function useCustomerBookingsRealtime(
  supabase: SupabaseClient | null,
  customerId: string | undefined,
  handler: RealtimeEventHandler
) {
  useEffect(() => {
    if (!supabase || !customerId) return;

    const unsubscribe = subscribeToCustomerBookings(supabase, customerId, handler);
    return () => unsubscribe();
  }, [supabase, customerId, handler]);
}
