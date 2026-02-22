import { getSupabaseServer } from '@/lib/supabase/server';

export interface LimitCheckResult {
  canProceed: boolean;
  reason: string;
  currentCount: number;
  limitValue: number | null;
  planName: string;
  isUnlimited: boolean;
}

/**
 * Check if provider can create a booking
 */
export async function checkBookingLimit(providerId: string): Promise<LimitCheckResult> {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase.rpc('can_provider_create_booking', {
    provider_id_param: providerId
  });

  if (error || !data || data.length === 0) {
    return {
      canProceed: false,
      reason: 'Unable to check booking limit',
      currentCount: 0,
      limitValue: null,
      planName: '',
      isUnlimited: false
    };
  }

  const result = data[0];
  return {
    canProceed: result.can_create,
    reason: result.reason,
    currentCount: result.current_count,
    limitValue: result.limit_value,
    planName: result.plan_name,
    isUnlimited: result.limit_value === null
  };
}

/**
 * Check if provider can send a message
 */
export async function checkMessageLimit(providerId: string): Promise<LimitCheckResult> {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase.rpc('can_provider_send_message', {
    provider_id_param: providerId
  });

  if (error || !data || data.length === 0) {
    return {
      canProceed: false,
      reason: 'Unable to check message limit',
      currentCount: 0,
      limitValue: null,
      planName: '',
      isUnlimited: false
    };
  }

  const result = data[0];
  return {
    canProceed: result.can_send,
    reason: result.reason,
    currentCount: result.current_count,
    limitValue: result.limit_value,
    planName: result.plan_name,
    isUnlimited: result.limit_value === null
  };
}

/**
 * Check if provider can add a staff member
 */
export async function checkStaffLimit(providerId: string): Promise<LimitCheckResult> {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase.rpc('can_provider_add_staff', {
    provider_id_param: providerId
  });

  if (error || !data || data.length === 0) {
    return {
      canProceed: false,
      reason: 'Unable to check staff limit',
      currentCount: 0,
      limitValue: null,
      planName: '',
      isUnlimited: false
    };
  }

  const result = data[0];
  return {
    canProceed: result.can_add,
    reason: result.reason,
    currentCount: result.current_count,
    limitValue: result.limit_value,
    planName: result.plan_name,
    isUnlimited: result.limit_value === null
  };
}

/**
 * Check if provider can add a location
 */
export async function checkLocationLimit(providerId: string): Promise<LimitCheckResult> {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase.rpc('can_provider_add_location', {
    provider_id_param: providerId
  });

  if (error || !data || data.length === 0) {
    return {
      canProceed: false,
      reason: 'Unable to check location limit',
      currentCount: 0,
      limitValue: null,
      planName: '',
      isUnlimited: false
    };
  }

  const result = data[0];
  return {
    canProceed: result.can_add,
    reason: result.reason,
    currentCount: result.current_count,
    limitValue: result.limit_value,
    planName: result.plan_name,
    isUnlimited: result.limit_value === null
  };
}

/**
 * Get provider's usage summary for all limits
 */
export async function getProviderUsageSummary(providerId: string) {
  const supabase = await getSupabaseServer();
  
  const { data, error } = await supabase.rpc('get_provider_usage_summary', {
    provider_id_param: providerId
  });

  if (error) {
    console.error('Error getting usage summary:', error);
    return [];
  }

  return data || [];
}

/**
 * Format limit error message for API responses
 */
export function formatLimitError(limitCheck: LimitCheckResult): string {
  if (limitCheck.isUnlimited) {
    return limitCheck.reason;
  }
  
  if (!limitCheck.canProceed) {
    return `${limitCheck.reason} Current plan: ${limitCheck.planName}. Please upgrade to continue.`;
  }
  
  return limitCheck.reason;
}
