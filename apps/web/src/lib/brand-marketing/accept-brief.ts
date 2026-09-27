import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestTrackingCode } from "./codes";
import { lineTypeForChannelKey } from "./channels";

export async function acceptBrandBrief(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    briefId: string;
    actorId: string;
    tenantSlug: string;
  },
): Promise<{ campaignId: string; trackingCode: string }> {
  const { data: brief, error: briefErr } = await supabase
    .from("brand_briefs")
    .select("*")
    .eq("id", input.briefId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (briefErr || !brief) throw new Error("Brief not found");
  if (brief.status === "accepted" && brief.accepted_campaign_id) {
    throw new Error("Brief already accepted");
  }

  let trackingCode = suggestTrackingCode(brief.name, input.tenantSlug);
  const { data: clash } = await supabase
    .from("brand_campaigns")
    .select("id")
    .ilike("tracking_code", trackingCode)
    .maybeSingle();
  if (clash) {
    trackingCode = `${trackingCode}-${Date.now().toString(36).slice(-4)}`;
  }

  const { data: campaign, error: campErr } = await supabase
    .from("brand_campaigns")
    .insert({
      tenant_id: input.tenantId,
      brief_id: brief.id,
      name: brief.name,
      objective: brief.objective,
      budget_envelope: brief.budget_envelope,
      flight_start: brief.flight_start,
      flight_end: brief.flight_end,
      line_mix: brief.line_mix,
      success_metric: brief.success_metric,
      success_target: brief.success_target,
      group_code: brief.group_code,
      tracking_code: trackingCode,
      owner_id: brief.author_id ?? input.actorId,
      stage: "planning",
    })
    .select("id, tracking_code")
    .single();

  if (campErr || !campaign) throw new Error(campErr?.message ?? "Failed to create campaign");

  const channels: string[] = Array.isArray(brief.channels_requested) ? brief.channels_requested : [];
  if (channels.length > 0) {
    const rows = channels.map((channel_key) => ({
      tenant_id: input.tenantId,
      campaign_id: campaign.id,
      channel_key,
      line_type: lineTypeForChannelKey(channel_key),
      tracking_code: trackingCode,
      owner_id: brief.author_id ?? input.actorId,
      budget: null,
    }));
    await supabase.from("brand_placements").insert(rows);
  }

  await supabase
    .from("brand_briefs")
    .update({
      status: "accepted",
      accepted_campaign_id: campaign.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", brief.id);

  await supabase.from("brand_activity").insert({
    tenant_id: input.tenantId,
    brief_id: brief.id,
    campaign_id: campaign.id,
    actor_id: input.actorId,
    kind: "brief_accepted",
    body: "Brief accepted; campaign created.",
  });

  return { campaignId: campaign.id, trackingCode: campaign.tracking_code };
}
