import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import type { NextResponse } from "next/server";

type Err = { error: NextResponse };

/** Ensure `tenant_id` is always included in a select string. */
function withTenantId(select: string): string {
  // Already present (exact column or as part of an embed)?
  if (/\btenant_id\b/.test(select)) return select;
  return `${select}, tenant_id`;
}

/**
 * Load a booking by id; 404 if missing, 403 TENANT_MISMATCH if tenant_id differs (admin Host context).
 *
 * NOTE: `tenant_id` is always appended to the select internally so the guard
 * works even when the caller only asks for a subset of columns (e.g. `"id"`).
 */
export async function fetchBookingInAdminTenant<T extends string>(
  supabase: SupabaseClient,
  bookingId: string,
  tenantId: string,
  select: T
): Promise<{ booking: Record<string, unknown> } | Err> {
  const { data, error } = await supabase
    .from("bookings")
    .select(withTenantId(select))
    .eq("id", bookingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { error: notFoundResponse("Booking not found") };
  }
  const row = data as { tenant_id?: string };
  if (row.tenant_id !== tenantId) {
    return {
      error: errorResponse(
        "Booking belongs to another market",
        "TENANT_MISMATCH",
        403
      ),
    };
  }
  return { booking: data as unknown as Record<string, unknown> };
}

/**
 * Load a provider by id; 404 if missing, 403 if tenant_id differs.
 *
 * NOTE: `tenant_id` is always appended to the select internally so the guard
 * works even when the caller only asks for a subset of columns (e.g. `"id"`).
 */
export async function fetchProviderInAdminTenant<T extends string>(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string,
  select: T
): Promise<{ provider: Record<string, unknown> } | Err> {
  const { data, error } = await supabase
    .from("providers")
    .select(withTenantId(select))
    .eq("id", providerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { error: notFoundResponse("Provider not found") };
  }
  const row = data as { tenant_id?: string };
  if (row.tenant_id !== tenantId) {
    return {
      error: errorResponse(
        "Provider belongs to another market",
        "TENANT_MISMATCH",
        403
      ),
    };
  }
  return { provider: data as unknown as Record<string, unknown> };
}
