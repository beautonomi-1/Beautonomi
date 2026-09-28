import type { SupabaseClient } from "@supabase/supabase-js";
import { getKpiByKey } from "./kpis";
import { fetchMeasuredForCampaign, type MeasuredCampaignSlice } from "./measured";
import { sumEnteredPlacementMetrics, sumKnownSpendForCampaign } from "./placement-metrics";
import { quarterDateRange } from "./strategy-dates";
import type { StrategyTree } from "./strategy-types";

export type KpiPacingStatus =
  | "achieved"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "not_started"
  | "no_data";

export type ScorecardKpiRow = {
  kpi_id: string;
  kpi_key: string;
  target: number;
  actual: number;
  expected_to_date: number;
  status: KpiPacingStatus;
  baseline: number | null;
  weight: number;
  contributors: Array<{ campaign_id: string; name: string; share: number }>;
  last_entered_at: string | null;
};

export type PacingSettings = {
  pacing_at_risk_pct: number;
  pacing_off_track_pct: number;
  stale_data_days: number;
};

export async function loadPacingSettings(supabase: SupabaseClient, tenantId: string): Promise<PacingSettings> {
  const { data } = await supabase
    .from("brand_settings")
    .select("pacing_at_risk_pct, pacing_off_track_pct, stale_data_days")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    pacing_at_risk_pct: Number(data?.pacing_at_risk_pct ?? 90),
    pacing_off_track_pct: Number(data?.pacing_off_track_pct ?? 70),
    stale_data_days: Number(data?.stale_data_days ?? 14),
  };
}

