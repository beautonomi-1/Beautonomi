/**
 * Supabase Realtime WebSocket Integration
 * Uses Supabase Realtime for WebSocket functionality
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type RealtimeEventType =
  | 'booking_created'
  | 'booking_updated'
  | 'booking_cancelled'
  | 'booking_services_changed' // was availability_changed - fires on booking_services table changes
  | 'availability_changed' // alias for backward compat; use booking_services_changed
  | 'waitlist_match'
  | 'appointment_status_changed';

export interface RealtimeEvent {
  type: RealtimeEventType;
  data: any;
  timestamp: string;
}

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

/**
 * Subscribe to booking changes via Supabase Realtime
 */
export function subscribeToBookings(
  supabase: SupabaseClient,
  providerId: string,
  handler: RealtimeEventHandler
): () => void {
  const channel = supabase
    .channel(`bookings:${providerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `provider_id=eq.${providerId}`,
      },
      (payload) => {
        const eventType: RealtimeEventType = 
          payload.eventType === 'INSERT' ? 'booking_created' :
          payload.eventType === 'UPDATE' ? 'booking_updated' :
          payload.eventType === 'DELETE' ? 'booking_cancelled' :
          'booking_updated';

        handler({
          type: eventType,
          data: payload.new || payload.old,
          timestamp: new Date().toISOString(),
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'booking_services',
        filter: `bookings!inner(provider_id=eq.${providerId})`,
      },
      (payload) => {
        handler({
          type: 'booking_services_changed',
          data: payload.new || payload.old,
          timestamp: new Date().toISOString(),
        });
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
    }
  };
}

/**
 * Subscribe to booking changes for a customer (customer_id filter)
 * Used by customer portal bookings page for realtime updates
 */
export function subscribeToCustomerBookings(
  supabase: SupabaseClient,
  customerId: string,
  handler: RealtimeEventHandler
): () => void {
  const channel = supabase
    .channel(`customer-bookings:${customerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `customer_id=eq.${customerId}`,
      },
      (payload) => {
        const eventType: RealtimeEventType =
          payload.eventType === 'INSERT'
            ? 'booking_created'
            : payload.eventType === 'UPDATE'
            ? 'booking_updated'
            : payload.eventType === 'DELETE'
            ? 'booking_cancelled'
            : 'booking_updated';

        handler({
          type: eventType,
          data: payload.new || payload.old,
          timestamp: new Date().toISOString(),
        });
      }
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
    }
  };
}

/**
 * Subscribe to waitlist matches
 */
export function subscribeToWaitlist(
  supabase: SupabaseClient,
  providerId: string,
  handler: RealtimeEventHandler
): () => void {
  const channel = supabase
    .channel(`waitlist:${providerId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'waitlist_entries',
        filter: `provider_id=eq.${providerId}`,
      },
      (payload) => {
        if (payload.new?.status === 'notified') {
          handler({
            type: 'waitlist_match',
            data: payload.new,
            timestamp: new Date().toISOString(),
          });
        }
      }
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // Ignore when channel is still connecting (e.g. React Strict Mode unmount)
    }
  };
}

// Note: React hook should be in hooks/useSupabaseRealtime.ts
// This file is for core Realtime functions only
