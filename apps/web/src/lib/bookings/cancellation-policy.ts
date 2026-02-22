/**
 * Cancellation Policy Logic
 * Checks if a booking can be cancelled based on policy rules
 */

export interface CancellationPolicy {
  id: string;
  provider_id: string;
  location_type: 'at_salon' | 'at_home' | null;
  hours_before_cutoff: number;
  grace_window_minutes: number;
  policy_text: string;
  late_cancellation_type: 'no_refund' | 'partial_refund' | 'full_refund';
  is_active: boolean;
}

export interface CancellationCheckResult {
  allowed: boolean;
  reason?: string;
  policy?: CancellationPolicy;
}

/**
 * Check if a booking can be cancelled based on policy
 */
export function canCancelBooking(
  booking: {
    id: string;
    created_at: string;
    scheduled_at: string;
    location_type: 'at_salon' | 'at_home';
  },
  policy: CancellationPolicy,
  currentTime: Date = new Date()
): CancellationCheckResult {
  const bookingCreatedAt = new Date(booking.created_at);
  const scheduledAt = new Date(booking.scheduled_at);

  // Check grace window: bookings created < grace_window_minutes ago can always be cancelled
  const graceWindowEnd = new Date(bookingCreatedAt.getTime() + policy.grace_window_minutes * 60000);
  if (currentTime <= graceWindowEnd) {
    return {
      allowed: true,
      policy,
    };
  }

  // Check hours-before cutoff
  const cutoffTime = new Date(scheduledAt.getTime() - policy.hours_before_cutoff * 60 * 60 * 1000);
  if (currentTime < cutoffTime) {
    return {
      allowed: true,
      policy,
    };
  }

  // Outside policy window
  return {
    allowed: false,
    reason: `Cancellations must be made at least ${policy.hours_before_cutoff} hours before the appointment. This booking can no longer be cancelled online.`,
    policy,
  };
}

/**
 * Get cancellation policy for a booking
 * Matches by provider_id and location_type (or NULL for both)
 */
export async function getCancellationPolicy(
  supabase: any,
  providerId: string,
  locationType: 'at_salon' | 'at_home'
): Promise<CancellationPolicy | null> {
  // First try to get location-specific policy
  const { data: locationPolicy } = await supabase
    .from('cancellation_policies')
    .select('*')
    .eq('provider_id', providerId)
    .eq('location_type', locationType)
    .eq('is_active', true)
    .maybeSingle();

  if (locationPolicy) {
    return locationPolicy as CancellationPolicy;
  }

  // Fall back to general policy (location_type IS NULL)
  const { data: generalPolicy } = await supabase
    .from('cancellation_policies')
    .select('*')
    .eq('provider_id', providerId)
    .is('location_type', null)
    .eq('is_active', true)
    .maybeSingle();

  if (generalPolicy) {
    return generalPolicy as CancellationPolicy;
  }

  // No policy found - return default
  return {
    id: '',
    provider_id: providerId,
    location_type: null,
    hours_before_cutoff: 24,
    grace_window_minutes: 15,
    policy_text: 'Cancellations must be made at least 24 hours before your appointment.',
    late_cancellation_type: 'no_refund',
    is_active: true,
  };
}