function windowElapsedFraction(start: Date, end: Date, asOf: Date): number {
  if (asOf < start) return 0;
  if (asOf >= end) return 1;
  return (asOf.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

function computeStatus(
  actual: number,
  target: number,
  expected: number,
  direction: "higher" | "lower",
  settings: PacingSettings,
  notStarted: boolean,
  noData: boolean,
): KpiPacingStatus {
  if (notStarted) return "not_started";
  if (noData) return "no_data";
  if (target <= 0) return actual > 0 ? "achieved" : "no_data";
  if (direction === "higher") {
    if (actual >= target) return "achieved";
    if (expected <= 0) return "no_data";
    const ratio = actual / expected;
    if (ratio >= settings.pacing_at_risk_pct / 100) return "on_track";
    if (ratio >= settings.pacing_off_track_pct / 100) return "at_risk";
    return "off_track";
  }
  if (actual <= target) return "achieved";
  if (expected <= 0) return "no_data";
  const ratio = actual / expected;
  if (ratio <= settings.pacing_at_risk_pct / 100) return "on_track";
  if (ratio <= 1 + (1 - settings.pacing_off_track_pct / 100)) return "at_risk";
  return "off_track";
}

async function aggregateCampaignMetrics(
  supabase: SupabaseClient,
  tenantId: string,
  campaignIds: string[],
  window: { start: Date; end: Date },
): Promise<{ measured: MeasuredCampaignSlice; entered: { reach: number; clicks: number; spend: number }; lastEntered: string | null }> {
  const empty: MeasuredCampaignSlice = {
    signups: 0,
    promo_redemptions: 0,
    promo_discount: 0,
    promo_booking_value: 0,
    attributed_booking_value: 0,
    coupon_redeems: 0,
    referral_completions: 0,
    referral_rewards: 0,
    ads_clicks: 0,
    broadcast_recipients: 0,
    waitlist_rows: 0,
    leads_created: 0,
    leads_won: 0,
  };
  if (!campaignIds.length) {
    return { measured: empty, entered: { reach: 0, clicks: 0, spend: 0 }, lastEntered: null };
  }

  const { data: campaigns } = await supabase
    .from("brand_campaigns")
    .select("id, tracking_code")
    .in("id", campaignIds);
  const { data: placements } = await supabase
    .from("brand_placements")
    .select(
      "id, campaign_id, tracking_code, promotion_id, coupon_id, referral_code, referral_program, ads_campaign_id, broadcast_log_id, waitlist_city",
    )
    .in("campaign_id", campaignIds);

  const placementRows = placements ?? [];
  const entered = await sumEnteredPlacementMetrics(supabase, placementRows.map((p) => p.id), window);

  let lastEntered: string | null = null;
  const { data: entryRows } = await supabase
    .from("brand_metric_entries")
    .select("as_of")
    .in("placement_id", placementRows.map((p) => p.id))
    .eq("voided", false)
    .order("as_of", { ascending: false })
    .limit(1);
  if (entryRows?.[0]?.as_of) lastEntered = entryRows[0].as_of;

  const measured = { ...empty };
  for (const camp of campaigns ?? []) {
    const campPlacements = placementRows.filter((p) => p.campaign_id === camp.id);
    const subCodes = campPlacements.map((p) => p.tracking_code).filter(Boolean) as string[];
    const slice = await fetchMeasuredForCampaign(supabase, tenantId, camp.tracking_code, subCodes, window, {
      promotionIds: campPlacements.map((p) => p.promotion_id).filter(Boolean) as string[],
      couponIds: campPlacements.map((p) => p.coupon_id).filter(Boolean) as string[],
      referralCodes: campPlacements.map((p) => p.referral_code).filter(Boolean) as string[],
      referralProgram: campPlacements.some((p) => p.referral_program),
      adsCampaignIds: campPlacements.map((p) => p.ads_campaign_id).filter(Boolean) as string[],
      broadcastLogIds: campPlacements.map((p) => p.broadcast_log_id).filter(Boolean) as string[],
      waitlistCity: campPlacements.find((p) => p.waitlist_city)?.waitlist_city,
    });
    for (const k of Object.keys(slice) as (keyof MeasuredCampaignSlice)[]) {
      measured[k] += slice[k] as number;
    }
  }

  return {
    measured,
    entered: { reach: entered.reach, clicks: entered.clicks, spend: entered.spend },
    lastEntered,
  };
}

function actualForKpi(
  kpiKey: string,
  measured: MeasuredCampaignSlice,
  entered: { reach: number; clicks: number; spend: number },
): number {
  const def = getKpiByKey(kpiKey);
  if (!def) return 0;
  if (def.source === "measured" && def.measuredField) {
    return Number(measured[def.measuredField] ?? 0);
  }
  if (def.source === "entered") {
    if (kpiKey === "reach") return entered.reach;
    if (kpiKey === "clicks") return entered.clicks;
    if (kpiKey === "known_spend") return entered.spend;
  }
  if (def.source === "derived" && def.derive) {
    const parts: Record<string, number> = {
      signups: measured.signups,
      known_spend: entered.spend,
      attributed_booking_value: measured.attributed_booking_value,
      leads_created: measured.leads_created,
      leads_won: measured.leads_won,
      reach: entered.reach,
      clicks: entered.clicks,
    };
    return def.derive(parts) ?? 0;
  }
  return 0;
}

export async function buildStrategyScorecard(
  supabase: SupabaseClient,
  tenantId: string,
  strategy: StrategyTree,
  asOf = new Date(),
): Promise<{ kpis: ScorecardKpiRow[]; health_score: number; status_counts: Record<KpiPacingStatus, number> }> {
  const settings = await loadPacingSettings(supabase, tenantId);
  const kpis = (strategy.brand_strategy_kpis ?? []).filter((k) => !k.archived_at);
  const rows: ScorecardKpiRow[] = [];

  const planById = new Map<string, { year: number; quarter: number }>();
  for (const p of strategy.brand_pillars ?? []) {
    for (const pl of p.brand_plans ?? []) {
      planById.set(pl.id, { year: pl.year, quarter: pl.quarter });
    }
  }

  for (const kpi of kpis) {
    let window = { start: new Date(strategy.year, 0, 1), end: new Date(strategy.year, 11, 31, 23, 59, 59) };
    if (kpi.plan_id) {
      const pl = planById.get(kpi.plan_id);
      if (pl) window = quarterDateRange(pl.year, pl.quarter);
    }

    let campaignQ = supabase.from("brand_campaigns").select("id, name").eq("tenant_id", tenantId);
    if (kpi.plan_id) campaignQ = campaignQ.eq("plan_id", kpi.plan_id);
    else if (kpi.pillar_id) campaignQ = campaignQ.eq("pillar_id", kpi.pillar_id);
    else {
      const pillarIds = (strategy.brand_pillars ?? []).map((p) => p.id);
      if (pillarIds.length) campaignQ = campaignQ.in("pillar_id", pillarIds);
      else campaignQ = campaignQ.eq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { data: campaigns } = await campaignQ;
    const campaignIds = (campaigns ?? []).map((c) => c.id);

    const { measured, entered, lastEntered } = await aggregateCampaignMetrics(
      supabase,
      tenantId,
      campaignIds,
      window,
    );
    const actual = actualForKpi(kpi.kpi_key, measured, entered);
    const target = Number(kpi.target);
    const frac = windowElapsedFraction(window.start, window.end, asOf);
    const expected = target * frac;
    const def = getKpiByKey(kpi.kpi_key);
    const notStarted = asOf < window.start;
    const catalog = def;
    const noData =
      campaignIds.length === 0 ||
      (catalog?.source === "entered" &&
        lastEntered != null &&
        Date.now() - Date.parse(lastEntered) > settings.stale_data_days * 86400000) ||
      (catalog?.source === "entered" && !lastEntered && campaignIds.length > 0);

    const status = computeStatus(
      actual,
      target,
      expected,
      def?.direction ?? "higher",
      settings,
      notStarted,
      noData && actual === 0,
    );

    rows.push({
      kpi_id: kpi.id,
      kpi_key: kpi.kpi_key,
      target,
      actual: Math.round(actual * 100) / 100,
      expected_to_date: Math.round(expected * 100) / 100,
      status,
      baseline: kpi.baseline != null ? Number(kpi.baseline) : null,
      weight: kpi.weight ?? 1,
      contributors: (campaigns ?? []).map((c) => ({
        campaign_id: c.id,
        name: c.name,
        share: campaignIds.length ? 1 / campaignIds.length : 0,
      })),
      last_entered_at: lastEntered,
    });
  }

  const status_counts: Record<KpiPacingStatus, number> = {
    achieved: 0,
    on_track: 0,
    at_risk: 0,
    off_track: 0,
    not_started: 0,
    no_data: 0,
  };
  let weighted = 0;
  let weightSum = 0;
  for (const r of rows) {
    status_counts[r.status] += 1;
    if (r.status === "no_data" || r.status === "not_started") continue;
    const attainment =
      r.status === "achieved"
        ? 100
        : r.expected_to_date > 0
          ? Math.min(100, (r.actual / r.expected_to_date) * 100)
          : 0;
    weighted += attainment * r.weight;
    weightSum += r.weight;
  }
  const health_score = weightSum > 0 ? Math.round(weighted / weightSum) : 0;
  return { kpis: rows, health_score, status_counts };
}

export async function writeKpiSnapshotsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  period: { start: Date; end: Date },
): Promise<number> {
  const { data: strategies } = await supabase
    .from("brand_strategies")
    .select("*, brand_pillars(*, brand_plans(*)), brand_strategy_kpis(*)")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  let written = 0;
  for (const s of strategies ?? []) {
    const scorecard = await buildStrategyScorecard(supabase, tenantId, s as StrategyTree, period.end);
    for (const row of scorecard.kpis) {
      const { error } = await supabase.from("brand_strategy_kpi_snapshots").insert({
        tenant_id: tenantId,
        kpi_id: row.kpi_id,
        period_start: period.start.toISOString().slice(0, 10),
        period_end: period.end.toISOString().slice(0, 10),
        actual: row.actual,
        expected_to_date: row.expected_to_date,
        status: row.status,
        sources: { contributors: row.contributors },
        captured_at: new Date().toISOString(),
      });
      if (!error) written += 1;
    }
  }
  return written;
}
