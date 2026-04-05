import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicTenant } from "@/lib/tenant/require-public-tenant";

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

    const tenantRes = await requirePublicTenant(request);
    if (tenantRes instanceof Response) {
      return tenantRes;
    }
    const { tenantId } = tenantRes;

    const supabase = getSupabaseAdmin();

    const { data: prov, error: provErr } = await supabase
      .from("providers")
      .select("id")
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (provErr || !prov) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    let locations: any[] | null = null;
    const primaryQuery = (supabase.from("provider_locations") as any)
      .select("id, name, address_line1, address_line2, city, state, postal_code, country, is_primary, latitude, longitude")
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .eq("location_type", "salon")
      .order("is_primary", { ascending: false });
    const { data: strictLocations, error } = await primaryQuery;

    if (error?.code === "42703") {
      // Backward-compatible fallback for DBs that do not have provider_locations.location_type yet.
      const { data: legacyLocations, error: legacyError } = await (supabase
        .from("provider_locations") as any)
        .select("id, name, address_line1, address_line2, city, state, postal_code, country, is_primary, latitude, longitude")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false });
      if (legacyError) throw legacyError;
      locations = legacyLocations ?? [];
    } else {
      if (error) throw error;
      locations = strictLocations ?? [];
    }

    return NextResponse.json({ data: { locations: locations ?? [] } });
  } catch (err) {
    console.error("Error fetching provider locations:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
