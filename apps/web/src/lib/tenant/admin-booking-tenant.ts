import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import type { NextResponse } from "next/server";

type Err = { error: NextResponse };

/**
 * Load a booking by id; 404 if missing, 403 TENANT_MISMATCH if tenant_id differs (admin Host context).
 */
export async function fetchBookingInAdminTenant<T extends string>(
  supabase: SupabaseClient,
  bookingId: string,
  tenantId: string,
  select: T
): Promise<{ booking: Record<string, unknown> } | Err> {
  const { data, error } = await supabase
    .from("bookings")
    .select(select)
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
  return { booking: data as Record<string, unknown> };
}

/**
 * Load a provider by id; 404 if missing, 403 if tenant_id differs.
 */
export async function fetchProviderInAdminTenant<T extends string>(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string,
  select: T
): Promise<{ provider: Record<string, unknown> } | Err> {
  const { data, error } = await supabase
    .from("providers")
    .select(select)
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
  return { provider: data as Record<string, unknown> };
}
