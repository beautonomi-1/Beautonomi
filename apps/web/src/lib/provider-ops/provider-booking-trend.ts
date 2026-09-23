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
    .eq("status", "completed")
    .gte("scheduled_at", fromIso)
    .lt("scheduled_at", toIso);
  return count ?? 0;
}

function tallyProviderCounts(
  rows: Array<{ provider_id: string }> | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const id = row.provider_id;
    if (!id) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

/** Completed bookings per provider for two consecutive 7-day windows (marketplace-health alignment). */
export async function fetchWeeklyCompletedBookingCountsByProvider(
  supabase: SupabaseClient,
  tenantId: string,
  providerIds: string[],
  nowMs = Date.now(),
): Promise<Map<string, { recent7d: number; previous7d: number }>> {
  const out = new Map<string, { recent7d: number; previous7d: number }>();
  if (providerIds.length === 0) return out;

  const nowIso = new Date(nowMs).toISOString();
  const d7 = new Date(nowMs - 7 * 86400000).toISOString();
  const d14 = new Date(nowMs - 14 * 86400000).toISOString();

  const [{ data: recent }, { data: previous }] = await Promise.all([
    supabase
      .from("bookings")
      .select("provider_id")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .in("provider_id", providerIds)
      .gte("scheduled_at", d7)
      .lt("scheduled_at", nowIso),
    supabase
      .from("bookings")
      .select("provider_id")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .in("provider_id", providerIds)
      .gte("scheduled_at", d14)
      .lt("scheduled_at", d7),
  ]);

  const recentMap = tallyProviderCounts(recent as Array<{ provider_id: string }> | null);
  const prevMap = tallyProviderCounts(previous as Array<{ provider_id: string }> | null);
  for (const id of providerIds) {
    out.set(id, {
      recent7d: recentMap.get(id) ?? 0,
      previous7d: prevMap.get(id) ?? 0,
    });
  }
  return out;
}

/** Weekly booking frequency drop — same 50% rule as 30d, with a lower volume floor. */
export function isWeeklyBookingFrequencyFalling(params: {
  previous7d: number;
  recent7d: number;
}): boolean {
  if (params.previous7d < 2) return false;
  return params.recent7d <= params.previous7d * 0.5;
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
