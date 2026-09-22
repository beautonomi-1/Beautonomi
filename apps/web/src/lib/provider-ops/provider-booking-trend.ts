import type { SupabaseClient } from "@supabase/supabase-js";
import { isBookingTrendConcerning } from "@/lib/agents/workflows/provider-ops";

export { isBookingTrendConcerning };

async function countCompletedBookingsInRange(
  supabase: SupabaseClient,
  providerId: string,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .in("status", ["completed", "confirmed", "in_progress"])
    .gte("scheduled_at", fromIso)
    .lt("scheduled_at", toIso);
  return count ?? 0;
}

export type ProviderBookingTrend = {
  previous30d: number;
  recent30d: number;
  concerning: boolean;
};

export async function getProviderCompletedBookingTrend(
  supabase: SupabaseClient,
  providerId: string,
  nowMs = Date.now(),
): Promise<ProviderBookingTrend> {
  const d30 = new Date(nowMs - 30 * 24 * 3600_000).toISOString();
  const d60 = new Date(nowMs - 60 * 24 * 3600_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const recent30d = await countCompletedBookingsInRange(supabase, providerId, d30, nowIso);
  const previous30d = await countCompletedBookingsInRange(supabase, providerId, d60, d30);
  return {
    previous30d,
    recent30d,
    concerning: isBookingTrendConcerning({ previous30d, recent30d }),
  };
}
