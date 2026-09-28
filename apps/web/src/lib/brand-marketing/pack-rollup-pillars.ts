import type { SupabaseClient } from "@supabase/supabase-js";
import { sumKnownSpendForCampaign } from "./placement-metrics";

export type PillarPackRow = {
  pillar_id: string;
  pillar_name: string;
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
    .eq("tenant_id", tenantId);

  if (!pillars?.length) return [];

  const { data: campaigns } = await supabase
    .from("brand_campaigns")
    .select("id, pillar_id, budget_envelope")
    .eq("tenant_id", tenantId)
    .not("pillar_id", "is", null);

  const rows: PillarPackRow[] = [];
  for (const pillar of pillars) {
    const linked = (campaigns ?? []).filter((c) => c.pillar_id === pillar.id);
    let known_spend = 0;
    for (const c of linked) {
      const spend = await sumKnownSpendForCampaign(supabase, tenantId, c.id, period);
      known_spend += spend.known;
    }
    const envelope = linked.reduce((s, c) => s + Number(c.budget_envelope ?? 0), 0);
    rows.push({
      pillar_id: pillar.id,
      pillar_name: pillar.name,
      campaign_count: linked.length,
      budget_envelope: envelope,
      known_spend: Math.round(known_spend * 100) / 100,
    });
  }
  return rows;
}
