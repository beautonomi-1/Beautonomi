import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnedChannelClash = {
  placement_id: string;
  campaign_id: string;
  campaign_name: string;
  channel_key: string;
  flight_start: string;
  flight_end: string;
};

export async function findOwnedChannelClashes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<OwnedChannelClash[]> {
  const { data: liveCampaigns } = await supabase
    .from("brand_campaigns")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("stage", "live");

  const liveIds = (liveCampaigns ?? []).map((c) => c.id);
  if (liveIds.length === 0) return [];

  const { data: owned } = await supabase
    .from("brand_placements")
    .select("id, campaign_id, channel_key, flight_start, flight_end")
    .eq("tenant_id", tenantId)
    .eq("line_type", "owned")
    .in("campaign_id", liveIds)
    .not("flight_start", "is", null)
    .not("flight_end", "is", null);

  const nameById = new Map((liveCampaigns ?? []).map((c) => [c.id, c.name]));
  const clashes: OwnedChannelClash[] = [];

  const rows = owned ?? [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.channel_key !== b.channel_key) continue;
      if (a.flight_start! > b.flight_end! || b.flight_start! > a.flight_end!) continue;
      clashes.push({
        placement_id: a.id,
        campaign_id: a.campaign_id,
        campaign_name: nameById.get(a.campaign_id) ?? "",
        channel_key: a.channel_key,
        flight_start: a.flight_start!,
        flight_end: a.flight_end!,
      });
      clashes.push({
        placement_id: b.id,
        campaign_id: b.campaign_id,
        campaign_name: nameById.get(b.campaign_id) ?? "",
        channel_key: b.channel_key,
        flight_start: b.flight_start!,
        flight_end: b.flight_end!,
      });
    }
  }
  return clashes;
}
