import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCommissionPercentageForProvider } from "@/lib/finance/resolve-commission-percentage";

/**
 * Effective commission % for a booking payment: prefers `commission_percentage_snapshot`
 * (migration 947), then live tenant/provider settings.
 */
export async function resolveCommissionPercentageForBooking(
  supabase: SupabaseClient,
  opts: {
    bookingId: string;
    tenantId?: string | null;
    providerId?: string | null;
  },
): Promise<number> {
  const { data: row } = await supabase
    .from("bookings")
    .select("commission_percentage_snapshot, tenant_id, provider_id")
    .eq("id", opts.bookingId)
    .maybeSingle();

  const snap = (row as { commission_percentage_snapshot?: number | null } | null)
    ?.commission_percentage_snapshot;
  if (snap != null && Number.isFinite(Number(snap))) {
    return Number(snap);
  }

  return resolveCommissionPercentageForProvider(supabase, {
    tenantId: opts.tenantId ?? (row as { tenant_id?: string | null } | null)?.tenant_id,
    providerId: opts.providerId ?? (row as { provider_id?: string | null } | null)?.provider_id,
  });
}
