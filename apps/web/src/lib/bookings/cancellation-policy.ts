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
  /** Percentage to refund (0–100). When present, used for refund amount; else late_cancellation_type is used. */
  refund_percentage?: number;
  hours_before?: number;
  /** Optional explicit fee (used when refund_percentage is 0 / no refund). */
  fee_amount?: number;
  fee_type?: 'fixed' | 'percentage';
}

export interface CancellationCheckResult {
  allowed: boolean;
  reason?: string;
  policy?: CancellationPolicy;
  /** True when cancel is allowed but the appointment is inside the late window (refund follows late rules). */
  isLateCancellation?: boolean;
}

export interface CanCancelBookingOptions {
  /**
   * When true (default), cancellations after the cutoff are not allowed online (used for reschedule).
   * When false, late cancellation is allowed and refunds follow late policy (customer cancel / portal).
   */
  forbidLateSelfService?: boolean;
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
  currentTime: Date = new Date(),
  options?: CanCancelBookingOptions
): CancellationCheckResult {
  const forbidLateSelfService = options?.forbidLateSelfService !== false;
  const bookingCreatedAt = new Date(booking.created_at);
  const scheduledAt = new Date(booking.scheduled_at);

  // Check grace window: bookings created < grace_window_minutes ago can always be cancelled
  const graceWindowEnd = new Date(bookingCreatedAt.getTime() + policy.grace_window_minutes * 60000);
  if (currentTime <= graceWindowEnd) {
    return {
      allowed: true,
      policy,
      isLateCancellation: false,
    };
  }

  // Check hours-before cutoff
  const cutoffTime = new Date(scheduledAt.getTime() - policy.hours_before_cutoff * 60 * 60 * 1000);
  if (currentTime < cutoffTime) {
    return {
      allowed: true,
      policy,
      isLateCancellation: false,
    };
  }

  // Inside late window (after cutoff, outside grace)
  if (forbidLateSelfService) {
    return {
      allowed: false,
      reason: `Changes must be made at least ${policy.hours_before_cutoff} hours before the appointment. Please contact the provider.`,
      policy,
      isLateCancellation: true,
    };
  }

  return {
    allowed: true,
    policy,
    isLateCancellation: true,
  };
}

/**
 * Get cancellation policy for a booking
 * Matches by provider_id and location_type (or NULL for both).
 * When multiple rows match, resolves by is_default then created_at.
 */
export async function getCancellationPolicy(
  supabase: any,
  providerId: string,
  locationType: 'at_salon' | 'at_home'
): Promise<CancellationPolicy | null> {
  // First try to get location-specific policy (at most one via is_default + created_at)
  const { data: locationRows } = await supabase
    .from('cancellation_policies')
    .select('*')
    .eq('provider_id', providerId)
    .eq('location_type', locationType)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const locationPolicy = locationRows?.[0];
  if (locationPolicy) {
    return locationPolicy as CancellationPolicy;
  }

  // Fall back to general policy (location_type IS NULL); resolve multiple by is_default then created_at
  const { data: generalRows } = await supabase
    .from('cancellation_policies')
    .select('*')
    .eq('provider_id', providerId)
    .is('location_type', null)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const generalPolicy = generalRows?.[0];
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
    refund_percentage: 0,
    fee_amount: 0,
    fee_type: 'fixed',
  };
}
