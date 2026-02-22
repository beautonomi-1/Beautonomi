/**
 * Group Booking Utilities
 * Functions for managing group bookings and linking individual bookings
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface GroupBooking {
  id: string;
  provider_id: string;
  primary_contact_booking_id: string | null;
  ref_number: string;
  scheduled_at: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface BookingParticipant {
  id: string;
  booking_id: string;
  group_booking_id: string;
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  is_primary_contact: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Create a group booking and link individual bookings
 */
export async function createGroupBooking(
  supabase: SupabaseClient,
  providerId: string,
  primaryBookingId: string,
  bookingIds: string[],
  participants: Array<{
    booking_id: string;
    participant_name: string;
    participant_email?: string;
    participant_phone?: string;
    is_primary_contact?: boolean;
  }>
): Promise<GroupBooking> {
  // Get scheduled_at from primary booking
  const { data: primaryBooking, error: bookingError } = await supabase
    .from('bookings')
    .select('scheduled_at')
    .eq('id', primaryBookingId)
    .single();

  if (bookingError || !primaryBooking) {
    throw new Error('Primary booking not found');
  }

  // Generate reference number
  const { data: refNumber, error: refError } = await supabase.rpc('generate_group_booking_ref');

  if (refError) {
    // Fallback if RPC doesn't exist
    const fallbackRef = `GB-${Date.now().toString().slice(-10)}`;
    
    // Create group booking
    const { data: groupBooking, error: createError } = await supabase
      .from('group_bookings')
      .insert({
        provider_id: providerId,
        primary_contact_booking_id: primaryBookingId,
        ref_number: fallbackRef,
        scheduled_at: primaryBooking.scheduled_at,
        status: 'confirmed',
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    // Link participants
    await linkBookingsToGroup(supabase, groupBooking.id, participants);

    return groupBooking as GroupBooking;
  }

  // Create group booking with generated ref
  const { data: groupBooking, error: createError } = await supabase
    .from('group_bookings')
    .insert({
      provider_id: providerId,
      primary_contact_booking_id: primaryBookingId,
      ref_number: refNumber as string,
      scheduled_at: primaryBooking.scheduled_at,
      status: 'confirmed',
    })
    .select()
    .single();

  if (createError) {
    throw createError;
  }

  // Link participants
  await linkBookingsToGroup(supabase, groupBooking.id, participants);

  return groupBooking as GroupBooking;
}

/**
 * Link bookings to a group booking
 */
export async function linkBookingsToGroup(
  supabase: SupabaseClient,
  groupBookingId: string,
  participants: Array<{
    booking_id: string;
    participant_name: string;
    participant_email?: string;
    participant_phone?: string;
    is_primary_contact?: boolean;
  }>
): Promise<void> {
  const participantRecords = participants.map((p) => ({
    booking_id: p.booking_id,
    group_booking_id: groupBookingId,
    participant_name: p.participant_name,
    participant_email: p.participant_email || null,
    participant_phone: p.participant_phone || null,
    is_primary_contact: p.is_primary_contact || false,
  }));

  const { error } = await supabase
    .from('booking_participants')
    .insert(participantRecords);

  if (error) {
    throw error;
  }
}

/**
 * Get group booking with all linked bookings
 */
export async function getGroupBooking(
  supabase: SupabaseClient,
  groupBookingId: string
): Promise<GroupBooking & { bookings: any[]; participants: BookingParticipant[] } | null> {
  const { data: groupBooking, error } = await supabase
    .from('group_bookings')
    .select(`
      *,
      booking_participants (
        *,
        bookings (*)
      )
    `)
    .eq('id', groupBookingId)
    .single();

  if (error || !groupBooking) {
    return null;
  }

  const participants = (groupBooking.booking_participants || []) as BookingParticipant[];
  const bookings = participants.map((p: any) => p.bookings).filter(Boolean);

  return {
    ...(groupBooking as GroupBooking),
    bookings,
    participants,
  };
}

/**
 * Check if user is primary contact for a group booking
 */
export async function isPrimaryContact(
  supabase: SupabaseClient,
  userId: string,
  groupBookingId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('group_bookings')
    .select(`
      primary_contact_booking_id,
      bookings!primary_contact_booking_id (
        customer_id
      )
    `)
    .eq('id', groupBookingId)
    .single();

  if (error || !data) {
    return false;
  }

  const primaryBooking = data.bookings as any;
  return primaryBooking?.customer_id === userId;
}

/**
 * Reschedule entire group booking
 * Only primary contact can do this
 */
export async function rescheduleGroupBooking(
  supabase: SupabaseClient,
  groupBookingId: string,
  newScheduledAt: Date
): Promise<void> {
  // Get all bookings in the group
  const { data: participants, error: participantsError } = await supabase
    .from('booking_participants')
    .select('booking_id, bookings!inner(scheduled_at, booking_services(*))')
    .eq('group_booking_id', groupBookingId);

  if (participantsError || !participants) {
    throw new Error('Failed to load group booking participants');
  }

  // Calculate time offset from original scheduled time
  const groupBooking = await getGroupBooking(supabase, groupBookingId);
  if (!groupBooking) {
    throw new Error('Group booking not found');
  }

  const originalScheduledAt = new Date(groupBooking.scheduled_at);
  const timeOffset = newScheduledAt.getTime() - originalScheduledAt.getTime();

  // Update each booking's scheduled_at
  for (const participant of participants) {
    const booking = (participant as any).bookings;
    if (!booking) continue;

    const originalBookingTime = new Date(booking.scheduled_at);
    const newBookingTime = new Date(originalBookingTime.getTime() + timeOffset);

    // Update booking
    await supabase
      .from('bookings')
      .update({
        scheduled_at: newBookingTime.toISOString(),
      })
      .eq('id', booking.id);

    // Update booking_services
    const services = booking.booking_services || [];
    for (const service of services) {
      const originalStart = new Date(service.scheduled_start_at);
      const originalEnd = new Date(service.scheduled_end_at);
      const duration = originalEnd.getTime() - originalStart.getTime();

      const newStart = new Date(originalStart.getTime() + timeOffset);
      const newEnd = new Date(newStart.getTime() + duration);

      await supabase
        .from('booking_services')
        .update({
          scheduled_start_at: newStart.toISOString(),
          scheduled_end_at: newEnd.toISOString(),
        })
        .eq('id', service.id);
    }
  }

  // Update group booking scheduled_at
  await supabase
    .from('group_bookings')
    .update({
      scheduled_at: newScheduledAt.toISOString(),
    })
    .eq('id', groupBookingId);
}
