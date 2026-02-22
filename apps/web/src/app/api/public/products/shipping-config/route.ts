import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/products/shipping-config?provider_id=...
 * Public endpoint: returns shipping config for a given provider
 */
export async function GET(request: NextRequest) {
  try {
    const providerId = request.nextUrl.searchParams.get("provider_id");
    if (!providerId) {
      return NextResponse.json(
        { error: "provider_id is required" },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServer();

    const { data, error } = await (supabase.from("provider_shipping_config") as any)
      .select("offers_delivery, offers_collection, delivery_fee, free_delivery_threshold, delivery_radius_km, estimated_delivery_days, delivery_notes, collection_notes")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;

    const config = data ?? {
      offers_delivery: false,
      offers_collection: true,
      delivery_fee: 0,
      free_delivery_threshold: null,
      delivery_radius_km: null,
      estimated_delivery_days: 3,
      delivery_notes: null,
      collection_notes: null,
    };

    return NextResponse.json({ data: { shipping: config } });
  } catch (err) {
    console.error("Error fetching public shipping config:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
