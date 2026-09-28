import type { SupabaseClient } from "@supabase/supabase-js";
import { sumKnownSpendForCampaign } from "./placement-metrics";

export type PillarPackRow = {
  pillar_id: string;
  pillar_name: string;
  campaign_count: number;
  known_spend: number;
  budget_envelope: number;
  plan_budget: number;
  plans: PlanPackRow[];
};

export type PlanPackRow = {
  plan_id: string;
  quarter: number;
  plan_budget: number;
  campaign_count: number;
  known_spend: number;
  budget_envelope: number;
};

export async function rollupPackByPillar(
  supabase: SupabaseClient,
  tenantId: string,
  period: { start: Date; end: Date },
): Promise<PillarPackRow[]> {
  const { data: pillars } = await supabase
    .from("brand_pillars")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  if (!pillars?.length) return [];

  const { data: campaigns } = await supabase
    .from("brand_campaigns")
    .select("id, pillar_id, plan_id, budget_envelope")
    .eq("tenant_id", tenantId)
    .not("pillar_id", "is", null);

  const { data: plans } = await supabase
    .from("brand_plans")
    .select("id, pillar_id, quarter, budget")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);

  const campaignIds = (campaigns ?? []).map((c) => c.id);
  const spendByCampaign = new Map<string, number>();
  for (const id of campaignIds) {
    const spend = await sumKnownSpendForCampaign(supabase, tenantId, id, period);
    spendByCampaign.set(id, spend.known);
  }

  const rows: PillarPackRow[] = [];
  for (const pillar of pillars) {
    const linked = (campaigns ?? []).filter((c) => c.pillar_id === pillar.id);
    let known_spend = 0;
    let envelope = 0;
    for (const c of linked) {
      envelope += Number(c.budget_envelope ?? 0);
      known_spend += spendByCampaign.get(c.id) ?? 0;
    }

    const pillarPlans = (plans ?? []).filter((p) => p.pillar_id === pillar.id);
    const planRows: PlanPackRow[] = pillarPlans.map((pl) => {
      const planCampaigns = linked.filter((c) => c.plan_id === pl.id);
      let plSpend = 0;
      let plEnv = 0;
      for (const c of planCampaigns) {
        plEnv += Number(c.budget_envelope ?? 0);
        plSpend += spendByCampaign.get(c.id) ?? 0;
      }
      return {
        plan_id: pl.id,
        quarter: pl.quarter,
        plan_budget: Number(pl.budget ?? 0),
        campaign_count: planCampaigns.length,
        known_spend: Math.round(plSpend * 100) / 100,
        budget_envelope: plEnv,
      };
    });

    const plan_budget = planRows.reduce((s, p) => s + p.plan_budget, 0);

    rows.push({
      pillar_id: pillar.id,
      pillar_name: pillar.name,
      campaign_count: linked.length,
      budget_envelope: envelope,
      known_spend: Math.round(known_spend * 100) / 100,
      plan_budget,
      plans: planRows,
    });
  }
  return rows;
}
