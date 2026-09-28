import type { SupabaseClient } from "@supabase/supabase-js";
import { findOwnedChannelClashes } from "./clashes";
import { quarterDateRange } from "./strategy-dates";

export type CalendarCampaign = {
  id: string;
  name: string;
  stage: string;
  flight_start: string | null;
  flight_end: string | null;
  pillar_id: string | null;
  plan_id: string | null;
  pillar_name: string | null;
  plan_label: string | null;
  out_of_plan: boolean;
  unlinked: boolean;
};

export type CalendarPlanBand = {
  plan_id: string;
  pillar_id: string;
  pillar_name: string;
  year: number;
  quarter: number;
  budget: number;
  gap: boolean;
};

export async function buildBrandCalendar(
  supabase: SupabaseClient,
  tenantId: string,
  window: { from: Date; to: Date },
): Promise<{
  campaigns: CalendarCampaign[];
  plan_bands: CalendarPlanBand[];
  clashes: Awaited<ReturnType<typeof findOwnedChannelClashes>>;
}> {
  const { data: campaigns } = await supabase
    .from("brand_campaigns")
    .select("id, name, stage, flight_start, flight_end, pillar_id, plan_id")
    .eq("tenant_id", tenantId);

  const { data: pillars } = await supabase.from("brand_pillars").select("id, name").eq("tenant_id", tenantId);
  const { data: plans } = await supabase
    .from("brand_plans")
    .select("id, year, quarter, budget, pillar_id, archived_at")
    .eq("tenant_id", tenantId);
  const pillarName = new Map((pillars ?? []).map((p) => [p.id, p.name]));
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));

  const calCampaigns: CalendarCampaign[] = (campaigns ?? []).map((c) => {
    const plan = c.plan_id ? planById.get(c.plan_id) : null;
    let out_of_plan = false;
    if (plan && c.flight_start) {
      const q = quarterDateRange(plan.year, plan.quarter);
      const start = Date.parse(c.flight_start.slice(0, 10));
      if (start < q.start.getTime() || start > q.end.getTime()) out_of_plan = true;
    }
    return {
      id: c.id,
      name: c.name,
      stage: c.stage,
      flight_start: c.flight_start,
      flight_end: c.flight_end,
      pillar_id: c.pillar_id,
      plan_id: c.plan_id,
      pillar_name: c.pillar_id ? (pillarName.get(c.pillar_id) ?? null) : null,
      plan_label: plan ? `${plan.year} Q${plan.quarter}` : null,
      out_of_plan,
      unlinked: !c.pillar_id || !c.plan_id,
    };
  });

  const plan_bands: CalendarPlanBand[] = [];
  for (const plan of plans ?? []) {
    if (plan.archived_at) continue;
    const linked = (campaigns ?? []).some((c) => c.plan_id === plan.id);
    const q = quarterDateRange(plan.year, plan.quarter);
    const overlaps =
      q.end >= window.from && q.start <= window.to;
    if (!overlaps) continue;
    plan_bands.push({
      plan_id: plan.id,
      pillar_id: plan.pillar_id,
      pillar_name: pillarName.get(plan.pillar_id) ?? "",
      year: plan.year,
      quarter: plan.quarter,
      budget: Number(plan.budget ?? 0),
      gap: !linked && Number(plan.budget ?? 0) > 0,
    });
  }

  const clashes = await findOwnedChannelClashes(supabase, tenantId);
  return { campaigns: calCampaigns, plan_bands, clashes };
}
