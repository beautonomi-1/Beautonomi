import type { NextResponse } from "next/server";
import { errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

export type ResolvePaymentTenantResult =
  | { ok: true; tenantIdFromHost: string; paymentTenantId: string }
  | { ok: false; response: NextResponse };

/**
 * When a resource row has a non-null `tenant_id`, it must match the Host-resolved tenant
 * (same rule as payment init). Legacy rows with null `tenant_id` are treated as host-only.
 */
export function resourceTenantMatchesHostTenant(
  tenantIdFromHost: string,
  resourceTenantId: string | null | undefined,
): boolean {
  const b =
    typeof resourceTenantId === "string" && resourceTenantId.trim()
      ? resourceTenantId.trim()
      : null;
  if (b && b !== tenantIdFromHost) return false;
  return true;
}

/**
 * Ensures the request Host maps to the same tenant as the booking's market (booking.tenant_id).
 * Use for Paystack and other PSP inits tied to a booking (spec: booking tenant is immutable).
 */
export async function resolvePaymentTenantForBookingRequest(
  request: Request,
  bookingTenantId: string | null | undefined,
): Promise<ResolvePaymentTenantResult> {
  const tenantIdFromHost = await resolveTenantIdWithZaFallback(request);
  if (!resourceTenantMatchesHostTenant(tenantIdFromHost, bookingTenantId)) {
    return {
      ok: false,
      response: errorResponse(
        "This booking belongs to a different market. Open checkout from the correct site or app for this booking.",
        "TENANT_MISMATCH",
        403,
      ),
    };
  }
  const b =
    typeof bookingTenantId === "string" && bookingTenantId.trim()
      ? bookingTenantId.trim()
      : null;
  return {
    ok: true,
    tenantIdFromHost,
    paymentTenantId: b ?? tenantIdFromHost,
  };
}
