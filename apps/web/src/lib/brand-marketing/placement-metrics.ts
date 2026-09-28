import type { SupabaseClient } from "@supabase/supabase-js";

/** Latest non-void metric per placement/key within optional as-of window. */
export async function sumEnteredPlacementMetrics(
  supabase: SupabaseClient,
  placementIds: string[],
  window?: { start: Date; end: Date },
): Promise<{ impressions: number; clicks: number; reach: number; spend: number }> {
  if (placementIds.length === 0) {
    return { impressions: 0, clicks: 0, reach: 0, spend: 0 };
  }

  let q = supabase
    .from("brand_metric_entries")
    .select("placement_id, metric_key, value, converted_amount, voided, as_of")
    .in("placement_id", placementIds)
    .eq("voided", false)
    .order("as_of", { ascending: false });

  if (window) {
    q = q
      .gte("as_of", window.start.toISOString().slice(0, 10))
      .lte("as_of", window.end.toISOString().slice(0, 10));
  }

  const { data: rows } = await q;
  const latest = new Map<string, number>();
  for (const r of rows ?? []) {
    const key = `${r.placement_id}:${r.metric_key}`;
    if (latest.has(key)) continue;
    const val = Number(r.converted_amount ?? r.value ?? 0);
    latest.set(key, val);
  }

  let impressions = 0;
  let clicks = 0;
  let reach = 0;
  let spend = 0;
  for (const [key, val] of latest) {
    const mk = key.split(":")[1];
    if (mk === "impressions") impressions += val;
    if (mk === "clicks") clicks += val;
    if (mk === "reach" || mk === "estimated_reach") reach += val;
    if (mk === "spend") spend += val;
  }
  return { impressions, clicks, reach: reach || impressions, spend };
}

export async function sumKnownSpendForCampaign(
  supabase: SupabaseClient,
  tenantId: string,
  campaignId: string,
  window?: { start: Date; end: Date },
): Promise<{ entered: number; estimated_owned: number; known: number; allocated: number }> {
  const { data: placements } = await supabase
    .from("brand_placements")
    .select("id, line_type, channel_key, budget")
    .eq("campaign_id", campaignId)
    .eq("tenant_id", tenantId);

  const ids = (placements ?? []).map((p) => p.id);
  const allocated = (placements ?? []).reduce((s, p) => s + Number(p.budget ?? 0), 0);
  const enteredMetrics = await sumEnteredPlacementMetrics(supabase, ids, window);

  const { data: pricebook } = await supabase.from("marketing_channel_pricebook").select("channel, unit_cost_zar");
  const rateByChannel = new Map((pricebook ?? []).map((p) => [p.channel, Number(p.unit_cost_zar)]));

  let estimated_owned = 0;
  for (const pl of placements ?? []) {
    if (pl.line_type !== "owned") continue;
    const { data: sendRow } = await supabase
      .from("brand_metric_entries")
      .select("value")
      .eq("placement_id", pl.id)
      .in("metric_key", ["sends", "recipient_count"])
      .eq("voided", false)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sends = Number(sendRow?.value ?? 0);
    const ch = String(pl.channel_key).replace(/^owned_/, "");
    estimated_owned += sends * (rateByChannel.get(ch) ?? rateByChannel.get("email") ?? 0);
  }

  const entered = enteredMetrics.spend;
  return { entered, estimated_owned, known: entered + estimated_owned, allocated };
}
