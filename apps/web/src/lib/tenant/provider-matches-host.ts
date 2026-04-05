import type { SupabaseClient } from "@supabase/supabase-js";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { errorResponse } from "@/lib/supabase/api-helpers";

export const PROVIDER_MARKET_MISMATCH_MSG =
  "Your provider account is not on this market. Use the site or app for the correct region.";

export const BOOKING_MARKET_MISMATCH_MSG =
  "This booking belongs to a different market. Use the provider site or app for the correct region.";

/**
 * When the request Host maps to a tenant that does not match `providers.tenant_id` for this provider.
 */
export async function providerTenantMismatchResponse(
  supabase: SupabaseClient,
  tenantIdFromHost: string,
  providerId: string,
) {
  const { data: provRow } = await supabase
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  if (
    !resourceTenantMatchesHostTenant(
      tenantIdFromHost,
      (provRow as { tenant_id?: string | null } | null)?.tenant_id,
    )
  ) {
    return errorResponse(PROVIDER_MARKET_MISMATCH_MSG, "TENANT_MISMATCH", 403);
  }
  return null;
}

/**
 * When `bookings.tenant_id` is set and does not match the Host tenant.
 */
export function bookingTenantMismatchResponse(
  tenantIdFromHost: string,
  bookingTenantId: string | null | undefined,
) {
  if (!resourceTenantMatchesHostTenant(tenantIdFromHost, bookingTenantId)) {
    return errorResponse(BOOKING_MARKET_MISMATCH_MSG, "TENANT_MISMATCH", 403);
  }
  return null;
}
