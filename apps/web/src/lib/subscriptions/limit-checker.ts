import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { formatProviderPortalLimitMessage } from "./subscription-limit-messages";

export interface LimitCheckResult {
  canProceed: boolean;
  reason: string;
  currentCount: number;
  limitValue: number | null;
  planName: string;
  isUnlimited: boolean;
}

/**
 * Check if provider can create a booking.
 * Pass the same Supabase client used for the request (e.g. Bearer session from
 * `getSupabaseServer(request)` or service role) so RPC runs with a valid
 * context. A bare `getSupabaseServer()` has no cookies on mobile API calls and
 * often fails the RPC, producing false "unable to check booking limit" banners.
 */
export async function checkBookingLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_create_booking", {
    provider_id_param: providerId,
  });

  if (error || !data || data.length === 0) {
    console.error("[checkBookingLimit] can_provider_create_booking failed", {
      providerId,
      error: error?.message ?? error,
      rowCount: data?.length ?? 0,
    });
    return {
      canProceed: false,
      reason: "Unable to check booking limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
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
 * Check if provider can send a message.
 * Pass `getSupabaseServer(request)` on API routes so mobile Bearer auth works.
 */
export async function checkMessageLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_send_message", {
    provider_id_param: providerId,
  });

  if (error || !data || data.length === 0) {
    console.error("[checkMessageLimit] can_provider_send_message failed", {
      providerId,
      error: error?.message ?? error,
    });
    return {
      canProceed: false,
      reason: "Unable to check message limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
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
 * Check if provider can add a staff member.
 * Pass `getSupabaseServer(request)` on API routes so mobile Bearer auth works.
 */
export async function checkStaffLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_add_staff", {
    provider_id_param: providerId,
  });

  if (error || !data || data.length === 0) {
    console.error("[checkStaffLimit] can_provider_add_staff failed", {
      providerId,
      error: error?.message ?? error,
    });
    return {
      canProceed: false,
      reason: "Unable to check staff limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
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
 * Check if provider can add a location.
 * Pass `getSupabaseServer(request)` on API routes so mobile Bearer auth works.
 */
export async function checkLocationLimit(
  providerId: string,
  supabase?: SupabaseClient<Database>
): Promise<LimitCheckResult> {
  const client = supabase ?? (await getSupabaseServer());

  const { data, error } = await client.rpc("can_provider_add_location", {
    provider_id_param: providerId,
  });

  if (error || !data || data.length === 0) {
    console.error("[checkLocationLimit] can_provider_add_location failed", {
      providerId,
      error: error?.message ?? error,
    });
    return {
      canProceed: false,
      reason: "Unable to check location limit",
      currentCount: 0,
      limitValue: null,
      planName: "",
      isUnlimited: false,
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
 * Format limit error for **provider portal** API responses (staff, messages, etc.).
 * @param actionLabel — e.g. "Plan" for staff limits, "Subscription" for messaging.
 */
export function formatLimitError(limitCheck: LimitCheckResult, actionLabel = "Subscription"): string {
  return formatProviderPortalLimitMessage(limitCheck, actionLabel);
}
