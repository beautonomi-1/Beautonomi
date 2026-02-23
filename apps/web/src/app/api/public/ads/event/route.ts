/**
 * POST /api/public/ads/event - Record ad event (click or book) from customer app.
 * Body: { event_type: 'click' | 'book', campaign_id, provider_id, idempotency_key?, attribution? }
 */

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = body.event_type === "click" || body.event_type === "book" ? body.event_type : null;
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
    const key = idempotencyKey ?? `public:${eventType}:${campaignId}:${providerId}:${Date.now()}`;
    const { error } = await supabase.from("ads_events").upsert(
      {
        campaign_id: campaignId,
        provider_id: providerId,
        event_type: eventType,
        idempotency_key: key,
        attribution: { ...attribution, source: "public_api" },
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    );

    if (error) throw error;
    return NextResponse.json({ data: { recorded: true }, error: null });
  } catch (error: any) {
    console.warn("Ads event record failed:", error);
    return NextResponse.json(
      { data: null, error: { message: error?.message ?? "Failed to record event", code: "INTERNAL" } },
      { status: 500 }
    );
  }
}
