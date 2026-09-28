import type { SupabaseClient } from "@supabase/supabase-js";

export async function sumKnownSpendForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  window?: { start: Date; end: Date },
): Promise<{ entered: number; estimated_owned: number; known: number }> {
  let q = supabase
    .from("brand_metric_entries")
    .select("metric_key, value, converted_amount, voided, as_of, placement_id")
    .eq("tenant_id", tenantId)
    .eq("voided", false);

  if (window) {
    q = q.gte("as_of", window.start.toISOString().slice(0, 10)).lte("as_of", window.end.toISOString().slice(0, 10));
  }

  const { data: rows } = await q;
  const latestByPlacementMetric = new Map<string, { value: number; converted: number | null }>();
  for (const r of rows ?? []) {
    const key = `${r.placement_id}:${r.metric_key}`;
    const val = Number(r.converted_amount ?? r.value ?? 0);
    latestByPlacementMetric.set(key, { value: Number(r.value ?? 0), converted: r.converted_amount != null ? val : null });
  }

  let entered = 0;
  for (const [, v] of latestByPlacementMetric) {
    if (v.converted != null) entered += v.converted;
    else entered += v.value;
  }

  const { data: pricebook } = await supabase.from("marketing_channel_pricebook").select("channel, unit_cost_zar");
  const rateByChannel = new Map((pricebook ?? []).map((p) => [p.channel, Number(p.unit_cost_zar)]));

  const { data: ownedPlacements } = await supabase
    .from("brand_placements")
    .select("id, channel_key")
    .eq("tenant_id", tenantId)
    .eq("line_type", "owned");

  let estimated_owned = 0;
  for (const pl of ownedPlacements ?? []) {
    const sends =
      latestByPlacementMetric.get(`${pl.id}:sends`)?.value ??
      latestByPlacementMetric.get(`${pl.id}:recipient_count`)?.value ??
      0;
    const ch = pl.channel_key.replace(/^owned_/, "");
    const rate = rateByChannel.get(ch) ?? rateByChannel.get("email") ?? 0;
    estimated_owned += sends * rate;
  }

  return { entered, estimated_owned, known: entered + estimated_owned };
}
