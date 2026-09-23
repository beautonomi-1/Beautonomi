import type { SupabaseClient } from "@supabase/supabase-js";
import { AT_RISK_REFLAG_COOLDOWN_DAYS, AT_RISK_TREND_WINDOW_DAYS, DEEP_DORMANT_DAYS, daysBetween } from "@/lib/provider-ops/retention-rules";
import { getProviderCompletedBookingTrend } from "@/lib/provider-ops/provider-booking-trend";

const MAX_CASES_PER_RUN = 300;

export async function clearExpiredReturnedAt(supabase: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabase
    .from("provider_ops_cases")
    .select("id")
    .not("returned_at", "is", null)
    .lt("returned_at", cutoff);
  if (!data?.length) return 0;
  const ids = data.map((r) => r.id as string);
  await supabase.from("provider_ops_cases").update({ returned_at: null }).in("id", ids);
  return ids.length;
}

export async function reconcileRetentionAtRisk(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ processed: number; flagged: number; saved: number; cleared: number }> {
  const windowStart = new Date(Date.now() - AT_RISK_TREND_WINDOW_DAYS * 86400000).toISOString();

  const { data: rawCases } = await supabase
    .from("provider_ops_cases")
    .select(
      "id, provider_id, at_risk_flagged_at, at_risk_saved_at, last_qualifying_booking_at, qualifying_booking_count",
    )
    .eq("tenant_id", tenantId)
    .eq("current_desk", "retention")
    .eq("status", "activated")
    .not("provider_id", "is", null)
    .limit(500);

  const windowMs = new Date(windowStart).getTime();
  const cases = (rawCases ?? [])
    .filter((c) => {
      if (c.at_risk_flagged_at) return true;
      const last = c.last_qualifying_booking_at as string | null;
      if (!last) return false;
      return new Date(last).getTime() >= windowMs;
    })
    .slice(0, MAX_CASES_PER_RUN);

  let flagged = 0;
  let saved = 0;
  let cleared = 0;

  for (const row of cases ?? []) {
    const providerId = row.provider_id as string;
    const lastAt = row.last_qualifying_booking_at as string | null;
    if (
      lastAt &&
      daysBetween(lastAt) >= DEEP_DORMANT_DAYS &&
      !row.at_risk_flagged_at
    ) {
      continue;
    }

    const trend = await getProviderCompletedBookingTrend(supabase, providerId);
    const concerning = trend.concerning;
    const flaggedAt = row.at_risk_flagged_at as string | null;
    const savedAt = row.at_risk_saved_at as string | null;

    if (concerning) {
      const cooldownOk =
        !savedAt || daysBetween(savedAt) >= AT_RISK_REFLAG_COOLDOWN_DAYS;
      if (!cooldownOk) continue;

      const now = new Date().toISOString();
      if (savedAt && cooldownOk) {
        await supabase
          .from("provider_ops_cases")
          .update({
            at_risk_saved_at: null,
            at_risk_flagged_at: now,
            updated_at: now,
          })
          .eq("id", row.id);
        flagged++;
      } else if (!flaggedAt) {
        await supabase
          .from("provider_ops_cases")
          .update({
            at_risk_flagged_at: now,
            updated_at: now,
          })
          .eq("id", row.id);
        flagged++;
      }
      continue;
    }

    if (!flaggedAt) continue;

    const { data: touch } = await supabase
      .from("provider_ops_case_touches")
      .select("created_at")
      .eq("case_id", row.id)
      .gt("created_at", flaggedAt)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (touch?.created_at) {
      const now = new Date().toISOString();
      await supabase
        .from("provider_ops_cases")
        .update({
          at_risk_saved_at: now,
          updated_at: now,
        })
        .eq("id", row.id);
      saved++;
    } else {
      await supabase
        .from("provider_ops_cases")
        .update({
          at_risk_flagged_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      cleared++;
    }
  }

  return {
    processed: cases?.length ?? 0,
    flagged,
    saved,
    cleared,
  };
}

export async function reconcileRetentionForAllTenants(
  supabase: SupabaseClient,
): Promise<void> {
  await clearExpiredReturnedAt(supabase);
  const { data: tenants } = await supabase.from("tenants").select("id");
  for (const t of tenants ?? []) {
    const tenantId = t.id as string;
    try {
      await reconcileRetentionAtRisk(supabase, tenantId);
    } catch (err) {
      console.error("[reconcileRetentionAtRisk] tenant", tenantId, err);
    }
  }
}
