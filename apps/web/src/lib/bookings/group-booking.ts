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
  /** Align with DB migration 518+: lifecycle mirrors single bookings where applicable */
  status:
    | 'pending'
    | 'confirmed'
    | 'booked'
    | 'started'
    | 'cancelled'
    | 'completed';
  created_at: string;
  updated_at: string;
}

export interface BookingParticipant {
  id: string;
  booking_id: string | null;
  group_booking_id: string;
  participant_name: string;
  participant_email: string | null;
  participant_phone: string | null;
  is_primary_contact: boolean;
  price: number | null;
  service_id: string | null;
  service_name: string | null;
  duration_minutes: number | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupParticipantInput {
  /** Nullable: guests created inline do not yet have an individual booking row */
  booking_id: string | null;
  participant_name: string;
  participant_email?: string | null;
  participant_phone?: string | null;
  is_primary_contact?: boolean;
  /** Per-participant service price for receipt line items */
  price?: number | null;
  /** Offering UUID so receipts can show the service name */
  service_id?: string | null;
  service_name?: string | null;
  duration_minutes?: number | null;
  /** Linked customer profile (for analytics / history) */
  customer_id?: string | null;
}

/**
 * Create a group booking and link individual bookings.
 * Rolls back the group row if linking participants fails so callers are never
 * left with an orphaned group that has no participants.
 */
export async function createGroupBooking(
  supabase: SupabaseClient,
  providerId: string,
  primaryBookingId: string,
  bookingIds: string[],
  participants: GroupParticipantInput[]
): Promise<GroupBooking> {
  const { data: primaryBooking, error: bookingError } = await supabase
    .from('bookings')
    .select('scheduled_at, status, location_id, location_type')
    .eq('id', primaryBookingId)
    .single();

  if (bookingError || !primaryBooking) {
    throw new Error('Primary booking not found');
  }

  const primaryStatus = String((primaryBooking as { status?: string }).status ?? '').toLowerCase();
  const initialGroupStatus =
    primaryStatus === 'pending' || primaryStatus === 'pending_payment' ? 'pending' : 'confirmed';
  const primaryLocationId = (primaryBooking as { location_id?: string | null }).location_id ?? null;
  const primaryLocationType =
    (primaryBooking as { location_type?: string | null }).location_type ?? 'at_salon';

  const { data: refNumberRaw } = await supabase.rpc('generate_group_booking_ref');
  const refNumber =
    typeof refNumberRaw === 'string' && refNumberRaw.trim()
      ? refNumberRaw.trim()
      : `GB-${Date.now().toString().slice(-10)}`;

  const { data: groupBooking, error: createError } = await supabase
    .from('group_bookings')
    .insert({
      provider_id: providerId,
      primary_contact_booking_id: primaryBookingId,
      ref_number: refNumber,
      scheduled_at: primaryBooking.scheduled_at,
      status: initialGroupStatus,
      location_id: primaryLocationId,
      location_type: primaryLocationType,
    })
    .select()
    .single();

  if (createError || !groupBooking) {
    throw createError ?? new Error('Failed to create group booking');
  }

  try {
    await linkBookingsToGroup(supabase, groupBooking.id, participants);
  } catch (linkError) {
    // Roll back the orphaned group row before surfacing the error.
    await supabase.from('group_bookings').delete().eq('id', groupBooking.id);
    throw linkError;
  }

  return groupBooking as GroupBooking;
}

/**
 * Link bookings to a group booking
 */
export async function linkBookingsToGroup(
  supabase: SupabaseClient,
  groupBookingId: string,
  participants: GroupParticipantInput[]
): Promise<void> {
  const participantRecords = participants.map((p) => ({
    booking_id: p.booking_id ?? null,
    group_booking_id: groupBookingId,
    participant_name: p.participant_name,
    participant_email: p.participant_email ?? null,
    participant_phone: p.participant_phone ?? null,
    is_primary_contact: p.is_primary_contact ?? false,
    price: typeof p.price === 'number' ? p.price : 0,
    service_id: p.service_id ?? null,
    service_name: p.service_name ?? null,
    duration_minutes: p.duration_minutes ?? null,
    customer_id: p.customer_id ?? null,
  }));

  const { error } = await supabase
    .from('booking_participants')
    .insert(participantRecords);

  if (error) {
    throw error;
  }
}

/**
 * Get group booking with all linked bookings and participants.
 * Uses maybeSingle() so a missing group returns null without logging a
 * Supabase PGRST116 "no rows" error.
 */
export async function getGroupBooking(
  supabase: SupabaseClient,
  groupBookingId: string
): Promise<(GroupBooking & { bookings: any[]; participants: BookingParticipant[] }) | null> {
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
    .maybeSingle();

  if (error || !groupBooking) {
    return null;
  }

  const participants = (groupBooking.booking_participants || []) as BookingParticipant[];
  const bookings = participants
    .map((p: any) => p.bookings)
    .filter(Boolean)
    .flat();

  return {
    ...(groupBooking as GroupBooking),
    bookings,
    participants,
  };
}

/**
 * Check if a user is the primary contact for a group booking.
 * Uses maybeSingle() to avoid PGRST116 errors when the group does not exist.
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
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  const primaryBooking = data.bookings as any;
  return primaryBooking?.customer_id === userId;
}

/**
 * Reschedule an entire group booking, preserving per-booking time offsets.
 *
 * The function:
 *   1. Fetches the current group scheduled_at + all linked child bookings.
 *   2. Computes the delta between old and new group times.
 *   3. Shifts each child booking and its booking_services by that delta.
 *   4. Updates the group_bookings row last.
 *
 * §Group-booking-qa 2026-05: the previous implementation selected
 * `bookings!inner(scheduled_at, booking_services(*))` without `id`, so
 * `booking.id` was always `undefined` and every `.eq('id', undefined)` call
 * was silently a no-op.  Child bookings were never rescheduled — only the
 * group row itself was updated.  Fixed by fetching `id` from the embed and
 * using `participant.booking_id` as an additional safety net.
 */
export async function rescheduleGroupBooking(
  supabase: SupabaseClient,
  groupBookingId: string,
  newScheduledAt: Date
): Promise<void> {
  // Single query: group scheduled_at + all child booking data we need.
  const { data: group, error: groupError } = await supabase
    .from('group_bookings')
    .select(`
      scheduled_at,
      booking_participants (
        booking_id,
        bookings (
          id,
          scheduled_at,
          booking_services (
            id,
            scheduled_start_at,
            scheduled_end_at
          )
        )
      )
    `)
    .eq('id', groupBookingId)
    .maybeSingle();

  if (groupError || !group) {
    throw new Error('Group booking not found');
  }

  const originalScheduledAt = new Date((group as any).scheduled_at);
  const timeOffsetMs = newScheduledAt.getTime() - originalScheduledAt.getTime();
  const now = new Date().toISOString();

  const participants = ((group as any).booking_participants ?? []) as Array<{
    booking_id: string | null;
    bookings: {
      id: string;
      scheduled_at: string;
      booking_services: Array<{
        id: string;
        scheduled_start_at: string;
        scheduled_end_at: string;
      }>;
    } | null;
  }>;

  for (const participant of participants) {
    const booking = participant.bookings;
    // Use the bookings embed id; fall back to booking_id on the participant row.
    const bookingId = booking?.id ?? participant.booking_id;
    if (!bookingId) continue;

    const originalBookingTime = new Date(
      booking?.scheduled_at ?? (group as any).scheduled_at
    );
    const newBookingTime = new Date(originalBookingTime.getTime() + timeOffsetMs);

    await supabase
      .from('bookings')
      .update({ scheduled_at: newBookingTime.toISOString(), updated_at: now })
      .eq('id', bookingId);

    for (const service of booking?.booking_services ?? []) {
      const originalStart = new Date(service.scheduled_start_at);
      const originalEnd = new Date(service.scheduled_end_at);
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const newStart = new Date(originalStart.getTime() + timeOffsetMs);
      const newEnd = new Date(newStart.getTime() + durationMs);

      await supabase
        .from('booking_services')
        .update({
          scheduled_start_at: newStart.toISOString(),
          scheduled_end_at: newEnd.toISOString(),
        })
        .eq('id', service.id);
    }
  }

  await supabase
    .from('group_bookings')
    .update({ scheduled_at: newScheduledAt.toISOString(), updated_at: now })
    .eq('id', groupBookingId);
}

const TERMINAL_CHILD_STATUSES = new Set(['cancelled', 'canceled', 'no_show']);
const PENDING_CHILD_STATUSES = new Set(['pending', 'pending_payment']);

/**
 * Derive the parent group row status from linked child bookings so nav badges,
 * Overview stats, and the bookings list stay aligned.
 */
export async function syncGroupBookingStatusFromChildren(
  supabase: SupabaseClient,
  groupBookingId: string,
): Promise<string | null> {
  const { data: children, error } = await supabase
    .from('bookings')
    .select('status')
    .eq('group_booking_id', groupBookingId);

  if (error) throw error;
  const statuses = (children ?? [])
    .map((row: { status?: string | null }) => String(row.status ?? '').toLowerCase())
    .filter(Boolean);

  if (statuses.length === 0) return null;

  let nextStatus: GroupBooking['status'];
  if (statuses.some((s) => PENDING_CHILD_STATUSES.has(s))) {
    nextStatus = 'pending';
  } else if (statuses.every((s) => TERMINAL_CHILD_STATUSES.has(s) || s === 'cancelled')) {
    nextStatus = 'cancelled';
  } else if (statuses.every((s) => s === 'completed')) {
    nextStatus = 'completed';
  } else if (statuses.some((s) => s === 'started' || s === 'in_progress')) {
    nextStatus = 'started';
  } else {
    nextStatus = 'confirmed';
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('group_bookings')
    .update({ status: nextStatus, updated_at: now })
    .eq('id', groupBookingId);

  if (updateError) throw updateError;
  return nextStatus;
}
