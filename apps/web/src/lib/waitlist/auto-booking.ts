/**
 * Waitlist Auto-Booking
 * Automatically creates bookings for waitlist entries when slots become available
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { WaitlistMatch } from './matching';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Check if provider has auto-booking enabled
 */
export async function isAutoBookingEnabled(
  supabase: SupabaseClient,
  providerId: string
): Promise<boolean> {
  const { data: provider } = await supabase
    .from('providers')
    .select('waitlist_auto_booking_enabled')
    .eq('id', providerId)
    .single();

  return provider?.waitlist_auto_booking_enabled === true;
}

/**
 * Automatically create booking for waitlist entry
 */
export async function createAutoBooking(
  supabase: SupabaseClient,
  match: WaitlistMatch
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  const { entry, availableSlots } = match;

  if (availableSlots.length === 0) {
    return { success: false, error: 'No available slots' };
  }

  // Use the first available slot
  const selectedSlot = availableSlots[0];
  const slotDate = new Date(selectedSlot.date);
  const [hours, minutes] = selectedSlot.time.split(':').map(Number);
  slotDate.setHours(hours, minutes, 0, 0);

  // Get service details
  if (!entry.service_id) {
    return { success: false, error: 'Service ID required for auto-booking' };
  }

  const { data: service } = await supabase
    .from('offerings')
    .select('id, duration_minutes, price, currency, provider_id')
    .eq('id', entry.service_id)
    .single();

  if (!service) {
    return { success: false, error: 'Service not found' };
  }

  // Get staff ID (use entry staff_id or find available staff)
  let staffId = entry.staff_id;
  if (!staffId) {
    const { data: staff } = await supabase
      .from('provider_staff')
      .select('id')
      .eq('provider_id', entry.provider_id)
      .eq('is_active', true)
      .limit(1)
      .single();
    
    if (!staff) {
      return { success: false, error: 'No available staff' };
    }
    staffId = staff.id;
  }

  // Calculate end time
  const durationMinutes = Number(service.duration_minutes) || 60;
  const endTime = new Date(slotDate.getTime() + durationMinutes * 60000);

  // Create booking draft
  const adminSupabase = getSupabaseAdmin();
  
  try {
    // Create booking using the same RPC as regular bookings
    const bookingData = {
      provider_id: entry.provider_id,
      customer_id: entry.customer_id,
      guest_name: entry.customer_name,
      guest_email: entry.customer_email,
      guest_phone: entry.customer_phone,
      location_type: 'at_salon', // Default to salon, could be configurable
      scheduled_at: slotDate.toISOString(),
      status: 'pending', // Will need payment confirmation
      notes: `Auto-booked from waitlist. Original waitlist entry: ${entry.id}`,
    };

    const bookingServicesData = [{
      offering_id: service.id,
      staff_id: staffId,
      duration_minutes: durationMinutes,
      price: Number(service.price),
      currency: service.currency || 'ZAR',
      scheduled_start_at: slotDate.toISOString(),
      scheduled_end_at: endTime.toISOString(),
    }];

    const { data: bookingId, error: bookingError } = await adminSupabase.rpc(
      'create_booking_with_locking',
      {
        p_booking_data: bookingData as any,
        p_booking_services: bookingServicesData as any,
        p_staff_id: staffId,
        p_start_at: slotDate.toISOString(),
        p_end_at: endTime.toISOString(),
      }
    );

    if (bookingError || !bookingId) {
      return { 
        success: false, 
        error: bookingError?.message || 'Failed to create booking' 
      };
    }

    // Update waitlist entry status
    await supabase
      .from('waitlist_entries')
      .update({
        status: 'booked',
        booked_at: new Date().toISOString(),
        booking_id: bookingId,
      })
      .eq('id', entry.id);

    return { success: true, bookingId };
  } catch (error) {
    console.error('Error creating auto-booking:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Process waitlist matches with auto-booking if enabled
 */
export async function processWaitlistMatches(
  supabase: SupabaseClient,
  matches: WaitlistMatch[],
  providerId: string
): Promise<void> {
  const autoBookingEnabled = await isAutoBookingEnabled(supabase, providerId);

  for (const match of matches) {
    if (autoBookingEnabled) {
      // Attempt auto-booking
      const result = await createAutoBooking(supabase, match);
      
      if (result.success) {
        // Booking created successfully, send confirmation notification
        const { notifyWaitlistMatch } = await import('./notifications');
        await notifyWaitlistMatch(supabase, match, undefined);
        
        // Update notification to indicate auto-booking
        await supabase
          .from('waitlist_entries')
          .update({
            notes: `Auto-booked. Booking ID: ${result.bookingId}`,
          })
          .eq('id', match.entry.id);
      } else {
        // Auto-booking failed, send notification for manual booking
        const { notifyWaitlistMatch } = await import('./notifications');
        await notifyWaitlistMatch(supabase, match, undefined);
      }
    } else {
      // Auto-booking disabled, just send notification
      const { notifyWaitlistMatch } = await import('./notifications');
      await notifyWaitlistMatch(supabase, match, undefined);
    }
  }
}
