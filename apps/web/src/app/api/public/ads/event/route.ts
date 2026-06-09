/**
 * POST /api/public/ads/event - Record ad event from public discovery surfaces.
 * Body: { event_type: 'impression' | 'click' | 'book', campaign_id, provider_id, idempotency_key?, attribution? }
 */

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType =
      body.event_type === "impression" || body.event_type === "click" || body.event_type === "book"
        ? body.event_type
        : null;
    const campaignId = body.campaign_id ?? null;
    const providerId = body.provider_id ?? null;
    const idempotencyKey = body.idempotency_key ?? null;
    const attribution = body.attribution && typeof body.attribution === "object" ? body.attribution : {};

    if (!eventType || !campaignId || !providerId) {
      return NextResponse.json(
        { data: null, error: { message: "event_type, campaign_id, and provider_id are required", code: "VALIDATION" } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: campaign } = await supabase
      .from("ads_campaigns")
      .select("id, status, funded_at")
      .eq("id", campaignId)
      .eq("provider_id", providerId)
      .maybeSingle();
    // Billable events (impression/click) only count while the campaign is active
    // AND funded (serve-time guard, migration 664). 'book' is post-click
    // conversion attribution, so it is always allowed.
    const isServing = campaign?.status === "active" && campaign?.funded_at != null;
    if (!campaign || (eventType !== "book" && !isServing)) {
      return NextResponse.json(
        { data: null, error: { message: "Campaign not found or inactive", code: "NOT_FOUND" } },
        { status: 404 }
      );
    }

    const key = idempotencyKey ?? `public:${eventType}:${campaignId}:${providerId}:${Date.now()}`;
    const { error } = await supabase.from("ads_events").insert({
      campaign_id: campaignId,
      provider_id: providerId,
      event_type: eventType,
      idempotency_key: key,
      attribution: { source: "public_api", ...attribution },
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ data: { recorded: false, duplicate: true }, error: null });
      }
      throw error;
    }
    return NextResponse.json({ data: { recorded: true }, error: null });
  } catch (error: unknown) {
    console.warn("Ads event record failed:", error);
    return NextResponse.json(
      { data: { recorded: false }, error: { message: "Failed to record ad event", code: "ADS_EVENT_FAILED" } },
      { status: 500 }
    );
  }
}
