import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStrategyScorecard, type KpiPacingStatus } from "./scorecard";
import { getStrategyById } from "./strategy";
import type { StrategyTree } from "./strategy-types";

const ALERT_STATUSES: KpiPacingStatus[] = ["at_risk", "off_track"];

export async function runStrategyPacingAlertsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  period: { start: Date; end: Date },
): Promise<number> {
  const { data: strategies } = await supabase
    .from("brand_strategies")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .is("archived_at", null);

  let created = 0;
  for (const s of strategies ?? []) {
    const loaded = await getStrategyById(supabase, tenantId, s.id);
    if (!loaded) continue;
    const strategyTree: StrategyTree = loaded;
    const scorecard = await buildStrategyScorecard(supabase, tenantId, strategyTree, period.end);
    for (const row of scorecard.kpis) {
      if (!ALERT_STATUSES.includes(row.status)) continue;
      const title = `KPI ${row.kpi_key} is ${row.status.replace("_", " ")}`;
      const metaKey = `kpi_alert:${row.kpi_id}:${period.start.toISOString().slice(0, 10)}`;
      const { data: existing } = await supabase
        .from("brand_tasks")
        .select("id")
        .eq("tenant_id", tenantId)
        .contains("meta", { dedupe_key: metaKey })
        .eq("status", "open")
        .maybeSingle();
      if (existing) continue;
      const { data: kpiRow } = await supabase
        .from("brand_strategy_kpis")
        .select("owner_id")
        .eq("id", row.kpi_id)
        .maybeSingle();
      await supabase.from("brand_tasks").insert({
        tenant_id: tenantId,
        title,
        owner_id: kpiRow?.owner_id ?? null,
        status: "open",
        meta: { dedupe_key: metaKey, kpi_id: row.kpi_id, strategy_id: s.id, status: row.status },
      });
      created += 1;
    }
  }
  return created;
}
