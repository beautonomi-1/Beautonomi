import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * GET /api/public/provider-locations?provider_id=...
 * Public endpoint: returns active locations for a given provider (by ID).
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

    const { data: locations, error } = await supabase
      .from("provider_locations")
      .select("id, name, address_line1, address_line2, city, state, postal_code, country, phone, email, is_primary, latitude, longitude")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: { locations: locations ?? [] } });
  } catch (err) {
    console.error("Error fetching provider locations:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
